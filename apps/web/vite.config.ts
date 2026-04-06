import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@atlas-v1/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // В dev фронт ходит на /api/* → тот же origin, без CORS (Failed to fetch из-за cross-origin бывает даже на localhost).
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "") || "/",
      },
    },
  },
});
