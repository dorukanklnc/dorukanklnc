import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { MoneyInput } from './money-input';

describe('MoneyInput', () => {
  it('normalizes what the user typed to the locale format on blur', () => {
    renderWithProviders(<MoneyInput currency="TRY" aria-label="Tutar" defaultValue="" />);
    const input = screen.getByLabelText('Tutar');
    fireEvent.change(input, { target: { value: '12500,5' } });
    fireEvent.blur(input);
    expect(input).toHaveValue('12.500,50');
  });

  it('leaves invalid input untouched so validation can report it', () => {
    renderWithProviders(<MoneyInput currency="TRY" aria-label="Tutar" defaultValue="" />);
    const input = screen.getByLabelText('Tutar');
    fireEvent.change(input, { target: { value: '12,345' } });
    fireEvent.blur(input);
    expect(input).toHaveValue('12,345');
  });
});
