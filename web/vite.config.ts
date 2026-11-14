import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Read VITE_* variables from the repo root .env (written by "npm run deploy").
  envDir: "..",
  server: { port: 5173, strictPort: true },
});
