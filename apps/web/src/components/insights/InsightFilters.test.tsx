import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InsightFilters } from './InsightFilters';

function setup(
  view: Parameters<typeof InsightFilters>[0]['view'] = { groupBy: 'country' },
  canClear = false,
) {
  const onChange = vi.fn();
  const onClear = vi.fn();
  render(<InsightFilters view={view} onChange={onChange} onClear={onClear} canClear={canClear} />);
  return { onChange, onClear, user: userEvent.setup({ delay: null }) };
}

const options = (label: string) =>
  within(screen.getByLabelText(label))
    .getAllByRole('option')
    .map((o) => o.textContent);

describe('InsightFilters', () => {
  it('offers every country, department, job title and level, plus "all"', () => {
    setup();

    expect(options('Country')).toHaveLength(8);
    expect(options('Country')[0]).toBe('All countries');
    expect(options('Department')[0]).toBe('All departments');
    expect(options('Job title')[0]).toBe('All job titles');
    expect(options('Level')).toEqual([
      'All levels',
      ...Array.from({ length: 10 }, (_, i) => `L${i + 1}`),
    ]);
  });

  it('shows the filters that are set', () => {
    setup({
      groupBy: 'country',
      country: 'IN',
      department: 'Sales',
      jobTitle: 'Account Executive',
      level: 4,
    });

    expect(screen.getByLabelText('Country')).toHaveValue('IN');
    expect(screen.getByLabelText('Department')).toHaveValue('Sales');
    expect(screen.getByLabelText('Job title')).toHaveValue('Account Executive');
    expect(screen.getByLabelText('Level')).toHaveValue('4');
  });

  it('reports a chosen country, and "all" as no filter', async () => {
    const { onChange, user } = setup({ groupBy: 'country', country: 'IN' });

    await user.selectOptions(screen.getByLabelText('Country'), 'United States');
    await user.selectOptions(screen.getByLabelText('Country'), 'All countries');

    expect(onChange).toHaveBeenNthCalledWith(1, { country: 'US' });
    expect(onChange).toHaveBeenNthCalledWith(2, { country: undefined });
  });

  it('reports the level as a number, and "all" as no filter', async () => {
    const { onChange, user } = setup({ groupBy: 'country', level: 2 });

    await user.selectOptions(screen.getByLabelText('Level'), 'L7');
    await user.selectOptions(screen.getByLabelText('Level'), 'All levels');

    expect(onChange).toHaveBeenNthCalledWith(1, { level: 7 });
    expect(onChange).toHaveBeenNthCalledWith(2, { level: undefined });
  });

  it('offers only the job titles of the chosen department', () => {
    setup({ groupBy: 'country', department: 'Sales' });

    const titles = options('Job title');
    expect(titles).toContain('Account Executive');
    expect(titles).not.toContain('Software Engineer');
  });

  it('drops a job title that does not belong to the newly chosen department', async () => {
    const { onChange, user } = setup({ groupBy: 'country', jobTitle: 'Software Engineer' });

    await user.selectOptions(screen.getByLabelText('Department'), 'Sales');

    // toStrictEqual: the job title must be present and cleared, not just missing.
    expect(onChange.mock.calls[0]?.[0]).toStrictEqual({ department: 'Sales', jobTitle: undefined });
  });

  it('keeps a job title that belongs to the newly chosen department', async () => {
    const { onChange, user } = setup({ groupBy: 'country', jobTitle: 'Software Engineer' });

    await user.selectOptions(screen.getByLabelText('Department'), 'Engineering');

    expect(onChange.mock.calls[0]?.[0]).toStrictEqual({ department: 'Engineering' });
  });

  it('clears the filters only when there are some to clear', async () => {
    const idle = setup({ groupBy: 'country' }, false);
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeDisabled();
    expect(idle.onClear).not.toHaveBeenCalled();
  });

  it('calls back when "Clear filters" is pressed', async () => {
    const { onClear, user } = setup({ groupBy: 'country', country: 'IN' }, true);

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(onClear).toHaveBeenCalledOnce();
  });
});
