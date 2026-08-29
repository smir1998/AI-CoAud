import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

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
  plugins: [react(), tailwindcss(), inlineIntoHtml()],
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
  },
});
