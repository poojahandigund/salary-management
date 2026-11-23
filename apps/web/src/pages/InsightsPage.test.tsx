import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import {
  makeDistribution,
  makeOutlier,
  makeOutliers,
  makeStats,
  makeSummary,
} from '@/test/fixtures';
import { apiError, mockApi, reply, type MockReply, type RecordedCall } from '@/test/mock-api';
import { renderWithProviders } from '@/test/render';

afterEach(() => {
  vi.unstubAllGlobals();
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

const session = reply(200, { user: { username: 'hr.manager' } });
const location = () => screen.getByTestId('location').textContent;

interface Answers {
  summary?: MockReply | ((call: RecordedCall) => MockReply | Promise<MockReply>);
  stats?: MockReply | ((call: RecordedCall) => MockReply | Promise<MockReply>);
  distribution?: MockReply | ((call: RecordedCall) => MockReply | Promise<MockReply>);
  outliers?: MockReply | ((call: RecordedCall) => MockReply | Promise<MockReply>);
}

async function openInsights(route = '/insights', answers: Answers = {}) {
  const api = mockApi({
    'GET /api/auth/me': session,
    'GET /api/insights/summary': answers.summary ?? reply(200, makeSummary()),
    'GET /api/insights/salary-stats': answers.stats ?? reply(200, makeStats()),
    'GET /api/insights/salary-distribution': answers.distribution ?? reply(200, makeDistribution()),
    'GET /api/insights/outliers': answers.outliers ?? reply(200, makeOutliers()),
  });
  const user = userEvent.setup({ delay: null });
  renderWithProviders(
    <>
      <App />
      <LocationProbe />
    </>,
    { route },
  );
  return { api, user };
}

const statsCalls = (api: ReturnType<typeof mockApi>) =>
  api.callsTo('GET /api/insights/salary-stats');
const lastStatsParams = (api: ReturnType<typeof mockApi>) =>
  Object.fromEntries(new URL(statsCalls(api).at(-1)?.url ?? '', 'http://x').searchParams);

describe('insights page', () => {
  describe('navigation', () => {
    it('is reached from the main navigation, and marked as the current page', async () => {
      mockApi({
        'GET /api/auth/me': session,
        'GET /api/employees': reply(200, {
          items: [],
          page: 1,
          pageSize: 25,
          total: 0,
          totalPages: 0,
        }),
        'GET /api/insights/summary': reply(200, makeSummary()),
        'GET /api/insights/salary-stats': reply(200, makeStats()),
        'GET /api/insights/salary-distribution': reply(200, makeDistribution()),
        'GET /api/insights/outliers': reply(200, makeOutliers()),
      });
      const user = userEvent.setup({ delay: null });
      renderWithProviders(<App />);

      await user.click(await screen.findByRole('link', { name: 'Insights' }));

      expect(await screen.findByRole('heading', { name: 'Insights' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Insights' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });

    it('needs a login like every other page', async () => {
      mockApi({ 'GET /api/auth/me': apiError(401, 'UNAUTHENTICATED', 'Authentication required') });
      renderWithProviders(<App />, { route: '/insights' });

      expect(await screen.findByLabelText('Username')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Insights' })).not.toBeInTheDocument();
    });
  });

  describe('company overview', () => {
    it('shows the summary cards', async () => {
      await openInsights();

      expect(await screen.findByText('$300K')).toBeInTheDocument();
      expect(screen.getByText('Active employees').nextSibling).toHaveTextContent('3');
      expect(screen.getByText('Average salary').nextSibling).toHaveTextContent('$100K');
    });

    it('shows payroll by country and by department', async () => {
      await openInsights();

      const country = (await screen.findByText('Payroll by country')).closest('[data-slot="card"]');
      const department = screen.getByText('Payroll by department').closest('[data-slot="card"]');
      expect(country).toHaveTextContent('United States');
      expect(country).toHaveTextContent('$200K');
      expect(department).toHaveTextContent('Engineering');
      expect(department).toHaveTextContent('$220K');
    });

    it('says what the numbers mean: current yearly salary of active employees, in US dollars', async () => {
      await openInsights();

      expect(await screen.findByText(/current yearly salary/)).toHaveTextContent('US dollars');
    });

    it('shows a loading state before the numbers arrive', async () => {
      await openInsights('/insights', { summary: () => new Promise<MockReply>(() => undefined) });

      expect(await screen.findByLabelText('Loading the company overview')).toBeInTheDocument();
    });

    it('explains a failure and tries again on request, without disturbing the rest of the page', async () => {
      let healthy = false;
      const { api, user } = await openInsights('/insights', {
        summary: () =>
          healthy ? reply(200, makeSummary()) : apiError(500, 'INTERNAL', 'Something went wrong'),
      });

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Could not load the company overview. Something went wrong');
      // The salary analysis does not depend on it.
      expect(await screen.findByText('Everyone shown')).toBeInTheDocument();

      healthy = true;
      await user.click(within(alert).getByRole('button', { name: 'Try again' }));

      expect(await screen.findByText('$300K')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(api.callsTo('GET /api/insights/summary')).toHaveLength(2);
    });

    it('is not asked for again when a filter changes, because it covers the whole company', async () => {
      const { api, user } = await openInsights();
      await screen.findByText('$300K');

      await user.selectOptions(screen.getByLabelText('Country'), 'India');
      await waitFor(() => expect(statsCalls(api)).toHaveLength(2));

      expect(api.callsTo('GET /api/insights/summary')).toHaveLength(1);
    });
  });

  describe('salary analysis', () => {
    it('shows the statistics by country at first', async () => {
      const { api } = await openInsights();

      const table = await screen.findByRole('table', { name: 'Salary statistics' });
      expect(within(table).getByRole('cell', { name: 'United States' })).toBeInTheDocument();
      const us = within(table).getByRole('row', { name: /^United States/ });
      expect(us).toHaveTextContent('$80,000');
      expect(us).toHaveTextContent('$120,000');
      expect(lastStatsParams(api)).toEqual({ groupBy: 'country' });
    });

    it('regroups when another grouping is chosen, and puts it in the address', async () => {
      const { api, user } = await openInsights('/insights', {
        stats: (call) =>
          reply(
            200,
            call.url.includes('groupBy=department')
              ? makeStats({
                  groupBy: 'department',
                  groups: [{ ...makeStats().groups[0]!, key: 'Engineering' }],
                })
              : makeStats(),
          ),
      });
      await screen.findByRole('table', { name: 'Salary statistics' });

      await user.selectOptions(screen.getByLabelText('Group by'), 'Department');

      expect(await screen.findByRole('cell', { name: 'Engineering' })).toBeInTheDocument();
      expect(lastStatsParams(api)).toEqual({ groupBy: 'department' });
      expect(location()).toBe('/insights?groupBy=department');
    });

    it('goes back to the clean address when the default grouping is chosen again', async () => {
      const { user } = await openInsights('/insights?groupBy=level');
      await screen.findByRole('table', { name: 'Salary statistics' });

      await user.selectOptions(screen.getByLabelText('Group by'), 'Country');

      expect(location()).toBe('/insights');
    });

    it('narrows the figures with a filter, and puts it in the address', async () => {
      const { api, user } = await openInsights();
      await screen.findByRole('table', { name: 'Salary statistics' });

      await user.selectOptions(screen.getByLabelText('Country'), 'India');
      await user.selectOptions(screen.getByLabelText('Level'), 'L4');

      await waitFor(() =>
        expect(lastStatsParams(api)).toEqual({ groupBy: 'country', country: 'IN', level: '4' }),
      );
      expect(location()).toBe('/insights?country=IN&level=4');
    });

    it('picks up the view from the address, so a link can be shared', async () => {
      const { api } = await openInsights('/insights?groupBy=level&country=GB&department=Sales');

      await screen.findByRole('table', { name: 'Salary statistics' });
      expect(lastStatsParams(api)).toEqual({
        groupBy: 'level',
        country: 'GB',
        department: 'Sales',
      });
      expect(screen.getByLabelText('Country')).toHaveValue('GB');
      expect(screen.getByLabelText('Department')).toHaveValue('Sales');
      expect(screen.getByLabelText('Group by')).toHaveValue('level');
    });

    it('ignores settings in the address that are not valid, and keeps the rest', async () => {
      const { api } = await openInsights(
        '/insights?country=ZZ&level=99&groupBy=level&department=Sales',
      );

      await screen.findByRole('table', { name: 'Salary statistics' });
      expect(lastStatsParams(api)).toEqual({ groupBy: 'level', department: 'Sales' });
    });

    it('removes the filters but keeps the grouping when they are cleared', async () => {
      const { api, user } = await openInsights('/insights?groupBy=department&country=IN');
      await screen.findByRole('table', { name: 'Salary statistics' });

      await user.click(screen.getByRole('button', { name: 'Clear filters' }));

      expect(location()).toBe('/insights?groupBy=department');
      await waitFor(() => expect(lastStatsParams(api)).toEqual({ groupBy: 'department' }));
      expect(screen.getByLabelText('Country')).toHaveValue('');
    });

    it('cannot clear when there is nothing to clear', async () => {
      await openInsights();
      await screen.findByRole('table', { name: 'Salary statistics' });

      expect(screen.getByRole('button', { name: 'Clear filters' })).toBeDisabled();
    });

    it('dims the earlier figures while new ones load', async () => {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const { user } = await openInsights('/insights', {
        stats: async (call) => {
          if (call.url.includes('country=IN')) await gate;
          return reply(200, makeStats());
        },
      });
      const table = await screen.findByRole('table', { name: 'Salary statistics' });

      await user.selectOptions(screen.getByLabelText('Country'), 'India');

      await waitFor(() => expect(table.closest('.opacity-60')).not.toBeNull());
      release();
      await waitFor(() =>
        expect(
          screen.getByRole('table', { name: 'Salary statistics' }).closest('.opacity-60'),
        ).toBeNull(),
      );
    });

    it('says when nobody matches the filters', async () => {
      await openInsights('/insights?country=SG', {
        stats: reply(200, makeStats({ overall: null, groups: [] })),
      });

      expect(
        await screen.findByText('Nobody with a salary matches these filters.'),
      ).toBeInTheDocument();
    });

    it('explains a failure and tries again on request', async () => {
      let healthy = false;
      const { api, user } = await openInsights('/insights', {
        stats: () => (healthy ? reply(200, makeStats()) : apiError(500, 'INTERNAL', 'Boom')),
      });

      const alert = await screen.findByText(/Could not load the salary statistics/);
      expect(alert).toHaveTextContent('Boom');

      healthy = true;
      await user.click(screen.getByRole('button', { name: 'Try again' }));

      expect(await screen.findByRole('table', { name: 'Salary statistics' })).toBeInTheDocument();
      expect(statsCalls(api)).toHaveLength(2);
    });
  });

  describe('salary distribution', () => {
    it('shows how many people fall in each salary range', async () => {
      await openInsights();

      const chart = await screen.findByRole('list', { name: 'Salary distribution' });
      const ranges = within(chart)
        .getAllByRole('listitem')
        .map((li) => li.textContent);
      expect(ranges).toEqual([
        'From $50,000 up to $100,000: 1 person',
        'From $100,000 up to $150,000: 2 people',
        'From $150,000 up to $200,000: 0 people',
        'From $200,000 up to $250,000: 1 person',
      ]);
    });

    it('asks for the same filters as the statistics, and no grouping', async () => {
      const { api, user } = await openInsights('/insights?groupBy=level&country=IN');
      await screen.findByRole('list', { name: 'Salary distribution' });

      await user.selectOptions(screen.getByLabelText('Level'), 'L2');

      await waitFor(() =>
        expect(
          Object.fromEntries(
            new URL(
              api.callsTo('GET /api/insights/salary-distribution').at(-1)?.url ?? '',
              'http://x',
            ).searchParams,
          ),
        ).toEqual({ country: 'IN', level: '2' }),
      );
    });

    it('explains a failure and tries again on request', async () => {
      let healthy = false;
      const { api, user } = await openInsights('/insights', {
        distribution: () =>
          healthy ? reply(200, makeDistribution()) : apiError(500, 'INTERNAL', 'Nope'),
      });

      expect(await screen.findByText(/Could not load the salary distribution/)).toHaveTextContent(
        'Nope',
      );

      healthy = true;
      await user.click(screen.getByRole('button', { name: 'Try again' }));

      expect(await screen.findByRole('list', { name: 'Salary distribution' })).toBeInTheDocument();
      expect(api.callsTo('GET /api/insights/salary-distribution')).toHaveLength(2);
    });
  });

  describe('pay outliers', () => {
    it('lists the people who stand out, with a link to each', async () => {
      await openInsights('/insights', {
        outliers: reply(
          200,
          makeOutliers([makeOutlier({ employee: { ...makeOutlier().employee, id: 42 } })]),
        ),
      });

      const link = await screen.findByRole('link', { name: 'Ada Lovelace' });
      expect(link).toHaveAttribute('href', '/employees/42');
      const row = link.closest('tr') as HTMLElement;
      expect(row).toHaveTextContent('$250,000');
      expect(row).toHaveTextContent('$100,000');
      expect(row).toHaveTextContent('+150%');
    });

    it('explains how people are compared, and that a flag is not a verdict', async () => {
      await openInsights();

      expect(await screen.findByText(/same job title, level and country/)).toHaveTextContent(
        'not a verdict',
      );
    });

    it('asks for the same filters as the statistics, and no grouping', async () => {
      const { api } = await openInsights(
        '/insights?groupBy=department&department=Sales&country=GB',
      );

      await screen.findByRole('link', { name: 'Ada Lovelace' });
      const url = api.callsTo('GET /api/insights/outliers').at(-1)?.url ?? '';
      expect(Object.fromEntries(new URL(url, 'http://x').searchParams)).toEqual({
        department: 'Sales',
        country: 'GB',
      });
    });

    it('says so when nobody stands out', async () => {
      await openInsights('/insights', { outliers: reply(200, makeOutliers([])) });

      expect(await screen.findByText(/Nobody stands out/)).toBeInTheDocument();
    });

    it('explains a failure and tries again on request', async () => {
      let healthy = false;
      const { api, user } = await openInsights('/insights', {
        outliers: () =>
          healthy ? reply(200, makeOutliers()) : apiError(500, 'INTERNAL', 'Broken'),
      });

      expect(await screen.findByText(/Could not load the outliers/)).toHaveTextContent('Broken');

      healthy = true;
      await user.click(screen.getByRole('button', { name: 'Try again' }));

      expect(await screen.findByRole('link', { name: 'Ada Lovelace' })).toBeInTheDocument();
      expect(api.callsTo('GET /api/insights/outliers')).toHaveLength(2);
    });

    it('keeps the other sections working when one fails', async () => {
      await openInsights('/insights', { outliers: apiError(500, 'INTERNAL', 'Broken') });

      await screen.findByText(/Could not load the outliers/);
      expect(screen.getByRole('table', { name: 'Salary statistics' })).toBeInTheDocument();
      expect(screen.getByRole('list', { name: 'Salary distribution' })).toBeInTheDocument();
      expect(screen.getAllByRole('alert')).toHaveLength(1);
    });
  });
});
