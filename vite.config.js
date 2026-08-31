import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

/* Preview rescue — the proxied dev server is the weakest link.
 *
 * Sandbox preview hosts (*.preview.…) sit behind a proxy that frequently
 * cannot complete Vite's on-the-fly module transforms (cold esbuild
 * compiles stall past the 30s boot watchdog → "boot phase reached: html").
 * When the request comes from a NON-local Host header AND a production
 * build exists, serve the self-contained dist/index.html instead of the
 * dev pipeline. The single file has zero secondary fetches, so it cannot
 * stall. Localhost keeps the genuine dev server (HMR, sources, maps).
 */
/* Proxy-aware dev rescue.
 *
 * This sandbox previews the app by proxying Vite's DEV server, and that
 * proxy cannot complete the on-demand module transforms — the HTML arrives
 * but every /src/*.js request stalls, so the page hangs at the boot
 * spinner and the watchdog eventually reports "phase: html".
 *
 * The fix: any request whose Host is NOT localhost bypasses the dev
 * pipeline entirely and gets the self-contained production bundle
 * (dist/index.html, everything inlined). The real HMR dev loop is
 * untouched for localhost.
 *
 * dist/ may not exist on a fresh boot, so the plugin builds it once with
 * full completion tracking and a tiny state machine:
 *   ready    → serve dist/index.html for every path (SPA-style)
 *   building → serve an auto-refresh page (browser polls until done)
 *   failed   → rebuild on next request + error page with a retry link
 */
let buildState = "ready"; // "ready" | "building" | "failed"
let buildPromise = null;

function previewServesBuiltFile() {
  const LOCAL_HOSTS = new Set(["", "localhost", "127.0.0.1", "::1", "0.0.0.0"]);
  const distIndex = () => path.join(process.cwd(), "dist", "index.html");

  const ensureBuilt = () => {
    if (fs.existsSync(distIndex())) {
      buildState = "ready";
      return Promise.resolve();
    }
    if (buildPromise) return buildPromise;
    buildState = "building";
    console.log("[coauds] dist/index.html missing — building single-file bundle…");
    buildPromise = new Promise((resolve) => {
      const child = spawn("npm", ["run", "build"], {
        cwd: process.cwd(),
        stdio: "inherit",
        shell: process.platform === "win32",
      });
      const finish = (ok, detail) => {
        buildState = ok ? "ready" : "failed";
        buildPromise = null;
        console.log(ok
          ? "[coauds] single-file bundle ready — proxied previews served statically"
          : `[coauds] build failed (${detail}) — will retry on next request`);
        resolve();
      };
      child.on("close", (code) => finish(code === 0 && fs.existsSync(distIndex()), `exit ${code}`));
      child.on("error", (err) => finish(false, err.message));
    });
    return buildPromise;
  };

  return {
    name: "coauds-preview-static",
    apply: "serve",
    configureServer(server) {
      ensureBuilt(); // warm the artifact as soon as the server starts

      server.middlewares.use((req, res, next) => {
        const host = String(req.headers.host || "").split(":")[0].toLowerCase();
        if (LOCAL_HOSTS.has(host)) return next(); // localhost keeps HMR

        const sendBuilt = () => {
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("X-CoAudS-Served-By", "dist/index.html (single-file)");
          res.end(fs.readFileSync(distIndex()));
        };
        const sendBuilding = () => {
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("X-CoAudS-Served-By", "building");
          res.end(
            `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="2">` +
            `<title>AI CoAudS — building</title></head>` +
            `<body style="margin:0;background:#060b14;color:#587099;font-family:'IBM Plex Mono',monospace;display:flex;min-height:100vh;align-items:center;justify-content:center">` +
            `<div style="text-align:center;font-size:11px;letter-spacing:.14em;text-transform:uppercase">` +
            `<div style="width:34px;height:34px;margin:0 auto 16px;border-radius:50%;border:2px solid #1a2a45;border-top-color:#38bdf8;animation:spin .9s linear infinite"></div>` +
            `compiling single-file bundle…<br>` +
            `<span style="text-transform:none;letter-spacing:.02em;color:#3d5480">auto-refreshes when ready</span></div>` +
            `<style>@keyframes spin{to{transform:rotate(360deg)}}</style></body></html>`
          );
        };
        const sendFailed = () => {
          res.statusCode = 503;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("X-CoAudS-Served-By", "build-failed");
          res.end(
            `<!doctype html><html><body style="margin:0;background:#060b14;color:#f87171;font-family:'IBM Plex Mono',monospace;display:flex;min-height:100vh;align-items:center;justify-content:center">` +
            `<div style="text-align:center;font-size:12.5px;line-height:1.8;max-width:520px;padding:24px">` +
            `<b style="color:#fca5a5">single-file build failed</b> — rebuilding in the background.<br>` +
            `<a href="javascript:location.reload()" style="color:#38bdf8">retry now</a></div></body></html>`
          );
        };

        if (buildState === "ready" && fs.existsSync(distIndex())) return sendBuilt();
        if (buildState === "building") { ensureBuilt(); return sendBuilding(); }
        // failed (or missing after a clean) → rebuild + error page
        ensureBuilt();
        return sendFailed();
      });
    },
  };
}

