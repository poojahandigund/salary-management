import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BarList } from './BarList';

const item = (key: string, value: number, extra = {}) => ({
  key,
  label: key,
  value,
  valueText: `$${value}`,
  ...extra,
});
const widths = () => screen.getAllByTestId('bar').map((bar) => (bar as HTMLElement).style.width);

describe('BarList', () => {
  it('shows every label and value as text', () => {
    render(
      <BarList
        items={[item('India', 10, { detail: '3 people' }), item('Chile', 5)]}
        emptyText="-"
      />,
    );

    expect(screen.getByText('India')).toBeInTheDocument();
    expect(screen.getByText('$10')).toBeInTheDocument();
    expect(screen.getByText('3 people')).toBeInTheDocument();
    expect(screen.getByText('Chile')).toBeInTheDocument();
  });

  it('draws bars relative to the largest value', () => {
    render(<BarList items={[item('a', 200), item('b', 100), item('c', 50)]} emptyText="-" />);

    expect(widths()).toEqual(['100%', '50%', '25%']);
  });

  it('keeps a visible sliver for a value that is tiny next to the largest', () => {
    render(<BarList items={[item('big', 1_000_000), item('tiny', 1)]} emptyText="-" />);

    expect(widths()).toEqual(['100%', '1%']);
  });

  it('draws no bar length when every value is zero, instead of dividing by zero', () => {
    render(<BarList items={[item('a', 0), item('b', 0)]} emptyText="-" />);

    expect(widths()).toEqual(['0%', '0%']);
  });

  it('hides the bars from assistive technology, since the numbers are already text', () => {
    render(<BarList items={[item('a', 1)]} emptyText="-" />);

    expect(screen.getByTestId('bar').parentElement).toHaveAttribute('aria-hidden', 'true');
  });

  it('says so when there is nothing to show', () => {
    render(<BarList items={[]} emptyText="No active employees yet." />);

    expect(screen.getByText('No active employees yet.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
