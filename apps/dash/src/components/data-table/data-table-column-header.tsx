import type { Column } from "@tanstack/react-table";
import { Button } from "@shared/ui";
import { cn } from "@shared";

type DataTableColumnHeaderProps<TData, TValue> = {
  column: Column<TData, TValue>;
  title: string;
  className?: string;
};

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <span className={cn("font-medium text-slate-700", className)}>{title}</span>;
  }

  const sorted = column.getIsSorted();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("-ml-4 px-3 font-semibold text-slate-700 hover:text-slate-900", className)}
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      <span>{title}</span>
      <SortIcon direction={sorted} />
    </Button>
  );
}

function SortIcon({ direction }: { direction: false | "asc" | "desc" }) {
  if (!direction) {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
        className="size-3 text-slate-400"
        focusable="false"
      >
        <path
          d="M3.5 4.5L6 2l2.5 2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M3.5 7.5L6 10l2.5-2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  const isAscending = direction === "asc";

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className="size-3 text-slate-500"
      focusable="false"
    >
      {isAscending ? (
        <path
          d="M3.5 7.5L6 10l2.5-2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M3.5 4.5L6 2l2.5 2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
