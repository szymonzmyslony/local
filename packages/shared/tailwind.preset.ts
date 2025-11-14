import type { Config } from "tailwindcss";

const sharedPreset = {
  safelist: [
    // Button primitives
    "inline-flex",
    "items-center",
    "justify-center",
    "gap-2",
    "rounded-md",
    "text-sm",
    "font-medium",
    "transition-colors",
    "focus-visible:outline-none",
    "focus-visible:ring-2",
    "focus-visible:ring-offset-2",
    "disabled:pointer-events-none",
    "disabled:opacity-60",
    "bg-blue-600",
    "text-white",
    "hover:bg-blue-500",
    "focus-visible:ring-blue-600",
    "bg-slate-100",
    "text-slate-900",
    "hover:bg-slate-200",
    "focus-visible:ring-slate-400",
    "bg-slate-50",
    "text-slate-600",
    "hover:bg-slate-100",
    "focus-visible:ring-slate-300",
    "border",
    "border-slate-300",
    "text-slate-700",
    "hover:bg-slate-50",
    "bg-transparent",
    "h-10",
    "px-4",
    "py-2",
    "h-8",
    "px-3",
    "text-xs",
    "h-12",
    "px-6",
    "text-base",
    // Shared tokens used by shadcn primitives
    "bg-secondary",
    "text-secondary-foreground",
    "bg-primary",
    "text-primary-foreground",
    "bg-muted",
    "text-muted-foreground",
    "bg-popover",
    "text-popover-foreground",
    "ring-ring/50",
    "focus-visible:ring-ring/50",
    "focus-visible:ring-[3px]",
    "focus-visible:border-ring",
    "border-input",
    "shadow-xs",
    "shadow-sm",
    "shadow-md",
    "shadow-lg",
    "data-[state=open]:animate-in",
    "data-[state=closed]:animate-out",
    "data-[side=bottom]:slide-in-from-top-2",
    "data-[side=left]:slide-in-from-right-2",
    "data-[side=right]:slide-in-from-left-2",
    "data-[side=top]:slide-in-from-bottom-2",
    "data-[placeholder]:text-muted-foreground",
    "data-[size=default]:h-9",
    "data-[size=sm]:h-8",
    "*:data-[slot=select-value]:line-clamp-1",
    "*:data-[slot=select-value]:flex",
    "*:data-[slot=select-value]:items-center",
    "*:data-[slot=select-value]:gap-2",
    "[&_svg]:pointer-events-none",
    "[&_svg]:shrink-0",
    "[&_svg:not([class*='size-'])]:size-4",
    "data-[state=open]:zoom-in-95",
    "data-[state=closed]:zoom-out-95",
    "data-[state=open]:fade-in-0",
    "data-[state=closed]:fade-out-0"
  ],
  theme: {
    extend: {
      colors: {
        // Design System Colors
        primary: {
          DEFAULT: "var(--color-primary)",
          dark: "var(--color-primary-dark)",
          foreground: "var(--color-primary-foreground)"
        },
        secondary: {
          DEFAULT: "var(--color-secondary)",
          dark: "var(--color-secondary-dark)",
          foreground: "var(--color-secondary-foreground)"
        },
        // Neutral Grays
        neutral: {
          50: "var(--color-neutral-50)",
          100: "var(--color-neutral-100)",
          200: "var(--color-neutral-200)",
          300: "var(--color-neutral-300)",
          400: "var(--color-neutral-400)",
          500: "var(--color-neutral-500)",
          600: "var(--color-neutral-600)",
          700: "var(--color-neutral-700)",
          800: "var(--color-neutral-800)",
          900: "var(--color-neutral-900)"
        },
        // Text Colors
        text: {
          primary: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          tertiary: "var(--color-text-tertiary)"
        },
        // Background Colors
        background: {
          DEFAULT: "var(--color-background)",
          muted: "var(--color-background-muted)"
        },
        // Legacy colors for compatibility
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        foreground: "hsl(var(--foreground))",
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))"
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))"
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))"
        }
      },
      borderRadius: {
        sm: "var(--radius-sm)", // 4px
        md: "var(--radius-md)", // 8px
        lg: "var(--radius-lg)", // 16px
        xl: "var(--radius-xl)", // 24px
        "2xl": "var(--radius-2xl)" // 32px
      },
      fontFamily: {
        body: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        heading: ["var(--font-heading)", "ui-monospace", "monospace"],
        sans: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-heading)", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" }
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" }
        }
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out"
      }
    }
  }
} satisfies Config;

export default sharedPreset;
