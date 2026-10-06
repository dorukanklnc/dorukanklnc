'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItemIndicator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Select,
  Skeleton,
  TBody,
  THead,
  Table,
  TableContainer,
  Td,
  Th,
  Tr,
  cn,
} from '@repo/ui';
import {
  type ColumnDef,
  type RowData,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Columns3,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type MouseEvent, type ReactNode, useMemo } from 'react';
import { QueryError } from '@/components/states';
import { useLocalStorageValue } from '@/lib/hooks';

declare module '@tanstack/react-table' {
  // Type parameters must match the library's declaration for interface merging.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** API sort key; makes the header clickable. */
    sortKey?: string;
    align?: 'left' | 'right';
    /** Extra classes for header and cells (widths, min-widths). */
    className?: string;
    /** Label in the column picker (defaults to the column id). */
    label?: string;
    /** The column cannot be hidden from the column picker. */
    required?: boolean;
  }
}

export interface SortState {
  key: string;
  direction: 'asc' | 'desc';
}

export interface DataTableProps<T> {
  /** Stable id used to remember hidden columns per table. */
  tableId: string;
  columns: ColumnDef<T>[];
  rows: readonly T[] | undefined;
  total: number | undefined;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  sort?: SortState | null;
  onSortChange?: (sort: SortState) => void;
  isLoading: boolean;
  isFetching?: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyState: ReactNode;
  getRowId: (row: T) => string;
  /** Makes rows open a detail page (the first link in the row stays the keyboard target). */
  rowHref?: (row: T) => string;
  toolbar?: ReactNode;
  className?: string;
}

const PAGE_SIZES = [10, 25, 50, 100];

function isInteractive(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('a, button, input, select, textarea, label, [role="menuitem"]') !== null
  );
}

/**
 * Server-driven data table: sorting and pagination happen in the API (the dataset is never fully
 * loaded), column visibility is a per-viewer preference.
 */
