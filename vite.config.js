import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Document-relative by default so the bundle loads whether the app is
  // served at a domain root, a preview subpath, or GitHub Pages (where the
  // deploy workflow sets VITE_BASE=/<repo>/ explicitly).
  base: process.env.VITE_BASE || "./",
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    hmr: {
      port: 3000,
    },
  },
});
