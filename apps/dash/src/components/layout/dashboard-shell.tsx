import type { ReactNode } from "react";
import { cn } from "@shared";

type DashboardShellProps = {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  /**
   * Optional actions rendered on the right side of the header.
   */
  actions?: ReactNode;
  /**
   * Optional inline element rendered next to the title (used for status badges).
   */
  titleAside?: ReactNode;
  /**
   * Optional content rendered below the main header (e.g. navigation tabs).
   */
  headerContent?: ReactNode;
  /**
   * Controls the max-width of the shell container.
   */
  maxWidth?: "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "6xl" | "7xl";
  className?: string;
};

const widthMap: Record<NonNullable<DashboardShellProps["maxWidth"]>, string> = {
  lg: "max-w-4xl",
  xl: "max-w-5xl",
  "2xl": "max-w-6xl",
  "3xl": "max-w-7xl",
  "4xl": "max-w-5xl md:max-w-6xl",
  "5xl": "max-w-6xl md:max-w-7xl",
  "6xl": "max-w-7xl",
  "7xl": "max-w-[90rem]"
};

export function DashboardShell({
  title,
  subtitle,
  actions,
  titleAside,
  headerContent,
  maxWidth = "6xl",
  className,
  children
}: DashboardShellProps) {
  return (
    <div className={cn("mx-auto w-full px-6 py-8", widthMap[maxWidth], className)}>
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
              {titleAside}
            </div>
            {subtitle ? <p className="text-sm text-slate-600">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
        {headerContent ? <div className="pt-2">{headerContent}</div> : null}
      </header>
      <main className="py-6">{children}</main>
    </div>
  );
}
