import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [cloudflare(), react(), tailwindcss()],
  resolve: {
    alias: {
      // Local coordinator files (must come first for precedence)
      "@/components": path.resolve(__dirname, "./src/components"),
      "@/hooks": path.resolve(__dirname, "./src/hooks"),
      "@/lib": path.resolve(__dirname, "./src/lib"),
      "@/providers": path.resolve(__dirname, "./src/providers"),
      "@/shared": path.resolve(__dirname, "../../../src/shared"),
      "@/types": path.resolve(__dirname, "../../../src/types"),
      // Root shared files
      "@": path.resolve(__dirname, "../../../src")
    }
  }
});
