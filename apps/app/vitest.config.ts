import path from "node:path";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@gallery-agents/shared": path.resolve(
        import.meta.dirname,
        "../../packages/shared/src"
      ),
      "@shared": path.resolve(import.meta.dirname, "../../packages/shared/src")
    }
  },
  test: {
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: ["ajv"]
        }
      }
    }
  }
});
