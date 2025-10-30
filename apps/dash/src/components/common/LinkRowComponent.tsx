import type { ReactNode } from "react";

interface LinkRowComponentProps {
  href: string;
  label: string;
  description?: string;
  leading?: ReactNode;
}

export function LinkRowComponent({ href, label, description, leading }: LinkRowComponentProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left text-sm shadow-sm transition hover:border-slate-300 hover:shadow-md"
    >
      {leading ? <span className="text-slate-500">{leading}</span> : null}
      <span className="flex flex-1 flex-col gap-1">
        <span className="font-medium text-slate-900">{label}</span>
        {description ? (
          <span className="break-all text-xs text-slate-500">{description}</span>
        ) : null}
      </span>
      <span className="mt-1 text-slate-400" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M4.66699 4.66675H11.3337V11.3334"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4.66699 11.3334L11.3337 4.66675"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </a>
  );
}
