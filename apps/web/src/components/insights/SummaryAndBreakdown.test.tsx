import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeSummary } from '@/test/fixtures';
import { PayrollBreakdown } from './PayrollBreakdown';
import { SummaryCards } from './SummaryCards';

describe('SummaryCards', () => {
  it('shows people, payroll, average salary and countries', () => {
    render(<SummaryCards summary={makeSummary()} />);

    expect(screen.getByText('Active employees').nextSibling).toHaveTextContent('3');
    expect(screen.getByText('Annual payroll').nextSibling).toHaveTextContent('$300K');
    expect(screen.getByText('Average salary').nextSibling).toHaveTextContent('$100K');
    expect(screen.getByText('Countries').nextSibling).toHaveTextContent('2');
  });

  it('gives the exact amounts on hover', () => {
    render(<SummaryCards summary={makeSummary()} />);

    expect(screen.getByText('$300K')).toHaveAttribute('title', '$300,000');
    expect(screen.getByText('$100K')).toHaveAttribute('title', '$100,000');
  });

  it('puts thousands separators in large headcounts', () => {
    render(
      <SummaryCards
        summary={makeSummary({ totals: { headcount: 9_576, payrollUsdMinor: 87_000_000_000 } })}
      />,
    );

    expect(screen.getByText('9,576')).toBeInTheDocument();
  });

  it('shows a dash instead of an average for an empty company', () => {
    render(
      <SummaryCards
        summary={makeSummary({
          totals: { headcount: 0, payrollUsdMinor: 0 },
          byCountry: [],
          byDepartment: [],
        })}
      />,
    );

    expect(screen.getByText('Average salary').nextSibling).toHaveTextContent('—');
    expect(screen.getByText('Active employees').nextSibling).toHaveTextContent('0');
    expect(screen.queryByText('NaN', { exact: false })).not.toBeInTheDocument();
  });
});

describe('PayrollBreakdown', () => {
  it('lists countries by name, with payroll, people and a bar', () => {
    render(<PayrollBreakdown summary={makeSummary()} />);

    const lists = screen.getAllByRole('list');
    const countries = lists[0] as HTMLElement;
    expect(countries).toHaveTextContent('United States');
    expect(countries).toHaveTextContent('$200K');
    expect(countries).toHaveTextContent('2 people');
    expect(countries).toHaveTextContent('India');
    expect(countries).toHaveTextContent('1 person');
  });

  it('lists departments with payroll and people', () => {
    render(<PayrollBreakdown summary={makeSummary()} />);

    const departments = screen.getAllByRole('list')[1] as HTMLElement;
    expect(departments).toHaveTextContent('Engineering');
    expect(departments).toHaveTextContent('$220K');
    expect(departments).toHaveTextContent('Sales');
    expect(departments).toHaveTextContent('$80K');
  });

  it('keeps the order the server sent, biggest first', () => {
    render(<PayrollBreakdown summary={makeSummary()} />);

    const names = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(names[0]).toContain('United States');
    expect(names[1]).toContain('India');
  });

  it('says so when there is nobody', () => {
    render(<PayrollBreakdown summary={makeSummary({ byCountry: [], byDepartment: [] })} />);

    expect(screen.getAllByText('No active employees yet.')).toHaveLength(2);
  });
});
