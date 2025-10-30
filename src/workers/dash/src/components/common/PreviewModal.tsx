import type { ReactNode } from "react";

type PreviewModalProps = {
  title: string;
  content?: ReactNode;
  markdown?: string | null;
  onClose: () => void;
  footer?: ReactNode;
};

export function PreviewModal({ title, content, markdown, onClose, footer }: PreviewModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal">
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="btn btn-muted" onClick={onClose}>
            Close
          </button>
        </div>
        {markdown !== undefined ? (
          <pre className="modal-body">{markdown ?? "No content available."}</pre>
        ) : (
          <div className="modal-body">{content}</div>
        )}
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
