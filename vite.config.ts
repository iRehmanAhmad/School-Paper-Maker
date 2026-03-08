import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  base: process.env.VITE_BASE_PATH || "/",
  build: {
    sourcemap: false,
    target: "es2022",
    chunkSizeWarningLimit: 1200,
  },
});
