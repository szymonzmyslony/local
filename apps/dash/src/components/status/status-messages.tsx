import type { ReactNode } from "react";
import { cn } from "@shared";

type StatusMessagesProps = {
  status?: string | null;
  error?: string | null;
  className?: string;
};

export function StatusMessages({ status, error, className }: StatusMessagesProps) {
  if (!status && !error) return null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {status ? <StatusBanner tone="info">{status}</StatusBanner> : null}
      {error ? <StatusBanner tone="danger">{error}</StatusBanner> : null}
    </div>
  );
}

function StatusBanner({ tone, children }: { tone: "info" | "danger"; children: ReactNode }) {
  const toneClass =
    tone === "info"
      ? "border-blue-200/80 bg-blue-50 text-blue-700"
      : "border-rose-200/80 bg-rose-50 text-rose-700";

  return (
    <div className={cn("rounded-md border px-3 py-2 text-sm font-medium", toneClass)}>
      {children}
    </div>
  );
}
