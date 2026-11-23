import type { SalaryHistory as SalaryHistoryData, SalaryRecord } from '@acme/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeEmployee, makeSalaryRecord } from '@/test/fixtures';
import { apiError, mockApi, reply } from '@/test/mock-api';
import { renderWithProviders } from '@/test/render';
import { SalaryHistory } from './SalaryHistory';

afterEach(() => {
  vi.unstubAllGlobals();
});

const asha = makeEmployee({ id: 7, countryCode: 'IN', hireDate: '2022-04-01' });
const HISTORY = 'GET /api/employees/7/salary-history';

const hire = makeSalaryRecord({ id: 1, employeeId: 7 });
const raise = makeSalaryRecord({
  id: 2,
  employeeId: 7,
  amountMinor: 180_000_000,
  amountUsdMinor: 2_160_000,
  effectiveDate: '2024-01-01',
  reason: 'annual_review',
});

const history = (...items: SalaryRecord[]): SalaryHistoryData => ({ items });

function show(routes: Parameters<typeof mockApi>[0], employee = asha) {
  const api = mockApi(routes);
  const user = userEvent.setup({ delay: null });
  renderWithProviders(<SalaryHistory employee={employee} />);
  return { api, user };
}

const rowsOf = () => screen.getAllByRole('row').slice(1); // without the header row

