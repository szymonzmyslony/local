import type { Config } from "tailwindcss";

export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx,js,jsx}",
    "../../packages/shared/src/ui/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {}
  }
} satisfies Config;
