import type { Config } from "tailwindcss";
import sharedPreset from "../../packages/shared/tailwind.preset";

export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx,js,jsx}",
    "../dash/src/**/*.{ts,tsx,js,jsx}",
    "../../packages/shared/src/ui/**/*.{ts,tsx}"
  ],
  presets: [sharedPreset],
  safelist: sharedPreset.safelist,
  theme: {
    extend: {}
  }
} satisfies Config;
