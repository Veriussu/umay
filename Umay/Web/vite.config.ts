import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: Number(process.env.VITE_WEB_PORT || 9056),
    strictPort: true,
    allowedHosts: true
  },
  preview: {
    host: "0.0.0.0",
    port: Number(process.env.VITE_WEB_PORT || 9056),
    strictPort: true,
    allowedHosts: true
  },
  build: {
    sourcemap: false,
    minify: "esbuild",
    target: "es2022"
  }
});
