import type { ReactNode } from "react";

type LinkRowComponentProps = {
  href: string;
  label: string;
  description?: string;
  leading?: ReactNode;
};

export function LinkRowComponent({ href, label, description, leading }: LinkRowComponentProps) {
  return (
    <a className="link-row" href={href} target="_blank" rel="noreferrer">
      {leading ? <span className="link-row__leading">{leading}</span> : null}
      <span className="link-row__content">
        <span className="link-row__label">{label}</span>
        {description ? <span className="link-row__description">{description}</span> : null}
      </span>
      <span className="link-row__icon" aria-hidden="true">
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
