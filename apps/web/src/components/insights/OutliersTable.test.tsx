import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { makeOutlier, makeOutliers } from '@/test/fixtures';
import { OutliersTable, formatPercent } from './OutliersTable';

const show = (outliers: ReturnType<typeof makeOutliers>) =>
  render(
    <MemoryRouter>
      <OutliersTable outliers={outliers} />
    </MemoryRouter>,
  );

describe('formatPercent', () => {
  it.each([
    [150, '+150%'],
    [62.5, '+62.5%'],
    [-37.5, '−37.5%'],
    [-70, '−70%'],
    [1234.5, '+1,234.5%'],
    [0.04, '+0%'],
  ])('writes %f as %s', (percent, text) => {
    expect(formatPercent(percent)).toBe(text);
  });
});

describe('OutliersTable', () => {
  it('shows who, role, salary, peer median, difference and peers', () => {
    show(makeOutliers());

    const row = screen.getByRole('link', { name: 'Ada Lovelace' }).closest('tr') as HTMLElement;
    const cells = within(row).getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('United Kingdom');
    expect(cells[1]).toHaveTextContent('Software Engineer');
    expect(cells[1]).toHaveTextContent('Engineering · L4');
    expect(cells[2]).toHaveTextContent('$250,000');
    expect(cells[3]).toHaveTextContent('$100,000');
    expect(cells[4]).toHaveTextContent('+150% above');
    expect(cells[5]).toHaveTextContent('6');
  });

  it('says "below" and uses a minus sign for someone paid under their peers', () => {
    show(
      makeOutliers([
        makeOutlier({
          percentFromMedian: -60,
          direction: 'below',
          score: -12.3,
          salaryUsdMinor: 4_000_000,
        }),
      ]),
    );

    const cell = screen.getByText(/−60%/);
    expect(cell).toHaveTextContent('−60% below');
    expect(cell).toHaveAttribute('title', 'Below the peer median (score -12.3)');
  });

  it('explains the difference on hover, in words', () => {
    show(makeOutliers());

    expect(screen.getByText(/\+150%/)).toHaveAttribute(
      'title',
      'Above the peer median (score 40.5)',
    );
  });

  it('links each person to their page', () => {
    show(
      makeOutliers([
        makeOutlier({
          employee: { ...makeOutlier().employee, id: 11, firstName: 'Bo', lastName: 'Li' },
        }),
        makeOutlier({
          employee: { ...makeOutlier().employee, id: 12, firstName: 'Cy', lastName: 'Ng' },
        }),
      ]),
    );

    expect(screen.getByRole('link', { name: 'Bo Li' })).toHaveAttribute('href', '/employees/11');
    expect(screen.getByRole('link', { name: 'Cy Ng' })).toHaveAttribute('href', '/employees/12');
  });

  it('keeps the order it was given, strongest first', () => {
    show(
      makeOutliers([
        makeOutlier({
          employee: { ...makeOutlier().employee, id: 1, firstName: 'First', lastName: 'One' },
        }),
        makeOutlier({
          employee: { ...makeOutlier().employee, id: 2, firstName: 'Second', lastName: 'Two' },
        }),
      ]),
    );

    const names = screen.getAllByRole('link').map((link) => link.textContent);
    expect(names).toEqual(['First One', 'Second Two']);
  });

  it('says how many more there are when the list is cut short', () => {
    show(makeOutliers([makeOutlier()], 130));

    expect(
      screen.getByText('Showing the 1 furthest from their peers, out of 130.'),
    ).toBeInTheDocument();
  });

  it('does not mention a cut when everyone is shown', () => {
    show(makeOutliers([makeOutlier()], 1));

    expect(screen.queryByText(/Showing the/)).not.toBeInTheDocument();
  });

  it('says so, instead of showing an empty table, when nobody stands out', () => {
    show(makeOutliers([]));

    expect(screen.getByText(/Nobody stands out/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
