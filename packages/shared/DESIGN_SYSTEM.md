# Design System

This document outlines the design system used throughout the application. All components should follow these guidelines for consistency.

## Colors

### Primary Palette
- **Primary**: `#D8D3FA` - Main brand color
- **Primary Dark**: `#C8C3EA` - Hover states and darker variants
- **Primary Foreground**: `#1e1b4b` - Text color on primary backgrounds

### Secondary/Accent Colors
- **Secondary**: `#E8E4FA` - Lighter purple variant
- **Secondary Dark**: `#B8B3DA` - Darker purple variant

### Neutral Grays
- `neutral-50`: `#FAFAFA` - Lightest background
- `neutral-100`: `#F5F5F5` - Muted backgrounds
- `neutral-200`: `#E5E5E5` - Borders
- `neutral-300`: `#D4D4D4`
- `neutral-400`: `#A3A3A3`
- `neutral-500`: `#737373` - Tertiary text
- `neutral-600`: `#525252`
- `neutral-700`: `#404040` - Secondary text
- `neutral-800`: `#262626`
- `neutral-900`: `#171717` - Primary text

### Text Colors
- **Primary Text**: `#171717` - For headings
- **Secondary Text**: `#404040` - For body text
- **Tertiary Text**: `#737373` - For captions/labels

### Usage in Tailwind
```tsx
// Colors
className="text-primary"           // #D8D3FA
className="bg-primary-dark"         // #C8C3EA
className="text-text-primary"       // #171717
className="text-text-secondary"    // #404040
className="text-text-tertiary"     // #737373
className="bg-neutral-100"          // #F5F5F5
```

## Typography

### Font Families
- **Body**: `Helvetica Neue` - Used for all body text
- **Headings**: `IBM Plex Mono` - Used for all headings (h1-h6)

### Font Sizes
Preferred size: **xs** (12px)

Available sizes:
- `xs`: 0.75rem (12px)
- `sm`: 0.875rem (14px)
- `base`: 1rem (16px)
- `lg`: 1.125rem (18px)
- `xl`: 1.25rem (20px)
- `2xl`: 1.5rem (24px)

### Usage in Tailwind
```tsx
// Typography
<h1 className="font-heading text-lg">Heading</h1>
<p className="font-body text-xs">Body text</p>
```

## Spacing

Consistent spacing scale:
- `1`: 0.25rem (4px)
- `2`: 0.5rem (8px)
- `3`: 0.75rem (12px)
- `4`: 1rem (16px)
- `6`: 1.5rem (24px)

### Usage in Tailwind
```tsx
className="gap-2"    // 8px
className="p-4"      // 16px
className="mt-6"     // 24px
```

## Border Radius

Available border radius values:
- `sm`: 0.25rem (4px)
- `md`: 0.5rem (8px)
- `lg`: 1rem (16px)
- `xl`: 1.5rem (24px)
- `2xl`: 2rem (32px)

### Usage in Tailwind
```tsx
className="rounded-sm"   // 4px
className="rounded-md"   // 8px
className="rounded-lg"   // 16px
className="rounded-xl"   // 24px
className="rounded-2xl"  // 32px
```

## Components

### Buttons

**Size**: Always small (`sm`)

**Variants**:
- `filled` (primary) - Solid background with primary color
- `outline` - Transparent with border
- `ghost` - Transparent, no border

**Usage**:
```tsx
import { Button } from "@shared/ui";

<Button variant="primary" size="sm">Save</Button>
<Button variant="outline" size="sm">Cancel</Button>
<Button variant="ghost" size="sm">More</Button>
```

### Cards

**Styling**:
- Border radius: `rounded-lg` (16px)
- Padding: `p-6` (24px)
- Background: White or gradient
- Border: `border-neutral-200` (1px)
- Shadow: `shadow-sm` on default, `shadow-md` on hover

**Usage**:
```tsx
<div className="rounded-lg p-6 bg-white border border-neutral-200 shadow-sm hover:shadow-md">
  {/* Card content */}
</div>
```

## Best Practices

1. **Always use design system tokens** - Don't use hardcoded colors or values
2. **Consistent spacing** - Use the spacing scale (4px, 8px, 12px, 16px, 24px)
3. **Typography hierarchy** - Use `font-heading` for headings, `font-body` for body text
4. **Button consistency** - All buttons should be small size (`sm`)
5. **Color usage** - Use `text-primary` for primary actions, `text-text-secondary` for body text

## Browser Compatibility

All design system tokens are designed to work across modern browsers:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

Font fallbacks are included for maximum compatibility:
- Helvetica Neue → system fonts → sans-serif
- IBM Plex Mono → Courier New → monospace

