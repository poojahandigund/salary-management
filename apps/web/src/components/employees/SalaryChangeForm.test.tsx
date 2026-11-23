import type { SalaryChangeInput } from '@acme/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/client';
import { SalaryChangeForm } from './SalaryChangeForm';

const TODAY = '2026-06-15';
const india = { countryCode: 'IN', hireDate: '2022-04-01' } as const;

function setup(
  options: {
    employee?: { countryCode: 'IN' | 'US' | 'GB' | 'DE'; hireDate: string };
    onSubmit?: (input: SalaryChangeInput) => Promise<void>;
  } = {},
) {
  const onSubmit = vi.fn(options.onSubmit ?? (() => Promise.resolve()));
  const onCancel = vi.fn();
  const user = userEvent.setup({ delay: null });
  render(
    <SalaryChangeForm
      employee={options.employee ?? india}
      onSubmit={onSubmit}
      onCancel={onCancel}
      today={TODAY}
    />,
  );
  return { user, onSubmit, onCancel };
}

const amount = () => screen.getByLabelText(/New salary/);
const date = () => screen.getByLabelText('Effective date');
const reason = () => screen.getByLabelText('Reason');
const save = () => screen.getByRole('button', { name: 'Save salary change' });
const errorOf = (id: string) => document.getElementById(`${id}-error`)?.textContent;

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  values: { amount?: string; date?: string; reason?: string },
) {
  if (values.amount !== undefined) {
    await user.clear(amount());
    await user.type(amount(), values.amount);
  }
  if (values.date !== undefined) {
    await user.clear(date());
    await user.type(date(), values.date);
  }
  if (values.reason !== undefined) await user.selectOptions(reason(), values.reason);
}