describe('SalaryHistory', () => {
  describe('the list', () => {
    it('shows each record: date, amount with its US-dollar equivalent, and reason', async () => {
      show({ [HISTORY]: reply(200, history(raise, hire)) });

      await screen.findByText('1 Jan 2024');
      const [newest, oldest] = rowsOf();
      expect(newest?.textContent).toContain('1 Jan 2024');
      expect(newest?.textContent).toContain('₹1,800,000.00');
      expect(newest?.textContent).toContain('≈ $21,600.00');
      expect(newest?.textContent).toContain('Annual review');
      expect(oldest?.textContent).toContain('1 Apr 2022');
      expect(oldest?.textContent).toContain('₹1,500,000.00');
      expect(oldest?.textContent).toContain('≈ $18,000.00');
      expect(oldest?.textContent).toContain('Hire');
    });

    it('keeps the order the API sends and marks only the first record as current', async () => {
      show({ [HISTORY]: reply(200, history(raise, hire)) });

      await screen.findByText('1 Jan 2024');
      const [newest, oldest] = rowsOf();
      expect(within(newest as HTMLElement).getByText('Current')).toBeInTheDocument();
      expect(within(oldest as HTMLElement).queryByText('Current')).not.toBeInTheDocument();
      expect(screen.getAllByText('Current')).toHaveLength(1);
    });

    it('shows no dollar equivalent for a salary that is already in US dollars', async () => {
      const us = makeEmployee({ id: 7, countryCode: 'US' });
      const usd = makeSalaryRecord({
        employeeId: 7,
        amountMinor: 9_000_000,
        currency: 'USD',
        amountUsdMinor: 9_000_000,
      });
      show({ [HISTORY]: reply(200, history(usd)) }, us);

      await screen.findByText('$90,000.00');
      expect(screen.queryByText(/≈/)).not.toBeInTheDocument();
    });

    it('says so when there are no records', async () => {
      show({ [HISTORY]: reply(200, history()) });

      expect(await screen.findByText('No salary records yet.')).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('shows a loading state, then the records', async () => {
      show({ [HISTORY]: reply(200, history(hire)) });

      expect(screen.getByRole('status', { name: 'Loading salary history' })).toBeInTheDocument();
      await screen.findByText('1 Apr 2022');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('shows the error and a way to try again when the history cannot be loaded', async () => {
      let attempts = 0;
      const { user } = show({
        [HISTORY]: () => {
          attempts += 1;
          return attempts === 1
            ? apiError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.')
            : reply(200, history(hire));
        },
      });

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Could not load the salary history. Something went wrong. Please try again.',
      );
      await user.click(screen.getByRole('button', { name: 'Try again' }));

      expect(await screen.findByText('1 Apr 2022')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('who can change a salary', () => {
    it('offers "Change salary" for an active employee', async () => {
      show({ [HISTORY]: reply(200, history(hire)) });

      expect(await screen.findByRole('button', { name: 'Change salary' })).toBeInTheDocument();
    });

    it('does not offer it for an inactive employee, and says why, but still shows the history', async () => {
      show({ [HISTORY]: reply(200, history(hire)) }, makeEmployee({ id: 7, status: 'inactive' }));

      expect(await screen.findByText('1 Apr 2022')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Change salary' })).not.toBeInTheDocument();
      expect(screen.getByText(/inactive\. Reactivate them to change their salary/)).toBeVisible();
    });
  });

  describe('recording a change', () => {
    /** A fake API whose history grows when a change is posted, like the real one. */
    function statefulApi(onPost?: () => ReturnType<typeof reply>) {
      let records = [hire];
      return show({
        [HISTORY]: () => reply(200, history(...records)),
        'POST /api/employees/7/salary-changes': (call) => {
          if (onPost) return onPost();
          const body = call.body as { amountMinor: number; effectiveDate: string; reason: string };
          const saved = makeSalaryRecord({
            id: 3,
            employeeId: 7,
            amountMinor: body.amountMinor,
            amountUsdMinor: Math.round(body.amountMinor * 0.012),
            effectiveDate: body.effectiveDate,
            reason: body.reason as SalaryRecord['reason'],
          });
          records = [saved, ...records];
          return reply(201, saved);
        },
      });
    }

    async function openForm(user: ReturnType<typeof userEvent.setup>) {
      await user.click(await screen.findByRole('button', { name: 'Change salary' }));
      return screen.getByRole('form', { name: 'Change salary' });
    }

    it('opens the form, and Cancel closes it without saving', async () => {
      const { user, api } = statefulApi();
      const form = await openForm(user);
      expect(form).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Change salary' })).not.toBeInTheDocument();

      await user.click(within(form).getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('form', { name: 'Change salary' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Change salary' })).toBeInTheDocument();
      expect(api.callsTo('POST /api/employees/7/salary-changes')).toHaveLength(0);
    });

    it('saves the change, closes the form and shows the new record as current', async () => {
      const { user, api } = statefulApi();
      const form = await openForm(user);
      await user.type(within(form).getByLabelText(/New salary/), '2,100,000');
      const date = within(form).getByLabelText('Effective date');
      await user.clear(date);
      await user.type(date, '2024-07-01');
      await user.selectOptions(within(form).getByLabelText('Reason'), 'promotion');

      await user.click(within(form).getByRole('button', { name: 'Save salary change' }));

      await waitFor(() =>
        expect(screen.queryByRole('form', { name: 'Change salary' })).not.toBeInTheDocument(),
      );
      expect(api.callsTo('POST /api/employees/7/salary-changes')[0]?.body).toEqual({
        amountMinor: 210_000_000,
        effectiveDate: '2024-07-01',
        reason: 'promotion',
      });
      // The history was reloaded, so the new record is in the list, first and current.
      await waitFor(() => expect(rowsOf()).toHaveLength(2));
      const [newest] = rowsOf();
      expect(newest?.textContent).toContain('1 Jul 2024');
      expect(newest?.textContent).toContain('₹2,100,000.00');
      expect(newest?.textContent).toContain('Promotion');
      expect(within(newest as HTMLElement).getByText('Current')).toBeInTheDocument();
    });

    it('keeps the form open, with its values, when the server refuses the change', async () => {
      const { user } = statefulApi(() =>
        apiError(400, 'VALIDATION_ERROR', 'Request validation failed', [
          { path: 'effectiveDate', message: 'The effective date cannot be in the future' },
        ]),
      );
      const form = await openForm(user);
      await user.type(within(form).getByLabelText(/New salary/), '2100000');
      await user.selectOptions(within(form).getByLabelText('Reason'), 'promotion');

      await user.click(within(form).getByRole('button', { name: 'Save salary change' }));

      expect(await screen.findByText('The effective date cannot be in the future')).toBeVisible();
      expect(screen.getByRole('form', { name: 'Change salary' })).toBeVisible();
      expect(within(form).getByLabelText(/New salary/)).toHaveValue('2100000');
      expect(rowsOf()).toHaveLength(1);
    });
  });
});
