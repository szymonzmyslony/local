import type { ReactNode } from "react";
import { Modal } from "../modal";

export type PreviewDialogItem = {
  title: string;
  content: string | null;
};

type PreviewDialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  items: PreviewDialogItem[];
  emptyMessage?: string;
};

export function PreviewDialog({
  open,
  onClose,
  title,
  description,
  items,
  emptyMessage = "No content available."
}: PreviewDialogProps) {
  return (
    <Modal
      open={open}
      onOpenChange={value => {
        if (!value) onClose();
      }}
      onClose={onClose}
      title={title}
      description={description}
      size="lg"
      hideDefaultClose
      footer={
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          Close
        </button>
      }
    >
      <div className="space-y-4">
        {items.length === 0 ? (
          <EmptyState>{emptyMessage}</EmptyState>
        ) : (
          items.map((item, index) => (
            <section key={`${item.title}-${index}`} className="space-y-2">
              <header className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                {items.length > 1 ? (
                  <span className="text-xs text-slate-400">#{index + 1}</span>
                ) : null}
              </header>
              <pre className="max-h-[50vh] overflow-y-auto rounded-xl bg-slate-50 p-4 text-xs text-slate-700 shadow-inner">
                {item.content ?? "No content available."}
              </pre>
            </section>
          ))
        )}
      </div>
    </Modal>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}
