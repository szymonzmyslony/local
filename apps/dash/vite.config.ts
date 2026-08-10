import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [cloudflare(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@shared": path.resolve(import.meta.dirname, "../../packages/shared/src"),
      "@shared/ui": path.resolve(import.meta.dirname, "../../packages/shared/src/ui"),
      "@gallery-agents/shared": path.resolve(import.meta.dirname, "../../packages/shared/src"),
      "@gallery-agents/shared/ui": path.resolve(import.meta.dirname, "../../packages/shared/src/ui")
    }
  },
  build: {
    rollupOptions: {
      output: {
        preserveModules: false
      }
    }
  }
});
