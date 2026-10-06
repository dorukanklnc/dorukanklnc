import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { ReceivableStatusBadge } from './finance-badges';

const base = {
  status: 'open' as const,
  isOverdue: false,
  daysOverdue: 0,
  allocatedMinor: 0,
  amountMinor: 4_500_000,
};

describe('ReceivableStatusBadge', () => {
  it('shows how many days an item is overdue', () => {
    renderWithProviders(
      <ReceivableStatusBadge receivable={{ ...base, isOverdue: true, daysOverdue: 3 }} />,
    );
    expect(screen.getByText('3 gün gecikti')).toBeInTheDocument();
  });

  it('distinguishes partially paid from open items', () => {
    renderWithProviders(
      <ReceivableStatusBadge receivable={{ ...base, allocatedMinor: 1_500_000 }} />,
    );
    expect(screen.getByText('Kısmi ödendi')).toBeInTheDocument();
  });

  it('marks paid items', () => {
    renderWithProviders(
      <ReceivableStatusBadge receivable={{ ...base, status: 'paid', allocatedMinor: 4_500_000 }} />,
    );
    expect(screen.getByText('Ödendi')).toBeInTheDocument();
  });
});