export function DataTable<T>({
  tableId,
  columns,
  rows,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  sort,
  onSortChange,
  isLoading,
  isFetching = false,
  error,
  onRetry,
  emptyState,
  getRowId,
  rowHref,
  toolbar,
  className,
}: DataTableProps<T>) {
  const t = useTranslations('common');
  const router = useRouter();
  const [storedHidden, setStoredHidden] = useLocalStorageValue(`campusos.table.${tableId}.hidden`);

  const columnVisibility = useMemo<VisibilityState>(() => {
    try {
      const hidden: unknown = storedHidden ? JSON.parse(storedHidden) : [];
      return Array.isArray(hidden)
        ? Object.fromEntries(
            hidden.filter((id): id is string => typeof id === 'string').map((id) => [id, false]),
          )
        : {};
    } catch {
      return {};
    }
  }, [storedHidden]);

  const data = useMemo(() => (rows ? [...rows] : []), [rows]);
  // The React Compiler is not enabled; TanStack Table handles its own memoization.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: { columnVisibility },
    onColumnVisibilityChange: (updater) => {
      const next = typeof updater === 'function' ? updater(columnVisibility) : updater;
      const hidden = Object.entries(next)
        .filter(([, visible]) => !visible)
        .map(([id]) => id);
      setStoredHidden(hidden.length ? JSON.stringify(hidden) : null);
    },
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
  });

  const visibleColumns = table.getVisibleLeafColumns();
  const pageCount = total === undefined ? 1 : Math.max(1, Math.ceil(total / pageSize));
  const hideableColumns = table
    .getAllLeafColumns()
    .filter((column) => !column.columnDef.meta?.required);

  const onRowClick = (event: MouseEvent<HTMLTableRowElement>, row: T) => {
    if (!rowHref || isInteractive(event.target)) return;
    if (window.getSelection()?.toString()) return; // the user is selecting text
    const href = rowHref(row);
    if (event.metaKey || event.ctrlKey) window.open(href, '_blank', 'noopener');
    else router.push(href);
  };

  const toggleSort = (key: string) => {
    if (!onSortChange) return;
    const direction = sort?.key === key && sort.direction === 'asc' ? 'desc' : 'asc';
    onSortChange({ key, direction });
  };

  return (
    <div className={cn('rounded-lg border border-line bg-surface shadow-xs', className)}>
      {toolbar || hideableColumns.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-line-subtle px-3 py-2.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{toolbar}</div>
          {hideableColumns.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" leadingIcon={<Columns3 />}>
                  <span className="hidden sm:inline">{t('columns')}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px]">
                <DropdownMenuLabel>{t('columns')}</DropdownMenuLabel>
                {hideableColumns.map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(checked) => column.toggleVisibility(checked)}
                    onSelect={(event) => event.preventDefault()}
                    className="flex h-8 cursor-default select-none items-center gap-2 rounded-sm px-2 text-sm text-fg outline-none data-[highlighted]:bg-surface-hover"
                  >
                    <span className="flex size-4 items-center justify-center rounded-xs border border-line-strong">
                      <DropdownMenuItemIndicator>
                        <Check className="size-3 text-primary" strokeWidth={3} />
                      </DropdownMenuItemIndicator>
                    </span>
                    {column.columnDef.meta?.label ?? column.id}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ) : null}

      <TableContainer
        className={cn('transition-opacity', isFetching && !isLoading && 'opacity-70')}
      >
        <Table>
          <THead>
            {table.getHeaderGroups().map((headerGroup) => (
              <Tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta;
                  const sortKey = meta?.sortKey;
                  const active = sortKey !== undefined && sort?.key === sortKey;
                  const content = header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext());
                  return (
                    <Th
                      key={header.id}
                      className={cn(meta?.align === 'right' && 'text-right', meta?.className)}
                      aria-sort={
                        active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined
                      }
                    >
                      {sortKey && onSortChange ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(sortKey)}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-sm hover:text-fg',
                            meta?.align === 'right' && 'flex-row-reverse',
                            active && 'text-fg',
                          )}
                        >
                          {content}
                          {active ? (
                            sort.direction === 'asc' ? (
                              <ArrowUp className="size-3" aria-hidden="true" />
                            ) : (
                              <ArrowDown className="size-3" aria-hidden="true" />
                            )
                          ) : (
                            <ArrowUpDown className="size-3 opacity-40" aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        content
                      )}
                    </Th>
                  );
                })}
              </Tr>
            ))}
          </THead>
          <TBody>
            {isLoading ? (
              Array.from({ length: Math.min(pageSize, 8) }, (_, index) => (
                <Tr key={`skeleton-${index}`} aria-hidden="true">
                  {visibleColumns.map((column) => (
                    <Td key={column.id} className={column.columnDef.meta?.className}>
                      <Skeleton
                        className="h-3.5"
                        style={{ width: `${55 + ((index * 17 + column.id.length * 7) % 40)}%` }}
                      />
                    </Td>
                  ))}
                </Tr>
              ))
            ) : error ? (
              <Tr>
                <Td
                  colSpan={visibleColumns.length}
                  className="h-auto group-hover/row:bg-transparent"
                >
                  <QueryError error={error} onRetry={onRetry} />
                </Td>
              </Tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <Tr>
                <Td
                  colSpan={visibleColumns.length}
                  className="h-auto group-hover/row:bg-transparent"
                >
                  {emptyState}
                </Td>
              </Tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <Tr
                  key={row.id}
                  onClick={(event) => onRowClick(event, row.original)}
                  className={cn(rowHref && 'cursor-pointer')}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta;
                    return (
                      <Td
                        key={cell.id}
                        className={cn(
                          meta?.align === 'right' && 'tabular text-right',
                          meta?.className,
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </Td>
                    );
                  })}
                </Tr>
              ))
            )}
          </TBody>
        </Table>
      </TableContainer>

      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-xs text-fg-muted">
        <span className="tabular">{total === undefined ? ' ' : t('rowsTotal', { total })}</span>
        <div className="flex items-center gap-3">
          {onPageSizeChange ? (
            <label className="flex items-center gap-2">
              <span className="hidden sm:inline">{t('rowsPerPage')}</span>
              <Select
                value={pageSize}
                onChange={(event) => onPageSizeChange(Number(event.target.value))}
                className="w-[72px]"
                aria-label={t('rowsPerPage')}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
          <span className="tabular">{t('page', { page, pages: pageCount })}</span>
          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1 || isLoading}
              aria-label={t('previousPage')}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= pageCount || isLoading}
              aria-label={t('nextPage')}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
