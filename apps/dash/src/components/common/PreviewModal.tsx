import type { ReactNode } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@shared/ui";

type PreviewModalProps = {
  title: string;
  content?: ReactNode;
  markdown?: string | null;
  onClose: () => void;
  footer?: ReactNode;
};

export function PreviewModal({ title, content, markdown, onClose, footer }: PreviewModalProps) {
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {markdown !== undefined ? (
            <pre className="max-h-[60vh] overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
              {markdown ?? "No content available."}
            </pre>
          ) : (
            <div className="text-sm text-slate-700">{content}</div>
          )}
        </div>
        <DialogFooter className="mt-4 flex flex-wrap justify-end gap-2">
          {footer}
          <Button type="button" variant="muted" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
