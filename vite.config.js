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
let ensured = false;

function previewServesBuiltFile() {
  const LOCAL_HOSTS = new Set(["", "localhost", "127.0.0.1", "::1", "0.0.0.0"]);
  return {
    name: "coauds-preview-static",
    apply: "serve",
    buildStart() {
      /* Fresh sandbox: no dist yet → the rescue below would have nothing
       * to serve. Kick off a one-shot production build in the background
       * so the single file materializes within seconds of dev startup. */
      if (ensured) return;
      ensured = true;
      const distIndex = path.join(process.cwd(), "dist", "index.html");
      if (!fs.existsSync(distIndex)) {
        console.log("[coauds] dist/ missing — building the single-file bundle in the background…");
        const child = spawn("npm", ["run", "build"], {
          cwd: process.cwd(),
          stdio: "ignore",
          detached: true,
          shell: process.platform === "win32",
        });
        child.unref();
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const host = String(req.headers.host || "").split(":")[0].toLowerCase();
        if (LOCAL_HOSTS.has(host)) return next();
        const url = (req.url || "").split("?")[0];
        if (url === "/" || url === "/index.html") {
          const distIndex = path.join(process.cwd(), "dist", "index.html");
          if (fs.existsSync(distIndex)) {
            res.statusCode = 200;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.setHeader("Cache-Control", "no-store");
            res.setHeader("X-CoAudS-Served-By", "dist/index.html (single-file)");
            res.end(fs.readFileSync(distIndex));
            return;
          }
        }
        next();
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
