import { useMemo, useState, type ReactNode } from "react";
import type {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  RowSelectionState,
  OnChangeFn
} from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Table as TableInstance
} from "@tanstack/react-table";
import { Button, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@shared/ui";
import { cn } from "@shared";

type ColumnMeta = {
  headerClassName?: string;
  cellClassName?: string;
};

type DataTableProps<TData> = {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  /**
   * Called with the table instance to render toolbar controls (search, filters).
   */
  renderToolbar?: (table: TableInstance<TData>) => ReactNode;
  /**
   * Called with the table instance to render a custom footer.
   * When omitted, the default pagination footer is shown.
   */
  renderFooter?: (table: TableInstance<TData>) => ReactNode;
  /**
   * Text displayed when the filtered result set is empty.
   */
  emptyMessage?: string;
  /**
   * Optional custom className for the wrapper.
   */
  className?: string;
  /**
   * Optional callback for providing stable row IDs.
   */
  getRowId?: (originalRow: TData, index: number) => string;
  enableRowSelection?: boolean;
  /**
   * Controlled row selection state. When provided, the table will respect this value.
   */
  rowSelection?: RowSelectionState;
  /**
   * Called whenever row selection changes. Useful when controlling selection state.
   */
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
};

export function DataTable<TData>({
  columns,
  data,
  renderToolbar,
  renderFooter,
  emptyMessage = "No results found.",
  className,
  getRowId,
  enableRowSelection = false,
  rowSelection: controlledRowSelection,
  onRowSelectionChange
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [uncontrolledRowSelection, setUncontrolledRowSelection] = useState<RowSelectionState>({});

  const rowSelection = controlledRowSelection ?? uncontrolledRowSelection;
  const handleRowSelectionChange = onRowSelectionChange ?? setUncontrolledRowSelection;

  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: handleRowSelectionChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableRowSelection
  });

  const footer = useMemo(
    () =>
      renderFooter
        ? renderFooter(table)
        : (
          <DataTablePagination table={table} />
        ),
    [renderFooter, table]
  );

  return (
    <div className={cn("space-y-4", className)}>
      {renderToolbar ? renderToolbar(table) : null}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <Table>
          <TableHead>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map(header => {
                  const meta = resolveMeta(header.column.columnDef.meta);
                  return (
                    <TableHeaderCell key={header.id} className={cn(meta.headerClassName)}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHeaderCell>
                  );
                })}
              </TableRow>
            ))}
          </TableHead>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map(row => (
                <TableRow key={row.id} data-state={row.getIsSelected() ? "selected" : undefined}>
                  {row.getVisibleCells().map(cell => {
                    const meta = resolveMeta(cell.column.columnDef.meta);
                    return (
                      <TableCell key={cell.id} className={cn(meta.cellClassName)}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-slate-500">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {footer}
    </div>
  );
}

function resolveMeta(meta: unknown): ColumnMeta {
  if (!meta || typeof meta !== "object") {
    return {};
  }
  const value = meta as ColumnMeta;
  return {
    headerClassName: value.headerClassName,
    cellClassName: value.cellClassName
  };
}

type DataTablePaginationProps<TData> = {
  table: TableInstance<TData>;
};

export function DataTablePagination<TData>({ table }: DataTablePaginationProps<TData>) {
  const pageSize = table.getState().pagination.pageSize;
  const totalRows = table.getFilteredRowModel().rows.length;
  const pageCount = table.getPageCount();
  const pageIndex = table.getState().pagination.pageIndex;

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase text-slate-400">Rows</span>
        <select
          value={pageSize}
          onChange={event => table.setPageSize(Number(event.target.value))}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          {[10, 20, 30, 50].map(size => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <span className="hidden md:inline">|</span>
        <span>{totalRows} total</span>
      </div>
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-slate-500">
          Page {pageIndex + 1} of {pageCount || 1}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="muted"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="muted"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