describe('SalaryChangeForm', () => {
  describe('what it shows', () => {
    it.each([
      ['IN', 'INR'],
      ['US', 'USD'],
      ['GB', 'GBP'],
      ['DE', 'EUR'],
    ] as const)(
      'names the currency of the employee country: %s pays in %s',
      (countryCode, code) => {
        setup({ employee: { countryCode, hireDate: '2022-04-01' } });

        expect(screen.getByLabelText(`New salary (${code})`)).toBeInTheDocument();
        expect(screen.getByText(`Yearly, in ${code}.`)).toBeInTheDocument();
      },
    );

    it('pre-fills the effective date with today', () => {
      setup();

      expect(date()).toHaveValue(TODAY);
    });

    it('offers the reasons for a change, but not "Hire"', () => {
      setup();

      const options = within(reason())
        .getAllByRole('option')
        .map((option) => option.textContent);
      expect(options).toEqual(['Choose a reason', 'Promotion', 'Annual review', 'Correction']);
    });
  });

  describe('submitting', () => {
    it('sends the amount in minor units, with the date and the reason', async () => {
      const { user, onSubmit } = setup();

      await fill(user, { amount: '95,000.50', date: '2026-01-01', reason: 'promotion' });
      await user.click(save());

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit).toHaveBeenCalledWith({
        amountMinor: 9_500_050,
        effectiveDate: '2026-01-01',
        reason: 'promotion',
      });
    });

    it('sends a whole amount without decimals correctly', async () => {
      const { user, onSubmit } = setup();

      await fill(user, { amount: '95000', reason: 'annual_review' });
      await user.click(save());

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit).toHaveBeenCalledWith({
        amountMinor: 9_500_000,
        effectiveDate: TODAY,
        reason: 'annual_review',
      });
    });

    it('can use the hire date as the effective date', async () => {
      const { user, onSubmit } = setup();

      await fill(user, { amount: '95000', date: '2022-04-01', reason: 'correction' });
      await user.click(save());

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    });

    it('disables the button while saving, so a double click cannot save twice', async () => {
      let finish: () => void = () => undefined;
      const { user, onSubmit } = setup({
        onSubmit: () => new Promise<void>((resolve) => (finish = resolve)),
      });
      await fill(user, { amount: '95000', reason: 'promotion' });

      await user.click(save());

      await waitFor(() => expect(save()).toBeDisabled());
      await user.click(save());
      expect(onSubmit).toHaveBeenCalledTimes(1);
      finish();
      await waitFor(() => expect(save()).toBeEnabled());
    });
  });

  describe('checks before sending', () => {
    it('asks for every field and sends nothing when the form is empty', async () => {
      const { user, onSubmit } = setup();
      await user.clear(date());

      await user.click(save());

      expect(await screen.findByText('Enter the new salary')).toBeInTheDocument();
      expect(errorOf('effectiveDate')).toBe('Enter the effective date');
      expect(errorOf('reason')).toBe('Choose a reason');
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it.each([
      ['letters', 'abc'],
      ['a currency symbol', '₹95000'],
      ['more than two decimals', '95000.123'],
      ['a negative amount', '-5'],
      ['two points', '1.2.3'],
    ])('rejects %s in the amount', async (_label, text) => {
      const { user, onSubmit } = setup();
      await fill(user, { amount: text, reason: 'promotion' });

      await user.click(save());

      expect(await screen.findByText('Enter an amount such as 95000 or 95000.50')).toBeVisible();
      expect(amount()).toHaveAttribute('aria-invalid', 'true');
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('rejects an amount of zero', async () => {
      const { user, onSubmit } = setup();
      await fill(user, { amount: '0', reason: 'promotion' });

      await user.click(save());

      await waitFor(() => expect(errorOf('amount')).toMatch(/greater than zero/i));
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('rejects an amount above the limit', async () => {
      const { user, onSubmit } = setup();
      await fill(user, { amount: '1,000,000,000.01', reason: 'promotion' });

      await user.click(save());

      await waitFor(() => expect(errorOf('amount')).toBe('Amount is too large'));
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('rejects an effective date before the hire date, naming the hire date', async () => {
      const { user, onSubmit } = setup();
      await fill(user, { amount: '95000', date: '2022-03-31', reason: 'promotion' });

      await user.click(save());

      await waitFor(() =>
        expect(errorOf('effectiveDate')).toBe(
          'The effective date cannot be before the hire date (1 Apr 2022)',
        ),
      );
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('moves the error away once the field is corrected', async () => {
      const { user, onSubmit } = setup();
      await fill(user, { amount: 'abc', reason: 'promotion' });
      await user.click(save());
      await screen.findByText('Enter an amount such as 95000 or 95000.50');

      await fill(user, { amount: '95000' });
      await user.click(save());

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(errorOf('amount')).toBeUndefined();
    });
  });

  describe('problems found by the server', () => {
    const rejection = (details: { path: string; message: string }[]) =>
      new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed', details);

    it('shows a problem with the date next to the date, and keeps what was typed', async () => {
      const { user } = setup({
        onSubmit: () =>
          Promise.reject(
            rejection([
              { path: 'effectiveDate', message: 'The effective date cannot be in the future' },
            ]),
          ),
      });
      await fill(user, { amount: '95000', date: '2026-12-01', reason: 'promotion' });

      await user.click(save());

      await waitFor(() =>
        expect(errorOf('effectiveDate')).toBe('The effective date cannot be in the future'),
      );
      expect(amount()).toHaveValue('95000');
      expect(date()).toHaveValue('2026-12-01');
      expect(reason()).toHaveValue('promotion');
    });

    it('shows a problem with the amount next to the salary field, not under "amountMinor"', async () => {
      const { user } = setup({
        onSubmit: () =>
          Promise.reject(rejection([{ path: 'amountMinor', message: 'Amount is too large' }])),
      });
      await fill(user, { amount: '95000', reason: 'promotion' });

      await user.click(save());

      await waitFor(() => expect(errorOf('amount')).toBe('Amount is too large'));
    });

    it('shows a problem that belongs to no field as a message above the form', async () => {
      const { user } = setup({
        onSubmit: () =>
          Promise.reject(
            new ApiError(
              409,
              'EMPLOYEE_INACTIVE',
              'This employee is inactive. Reactivate them before changing their salary.',
            ),
          ),
      });
      await fill(user, { amount: '95000', reason: 'promotion' });

      await user.click(save());

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'This employee is inactive. Reactivate them before changing their salary.',
      );
    });

    it('shows a generic message when the failure is not an API error', async () => {
      const { user } = setup({ onSubmit: () => Promise.reject(new Error('boom')) });
      await fill(user, { amount: '95000', reason: 'promotion' });

      await user.click(save());

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Could not save. Please try again.',
      );
    });

    it('lets the person fix the problem and try again', async () => {
      let attempts = 0;
      const { user, onSubmit } = setup({
        onSubmit: () => {
          attempts += 1;
          return attempts === 1
            ? Promise.reject(rejection([{ path: 'amountMinor', message: 'Amount is too large' }]))
            : Promise.resolve();
        },
      });
      await fill(user, { amount: '95000', reason: 'promotion' });
      await user.click(save());
      await waitFor(() => expect(errorOf('amount')).toBe('Amount is too large'));

      await fill(user, { amount: '90000' });
      await user.click(save());

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
      expect(errorOf('amount')).toBeUndefined();
    });
  });

  it('calls onCancel from the Cancel button, without saving', async () => {
    const { user, onSubmit, onCancel } = setup();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
