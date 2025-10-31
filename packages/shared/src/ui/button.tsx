"use client";

import type { ButtonHTMLAttributes } from "react";
import { forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "../utils/cn";

export type ButtonVariant = "primary" | "secondary" | "muted" | "outline" | "ghost";
export type ButtonSize = "default" | "sm" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "default", asChild = false, ...props },
  ref
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60",
        size === "default" && "h-10 px-4 py-2",
        size === "sm" && "h-8 px-3 text-xs",
        size === "lg" && "h-12 px-6 text-base",
        variant === "primary" && "bg-blue-600 text-white hover:bg-blue-500 focus-visible:ring-blue-600",
        variant === "secondary" && "bg-slate-100 text-slate-900 hover:bg-slate-200 focus-visible:ring-slate-400",
        variant === "muted" && "bg-slate-50 text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-300",
        variant === "outline" && "border border-slate-300 text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-300",
        variant === "ghost" && "bg-transparent text-slate-700 hover:bg-slate-100 focus-visible:ring-slate-300",
        className
      )}
      {...props}
    />
  );
});
