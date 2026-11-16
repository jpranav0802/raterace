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
  server: { port: 5173, strictPort: true, host: true },
});
