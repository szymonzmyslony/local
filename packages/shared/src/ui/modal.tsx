import { Fragment, type PropsWithChildren } from "react";
import { createPortal } from "react-dom";
import { cn } from "../utils/cn";

export interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title?: string;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: PropsWithChildren<ModalProps>) {
  if (typeof document === "undefined") return null;
  if (!open) return null;

  return createPortal(
    <Fragment>
      <div
        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
        <div className={cn("w-full max-w-2xl rounded-xl bg-white shadow-xl", className)}>
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            {title ? <h3 className="text-base font-semibold text-slate-900">{title}</h3> : <span />}
            {onClose ? (
              <button
                type="button"
                className="rounded-md p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                onClick={onClose}
                aria-label="Close"
              >
                ✕
              </button>
            ) : null}
          </div>
          <div className="max-h-[70vh] overflow-y-auto px-6 py-5 text-sm text-slate-700">
            {children}
          </div>
        </div>
      </div>
    </Fragment>,
    document.body
  );
}
