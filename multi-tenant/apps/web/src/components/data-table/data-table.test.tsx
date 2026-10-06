import type { ColumnDef } from '@tanstack/react-table';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { DataTable } from './data-table';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/students',
  useSearchParams: () => new URLSearchParams(),
}));

interface Row {
  id: string;
  name: string;
}

const columns: ColumnDef<Row>[] = [
  {
    id: 'name',
    header: 'Ad',
    meta: { sortKey: 'name', label: 'Ad', required: true },
    cell: ({ row }) => <a href={`/students/${row.original.id}`}>{row.original.name}</a>,
  },
];

function setup(overrides: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) {
  const props = {
    tableId: 'test',
    columns,
    rows: [
      { id: '1', name: 'Asya Çelik' },
      { id: '2', name: 'Can Demir' },
    ],
    total: 2,
    page: 1,
    pageSize: 25,
    onPageChange: vi.fn(),
    onSortChange: vi.fn(),
    sort: { key: 'name', direction: 'asc' as const },
    isLoading: false,
    emptyState: <p>Henüz öğrenci yok</p>,
    getRowId: (row: Row) => row.id,
    rowHref: (row: Row) => `/students/${row.id}`,
    ...overrides,
  };
  renderWithProviders(<DataTable {...props} />);
  return props;
}

describe('DataTable', () => {
  it('renders rows and the total', () => {
    setup();
    expect(screen.getByText('Asya Çelik')).toBeInTheDocument();
    expect(screen.getByText('2 kayıt')).toBeInTheDocument();
  });

  it('toggles server-side sorting from the header', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: /Ad/ }));
    expect(props.onSortChange).toHaveBeenCalledWith({ key: 'name', direction: 'desc' });
    expect(screen.getByRole('columnheader', { name: /Ad/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('opens a row when it is clicked outside interactive content', () => {
    setup();
    fireEvent.click(screen.getAllByRole('row')[1]!.querySelector('td')!);
    expect(push).toHaveBeenCalledWith('/students/1');
  });

  it('shows the empty state and disables paging when there is nothing to show', () => {
    setup({ rows: [], total: 0 });
    expect(screen.getByText('Henüz öğrenci yok')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sonraki sayfa' })).toBeDisabled();
  });

  it('renders the error state with a retry action', () => {
    const onRetry = vi.fn();
    setup({ rows: undefined, total: undefined, error: new Error('boom'), onRetry });
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));
    expect(onRetry).toHaveBeenCalled();
  });
});