/* Self-contained build.
 *
 * Preview/proxy environments frequently hang, 404, or CORS-block the
 * separate /assets/*.js request while index.html itself arrives fine —
 * the app then never boots ("boot phase reached: html"). To make that
 * failure class impossible, the production build inlines the entry JS
 * and CSS directly into dist/index.html. Dynamic imports are folded into
 * the entry chunk, so the served console is exactly ONE file (plus fonts,
 * which degrade gracefully via display=swap).
 */
function inlineIntoHtml() {
  return {
    name: "coauds-inline-html",
    apply: "build",
    enforce: "post",
    generateBundle(_, bundle) {
      const htmlAsset = bundle["index.html"];
      if (!htmlAsset || htmlAsset.type !== "asset") return;
      let html = String(htmlAsset.source);

      /* Inject by SLICING, never with String.replace(template):
       * the bundle legitimately contains "$&" sequences (React's
       * escapeUserProvidedKey), and a template replacement would expand
       * them into the matched tag — corrupting the code and breaking
       * HTML parsing mid-script. */
      const injectScript = (doc, code) => {
        const start = doc.search(/<script\b[^>]*?src="[^"]+"[^>]*>/i);
        if (start < 0) return doc;
        const end = doc.indexOf("</script>", start) + "</script>".length;
        return doc.slice(0, start) + `<script type="module">${code}</script>` + doc.slice(end);
      };
      const injectStyle = (doc, css) => {
        const start = doc.search(/<link\b[^>]*?href="[^"]+\.css"[^>]*>/i);
        if (start < 0) return doc;
        const end = doc.indexOf(">", start) + 1;
        return doc.slice(0, start) + `<style>${css}</style>` + doc.slice(end);
      };

      /* Tripwire: more than one JS chunk means a runtime import() survived
       * (someone re-added React.lazy or a manual dynamic import). In a
       * single-file build that second chunk would 404 at runtime, so fail
       * the build loudly instead of shipping a broken artifact. */
      const jsChunks = Object.keys(bundle).filter((n) => bundle[n].type === "chunk" && n.endsWith(".js"));
      if (jsChunks.length > 1) {
        this.error(`single-file build violated: ${jsChunks.length} JS chunks emitted (${jsChunks.join(", ")}). Remove dynamic imports or disable inlineIntoHtml().`);
      }

      for (const [name, item] of Object.entries(bundle)) {
        if (item.type === "chunk" && name.endsWith(".js")) {
          // neutralise any literal "</script>" inside the code itself
          const code = item.code.replace(/<\/script>/gi, "<\\/script>");
          html = injectScript(html, code);
          delete bundle[name];
        } else if (item.type === "asset" && name.endsWith(".css")) {
          const css = String(item.source).replace(/<\/style>/gi, "<\\/style>");
          html = injectStyle(html, css);
          delete bundle[name];
        }
      }
      htmlAsset.source = html;
    },
  };
}

export default defineConfig({
  // irrelevant once inlined, but keeps non-single-file fallbacks correct
  base: process.env.VITE_BASE || "./",
  plugins: [previewServesBuiltFile(), react(), tailwindcss(), inlineIntoHtml()],
  build: {
    modulePreload: false,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  /* `npm run dev` = build once, then serve dist/ STATICALLY via
   * `vite preview`. No transform pipeline, no per-module fetches, no HMR
   * websocket — the preview is exactly the shipped artifact. Real HMR
   * development lives on `npm run dev:hmr`. */
  preview: {
    host: true,
    port: 3000,
    strictPort: true,
    allowedHosts: true,
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    hmr: {
      port: 3000,
    },
    /* Preview environments proxy the dev server through external hostnames
     * (e.g. *.preview.qwenlm.io). Vite ≥6.1 rejects unknown Host headers by
     * default (DNS-rebinding protection), which 403s every module request —
     * surfacing as "Failed to fetch dynamically imported module". Allow all
     * hosts here: this server is a sandboxed dev preview, not production. */
    allowedHosts: true,
    // serve pre-transformed deps + friendlier errors through the proxy
    cors: true,
  },
});
