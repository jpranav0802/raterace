import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // Read VITE_* variables from the repo root .env (written by "npm run deploy").
  envDir: "..",
  // host: true also serves the app to phones on the same Wi-Fi (http://<this computer's IP>:5173).
  // The router and the indexer are forwarded under /_router and /_indexer, so a phone (or a
  // public tunnel such as cloudflared) only ever needs this one address.
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    allowedHosts: [".trycloudflare.com", ".ngrok-free.app", ".ngrok.app"],
    proxy: {
      "/_router": { target: "http://localhost:8787", changeOrigin: true, rewrite: (p) => p.replace(/^\/_router/, "") },
      "/_indexer": { target: "http://localhost:8790", changeOrigin: true, rewrite: (p) => p.replace(/^\/_indexer/, "") },
    },
  },
});
