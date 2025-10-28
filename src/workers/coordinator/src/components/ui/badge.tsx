import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  variant = "default",
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "secondary" | "destructive" | "outline";
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2",
        {
          "border-transparent bg-blue-500 text-white": variant === "default",
          "border-transparent bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100":
            variant === "secondary",
          "border-transparent bg-red-500 text-white": variant === "destructive",
          "text-neutral-950 dark:text-neutral-50": variant === "outline",
        },
        className
      )}
      {...props}
    />
  );
}
