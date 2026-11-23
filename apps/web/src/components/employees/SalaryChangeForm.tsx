import {
  type Employee,
  SALARY_REASONS,
  type SalaryChangeInput,
  currencyForCountry,
  salaryChangeInputSchema,
} from '@acme/shared';
import { Loader2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { type Resolver, useForm } from 'react-hook-form';
import { ApiError } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { formatDate, formatReason, todayIso } from '@/lib/format';
import { parseMajorToMinor } from '@/lib/money';

/** What the form holds: everything is text, as it is in the inputs. */
interface SalaryChangeFormValues {
  /** In major units as typed ("95000.50"). */
  amount: string;
  effectiveDate: string;
  reason: string;
}

type FieldName = keyof SalaryChangeFormValues;

/** `hire` is recorded when the employee is created, so it is not a choice here. */
const REASONS = SALARY_REASONS.filter((reason) => reason !== 'hire');

/** Shown instead of the schema's wording when a field has simply not been filled in yet. */
const NOT_ENTERED: Record<FieldName, string> = {
  amount: 'Enter the new salary',
  effectiveDate: 'Enter the effective date',
  reason: 'Choose a reason',
};

/** The API names the amount field `amountMinor`; the form field is the amount as typed. */
const FORM_FIELD: Record<string, FieldName | undefined> = {
  amountMinor: 'amount',
  effectiveDate: 'effectiveDate',
  reason: 'reason',
};

/**
 * Checks the form with the same Zod schema the API uses. The one translation is the
 * amount: the person types 95000.50, the API takes 9500050. The hire date is checked here
 * too, for an instant answer; the API checks it again, and checks the upper limit.
 */
function createResolver(
  hireDate: string,
): Resolver<SalaryChangeFormValues, unknown, SalaryChangeInput> {
  return (values) => {
    const errors: Partial<Record<FieldName, string>> = {};

    const amountText = values.amount.trim();
    const minor = parseMajorToMinor(amountText);
    if (amountText === '') errors.amount = NOT_ENTERED.amount;
    else if (minor === null) errors.amount = 'Enter an amount such as 95000 or 95000.50';

    const result = salaryChangeInputSchema.safeParse({
      amountMinor: minor ?? undefined,
      effectiveDate: values.effectiveDate,
      reason: values.reason,
    });

    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = typeof issue.path[0] === 'string' ? FORM_FIELD[issue.path[0]] : undefined;
        if (field === undefined || errors[field] !== undefined) continue;
        errors[field] = values[field] === '' ? NOT_ENTERED[field] : issue.message;
      }
    }

    if (errors.effectiveDate === undefined && values.effectiveDate !== '') {
      if (values.effectiveDate < hireDate) {
        errors.effectiveDate = `The effective date cannot be before the hire date (${formatDate(hireDate)})`;
      }
    }

    if (Object.keys(errors).length > 0 || !result.success) {
      return {
        values: {},
        errors: Object.fromEntries(
          Object.entries(errors).map(([field, message]) => [
            field,
            { type: 'validation', message },
          ]),
        ),
      };
    }
    return { values: result.data, errors: {} };
  };
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-sm text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${htmlFor}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

interface SalaryChangeFormProps {
  employee: Pick<Employee, 'countryCode' | 'hireDate'>;
  onSubmit: (input: SalaryChangeInput) => Promise<void>;
  onCancel: () => void;
  /** The date pre-filled in the form; defaults to today. Tests pass a fixed date. */
  today?: string;
}

/**
 * "Change salary": the new yearly amount, the date it takes effect and why. The currency
 * is the one of the employee's country, so it is shown, not asked. Problems found by the
 * server are shown next to the field they belong to.
 */
export function SalaryChangeForm({
  employee,
  onSubmit,
  onCancel,
  today = todayIso(),
}: SalaryChangeFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const currency = currencyForCountry(employee.countryCode);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SalaryChangeFormValues, unknown, SalaryChangeInput>({
    resolver: createResolver(employee.hireDate),
    defaultValues: { amount: '', effectiveDate: today, reason: '' },
  });

  const showServerError = (error: unknown) => {
    if (error instanceof ApiError && error.details.length > 0) {
      let placed = false;
      for (const detail of error.details) {
        const field = FORM_FIELD[detail.path];
        if (field !== undefined) {
          setError(field, { type: 'server', message: detail.message });
          placed = true;
        }
      }
      if (placed) return;
    }
    setFormError(error instanceof ApiError ? error.message : 'Could not save. Please try again.');
  };

  const submit = handleSubmit(async (input) => {
    setFormError(null);
    try {
      await onSubmit(input);
    } catch (error) {
      showServerError(error);
    }
  });

  const invalid = (field: FieldName) => (errors[field] ? true : undefined);
  const describedBy = (field: FieldName) => (errors[field] ? `${field}-error` : undefined);

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      aria-label="Change salary"
      className="space-y-4 rounded-lg border bg-muted/30 p-4"
    >
      {formError && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label={`New salary (${currency})`}
          htmlFor="amount"
          error={errors.amount?.message}
          hint={`Yearly, in ${currency}.`}
        >
          <Input
            id="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="e.g. 95000"
            aria-invalid={invalid('amount')}
            aria-describedby={describedBy('amount')}
            {...register('amount')}
          />
        </Field>
        <Field label="Effective date" htmlFor="effectiveDate" error={errors.effectiveDate?.message}>
          <Input
            id="effectiveDate"
            type="date"
            aria-invalid={invalid('effectiveDate')}
            aria-describedby={describedBy('effectiveDate')}
            {...register('effectiveDate')}
          />
        </Field>
        <Field
          label="Reason"
          htmlFor="reason"
          error={errors.reason?.message}
          hint="To fix a wrong entry, add a correction with the same date."
        >
          <NativeSelect
            id="reason"
            aria-invalid={invalid('reason')}
            aria-describedby={describedBy('reason')}
            {...register('reason')}
          >
            <option value="">Choose a reason</option>
            {REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {formatReason(reason)}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
          Save salary change
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
