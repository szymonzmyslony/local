import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@shared";

type LeftDrawerProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
};

export function LeftDrawer({
  open,
  onClose,
  title,
  children,
  className,
  footer
}: LeftDrawerProps) {
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = originalOverflow;
    }
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (!open) return;
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-0 z-50 flex",
        open ? "pointer-events-auto" : "pointer-events-none"
      )}
      aria-hidden={!open}
    >
      <div
        className={cn(
          "transition-opacity duration-200",
          open ? "pointer-events-auto opacity-100" : "opacity-0"
        )}
        role="presentation"
        onClick={onClose}
        aria-hidden="true"
      >
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm" />
      </div>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 flex w-full max-w-xs flex-col border-r border-slate-200 bg-white shadow-xl transition-transform duration-300 sm:max-w-sm dark:border-slate-800 dark:bg-slate-900",
          open ? "translate-x-0" : "-translate-x-full",
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {title ?? "Details"}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-500 transition-colors hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-400 dark:hover:text-slate-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-6">{children}</div>
        {footer ? (
          <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">
            {footer}
          </div>
        ) : null}
      </aside>
    </div>
  );
}

