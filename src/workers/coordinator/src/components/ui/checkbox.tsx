import * as React from "react";
import { cn } from "@/lib/utils";

export function Checkbox({
  checked,
  onCheckedChange,
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "checked" | "onChange"> & {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      className={cn(
        "h-4 w-4 rounded border-neutral-300 dark:border-neutral-700 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-neutral-900 dark:focus:ring-offset-neutral-900",
        className
      )}
      {...props}
    />
  );
}
