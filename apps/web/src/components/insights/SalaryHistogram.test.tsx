import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeDistribution } from '@/test/fixtures';
import { SalaryHistogram } from './SalaryHistogram';

const heights = () => screen.getAllByTestId('column').map((c) => (c as HTMLElement).style.height);

describe('SalaryHistogram', () => {
  it('has one column per range, each with its range and count as text', () => {
    render(<SalaryHistogram distribution={makeDistribution()} />);

    const items = within(screen.getByRole('list', { name: 'Salary distribution' })).getAllByRole(
      'listitem',
    );
    expect(items).toHaveLength(4);
    expect(items[1]).toHaveTextContent('From $100,000 up to $150,000: 2 people');
    expect(items[0]).toHaveTextContent('1 person');
  });

  it('draws columns relative to the busiest range, and nothing for an empty one', () => {
    render(<SalaryHistogram distribution={makeDistribution()} />);

    expect(heights()).toEqual(['50%', '100%', '0%', '50%']);
  });

  it('keeps a visible sliver for a range with a few people next to a very busy one', () => {
    render(
      <SalaryHistogram
        distribution={makeDistribution({
          headcount: 1001,
          buckets: [
            { fromUsdMinor: 0, toUsdMinor: 100, count: 1000 },
            { fromUsdMinor: 100, toUsdMinor: 200, count: 1 },
          ],
          bucketWidthUsdMinor: 100,
        })}
      />,
    );

    expect(heights()).toEqual(['100%', '2%']);
  });

  it('summarises the people, the width and the busiest range', () => {
    render(<SalaryHistogram distribution={makeDistribution()} />);

    expect(screen.getByText(/4 people, in ranges of \$50,000/)).toHaveTextContent(
      'Most common: $100,000 up to $150,000 (2 people)',
    );
  });

  it('labels the two ends of the chart', () => {
    render(<SalaryHistogram distribution={makeDistribution()} />);

    const ends = screen.getByText('$50,000').parentElement;
    expect(ends).toHaveTextContent('$50,000');
    expect(ends).toHaveTextContent('$250,000');
  });

  it('shows cents when everyone earns the same and the ranges are a cent wide', () => {
    render(
      <SalaryHistogram
        distribution={makeDistribution({
          headcount: 5,
          bucketWidthUsdMinor: 1,
          buckets: [{ fromUsdMinor: 9_500_000, toUsdMinor: 9_500_001, count: 5 }],
        })}
      />,
    );

    expect(screen.getByText(/5 people, in ranges of \$0\.01/)).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent(
      'From $95,000.00 up to $95,000.01: 5 people',
    );
  });

  it('says so, instead of drawing an empty chart, when nobody is counted', () => {
    render(
      <SalaryHistogram
        distribution={makeDistribution({ headcount: 0, bucketWidthUsdMinor: null, buckets: [] })}
      />,
    );

    expect(screen.getByText('Nobody with a salary matches these filters.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
