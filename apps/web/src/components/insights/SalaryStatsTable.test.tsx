import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeStats } from '@/test/fixtures';
import { SalaryStatsTable } from './SalaryStatsTable';

const row = (name: string) => screen.getByRole('row', { name: new RegExp(`^${name}`) });

describe('SalaryStatsTable', () => {
  it('shows min, median, average and max per group, in whole dollars', () => {
    render(<SalaryStatsTable stats={makeStats()} groupBy="country" onGroupBy={vi.fn()} />);

    const us = within(row('United States')).getAllByRole('cell');
    expect(us.map((cell) => cell.textContent)).toEqual([
      'United States',
      '2',
      '$80,000',
      '$100,000',
      '$100,000',
      '$120,000',
    ]);
  });

  it('ends with the figures for everyone shown', () => {
    render(<SalaryStatsTable stats={makeStats()} groupBy="country" onGroupBy={vi.fn()} />);

    const rows = screen.getAllByRole('row');
    expect(rows.at(-1)).toHaveTextContent('Everyone shown');
    expect(rows.at(-1)).toHaveTextContent('$120,000');
  });

  it('names countries and levels the way people read them', () => {
    const { rerender } = render(
      <SalaryStatsTable stats={makeStats()} groupBy="country" onGroupBy={vi.fn()} />,
    );
    expect(screen.getByRole('columnheader', { name: 'Country' })).toBeInTheDocument();

    const [first] = makeStats().groups;
    rerender(
      <SalaryStatsTable
        stats={makeStats({
          groupBy: 'level',
          groups: [{ ...(first as object), key: '4' } as never],
        })}
        groupBy="level"
        onGroupBy={vi.fn()}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Level' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'L4' })).toBeInTheDocument();
  });

  it('shows departments and job titles as they are', () => {
    const [first] = makeStats().groups;
    render(
      <SalaryStatsTable
        stats={makeStats({
          groupBy: 'jobTitle',
          groups: [{ ...(first as object), key: 'Software Engineer' } as never],
        })}
        groupBy="jobTitle"
        onGroupBy={vi.fn()}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Job title' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Software Engineer' })).toBeInTheDocument();
  });

  it('offers every grouping and reports the one chosen', async () => {
    const onGroupBy = vi.fn();
    const user = userEvent.setup({ delay: null });
    render(<SalaryStatsTable stats={makeStats()} groupBy="country" onGroupBy={onGroupBy} />);

    const select = screen.getByLabelText('Group by');
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Country', 'Department', 'Job title', 'Level']);
    await user.selectOptions(select, 'Department');

    expect(onGroupBy).toHaveBeenCalledWith('department');
  });

  it('shows the grouping that was chosen even while older figures are still on screen', () => {
    render(<SalaryStatsTable stats={makeStats()} groupBy="level" onGroupBy={vi.fn()} />);

    expect(screen.getByLabelText('Group by')).toHaveValue('level');
    expect(screen.getByRole('columnheader', { name: 'Country' })).toBeInTheDocument();
  });

  it('says so, instead of showing an empty table, when nobody matches', () => {
    render(
      <SalaryStatsTable
        stats={makeStats({ overall: null, groups: [] })}
        groupBy="country"
        onGroupBy={vi.fn()}
      />,
    );

    expect(screen.getByText('Nobody with a salary matches these filters.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Group by')).toBeInTheDocument();
  });
});
