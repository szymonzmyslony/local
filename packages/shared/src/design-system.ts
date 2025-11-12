/**
 * Design System Tokens
 * 
 * This file defines the design system used throughout the application.
 * All design decisions should reference these tokens for consistency.
 */

// ============================================================================
// Colors
// ============================================================================

export const colors = {
  // Primary Palette
  primary: {
    DEFAULT: "#D8D3FA",
    dark: "#C8C3EA",
    foreground: "#1e1b4b", // Dark text on primary background
  },

  // Secondary/Accent Colors
  secondary: {
    DEFAULT: "#E8E4FA", // Lighter purple variant
    dark: "#B8B3DA", // Darker purple variant
  },

  // Neutral Grays
  neutral: {
    50: "#FAFAFA",
    100: "#F5F5F5",
    200: "#E5E5E5",
    300: "#D4D4D4",
    400: "#A3A3A3",
    500: "#737373",
    600: "#525252",
    700: "#404040",
    800: "#262626",
    900: "#171717",
  },

  // Text Colors
  text: {
    primary: "#171717", // Neutral 900 - for headings
    secondary: "#404040", // Neutral 700 - for body text
    tertiary: "#737373", // Neutral 500 - for captions/labels
  },

  // Background Colors
  background: {
    DEFAULT: "#FFFFFF",
    muted: "#FAFAFA", // Neutral 50
    card: "#FFFFFF",
  },
} as const;

// ============================================================================
// Typography
// ============================================================================

export const typography = {
  // Font Families
  fonts: {
    body: '"Helvetica Neue", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    heading: '"IBM Plex Mono", "Courier New", monospace',
  },

  // Font Sizes (preferred: xs)
  sizes: {
    xs: "0.75rem", // 12px
    sm: "0.875rem", // 14px
    base: "1rem", // 16px
    lg: "1.125rem", // 18px
    xl: "1.25rem", // 20px
    "2xl": "1.5rem", // 24px
    "3xl": "1.875rem", // 30px
    "4xl": "2.25rem", // 36px
  },

  // Font Weights
  weights: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  // Line Heights
  lineHeights: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

// ============================================================================
// Spacing Scale
// ============================================================================

export const spacing = {
  1: "0.25rem", // 4px
  2: "0.5rem", // 8px
  3: "0.75rem", // 12px
  4: "1rem", // 16px
  6: "1.5rem", // 24px
} as const;

// ============================================================================
// Border Radius
// ============================================================================

export const borderRadius = {
  sm: "0.25rem", // 4px
  md: "0.5rem", // 8px
  lg: "1rem", // 16px
  xl: "1.5rem", // 24px
  "2xl": "2rem", // 32px
} as const;

// ============================================================================
// Components
// ============================================================================

export const components = {
  // Buttons
  button: {
    size: "sm", // Always small
    height: {
      sm: "2rem", // 32px
    },
    padding: {
      x: "0.75rem", // 12px
      y: "0.5rem", // 8px
    },
    borderRadius: borderRadius.md, // 8px
    variants: {
      filled: {
        backgroundColor: colors.primary.DEFAULT,
        color: colors.primary.foreground,
        hover: {
          backgroundColor: colors.primary.dark,
        },
      },
      outline: {
        backgroundColor: "transparent",
        borderColor: colors.primary.DEFAULT,
        color: colors.primary.DEFAULT,
        hover: {
          backgroundColor: `${colors.primary.DEFAULT}10`, // 10% opacity
        },
      },
      ghost: {
        backgroundColor: "transparent",
        color: colors.text.secondary,
        hover: {
          backgroundColor: colors.background.muted,
        },
      },
    },
  },

  // Cards
  card: {
    borderRadius: borderRadius.lg, // 16px
    padding: spacing[6], // 24px
    backgroundColor: colors.background.card,
    border: {
      color: colors.neutral[200],
      width: "1px",
    },
    shadow: {
      sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
      md: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
    },
  },
} as const;

// ============================================================================
// Type Exports
// ============================================================================

export type ColorKey = keyof typeof colors;
export type TypographySize = keyof typeof typography.sizes;
export type SpacingKey = keyof typeof spacing;
export type BorderRadiusKey = keyof typeof borderRadius;
export type ButtonVariant = keyof typeof components.button.variants;

