import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@shared";
import { Button } from "@shared/ui";

type ModalSize = "sm" | "md" | "lg" | "xl";

type ModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  closeLabel?: string;
  showCloseButton?: boolean;
  /**
   * When provided, renders a secondary close button in the footer.
   */
  onClose?: () => void;
  /**
   * When true, the default close button in the footer is hidden.
   */
  hideDefaultClose?: boolean;
};

const sizeClass: Record<ModalSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-3xl"
};

export function Modal({
  open,
  onOpenChange,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  closeLabel = "Close",
  showCloseButton = true,
  hideDefaultClose = false
}: ModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!mounted || !open) {
    return null;
  }

  function handleClose(): void {
    onClose?.();
    onOpenChange(false);
  }

  const content = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div
        className={cn(
          "relative flex w-full flex-col gap-4 overflow-hidden rounded-2xl bg-white p-6 shadow-2xl",
          sizeClass[size]
        )}
      >
        {showCloseButton ? (
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute right-4 top-4 rounded-full bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200"
            onClick={handleClose}
          >
            ×
          </button>
        ) : null}
        <div className="space-y-1 pr-8">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {description ? <p className="text-sm text-slate-500">{description}</p> : null}
        </div>
        <div className="space-y-4 overflow-y-auto">
          {children}
        </div>
        {footer || !hideDefaultClose ? (
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-end">
            {footer}
            {hideDefaultClose ? null : (
              <Button type="button" variant="muted" onClick={handleClose}>
                {closeLabel}
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
