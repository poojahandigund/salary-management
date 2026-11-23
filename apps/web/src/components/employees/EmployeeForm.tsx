import {
  COUNTRIES,
  type CreateEmployeeInput,
  DEPARTMENT_NAMES,
  type Employee,
  MAX_LEVEL,
  MIN_LEVEL,
  type UpdateEmployeeInput,
  createEmployeeInputSchema,
  currencyForCountry,
  jobTitlesFor,
  updateEmployeeInputSchema,
} from '@acme/shared';
import { Loader2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { type Resolver, useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { ApiError } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { formatLevel } from '@/lib/format';
import { parseMajorToMinor } from '@/lib/money';

/** What the form holds: everything is text, as it is in the inputs. */
export interface EmployeeFormValues {
  firstName: string;
  lastName: string;
  email: string;
  countryCode: string;
  department: string;
  jobTitle: string;
  level: string;
  hireDate: string;
  /** In major units as typed ("85000.50"); only used when adding an employee. */
  startingSalary: string;
}

type Payload = CreateEmployeeInput | UpdateEmployeeInput;
type EditableField = keyof UpdateEmployeeInput;

const EMPTY_VALUES: EmployeeFormValues = {
  firstName: '',
  lastName: '',
  email: '',
  countryCode: '',
  department: '',
  jobTitle: '',
  level: '',
  hireDate: '',
  startingSalary: '',
};

/** Shown instead of the schema's wording when a choice has simply not been made yet. */
const NOT_CHOSEN: Partial<Record<keyof EmployeeFormValues, string>> = {
  countryCode: 'Choose a country',
  department: 'Choose a department',
  jobTitle: 'Choose a job title',
  level: 'Choose a level',
  hireDate: 'Enter the hire date',
};

const LEVELS = Array.from({ length: MAX_LEVEL - MIN_LEVEL + 1 }, (_, i) => MIN_LEVEL + i);

function toFormValues(employee: Employee): EmployeeFormValues {
  return {
    ...EMPTY_VALUES,
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    countryCode: employee.countryCode,
    department: employee.department,
    jobTitle: employee.jobTitle,
    level: String(employee.level),
    hireDate: employee.hireDate,
  };
}

/**
 * Checks the form with the same Zod schemas the API uses, so the rules exist in one place.
 * The only translation is the salary: the person types 85000.50, the API takes 8500050.
 */
function createResolver(mode: 'create' | 'edit'): Resolver<EmployeeFormValues, unknown, Payload> {
  return (values) => {
    const errors: Partial<Record<keyof EmployeeFormValues, string>> = {};

    const fields = {
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      countryCode: values.countryCode,
      department: values.department,
      jobTitle: values.jobTitle,
      level: values.level === '' ? undefined : Number(values.level),
      hireDate: values.hireDate,
    };

    let result;
    if (mode === 'create') {
      const salaryText = values.startingSalary.trim();
      const minor = parseMajorToMinor(salaryText);
      if (salaryText === '') errors.startingSalary = 'Enter the starting salary';
      else if (minor === null) errors.startingSalary = 'Enter an amount such as 85000 or 85000.50';
      result = createEmployeeInputSchema.safeParse({
        ...fields,
        startingSalaryMinor: minor ?? undefined,
      });
    } else {
      result = updateEmployeeInputSchema.safeParse(fields);
    }

    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = issue.path[0];
        if (typeof key !== 'string') continue;
        // The form field is the salary as typed, not the API's minor-unit number.
        const field = (
          key === 'startingSalaryMinor' ? 'startingSalary' : key
        ) as keyof EmployeeFormValues;
        if (field === 'startingSalary' && errors.startingSalary) continue;
        const empty = values[field] === '' && NOT_CHOSEN[field];
        errors[field] ??= empty || issue.message;
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

type Props =
  | { mode: 'create'; onSubmit: (input: CreateEmployeeInput) => Promise<void>; cancelTo: string }
  | {
      mode: 'edit';
      initial: Employee;
      /** Only the fields that changed. */
      onSubmit: (changes: UpdateEmployeeInput) => Promise<void>;
      cancelTo: string;
    };

/**
 * The add and edit employee form. Adding also takes the starting salary; editing sends only
 * the fields that changed. Problems found by the server (a duplicate email, say) are shown
 * next to the field they belong to.
 */
export function EmployeeForm(props: Props) {
  const { mode } = props;
  const initial = props.mode === 'edit' ? props.initial : undefined;
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    getValues,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<EmployeeFormValues, unknown, Payload>({
    resolver: createResolver(mode),
    defaultValues: initial ? toFormValues(initial) : EMPTY_VALUES,
  });

  const department = watch('department');
  const countryCode = watch('countryCode');
  const jobTitles =
    department === '' ? [] : jobTitlesFor(department as (typeof DEPARTMENT_NAMES)[number]);
  const currency = COUNTRIES.some((country) => country.code === countryCode)
    ? currencyForCountry(countryCode as (typeof COUNTRIES)[number]['code'])
    : undefined;

  const showServerError = (error: unknown) => {
    if (error instanceof ApiError && error.details.length > 0) {
      let placed = false;
      for (const detail of error.details) {
        const field = (
          detail.path === 'startingSalaryMinor' ? 'startingSalary' : detail.path
        ) as keyof EmployeeFormValues;
        if (field in EMPTY_VALUES) {
          setError(field, { type: 'server', message: detail.message });
          placed = true;
        }
      }
      if (placed) return;
    }
    setFormError(error instanceof ApiError ? error.message : 'Could not save. Please try again.');
  };

  const submit = handleSubmit(async (payload) => {
    setFormError(null);
    try {
      if (props.mode === 'create') {
        await props.onSubmit(payload as CreateEmployeeInput);
        return;
      }
      const all = payload as Required<UpdateEmployeeInput>;
      const changes: Record<string, unknown> = {};
      for (const key of Object.keys(all) as EditableField[]) {
        if (all[key] !== props.initial[key]) changes[key] = all[key];
      }
      if (Object.keys(changes).length === 0) {
        setFormError('No changes to save.');
        return;
      }
      await props.onSubmit(changes as UpdateEmployeeInput);
    } catch (error) {
      showServerError(error);
    }
  });

  const invalid = (field: keyof EmployeeFormValues) => (errors[field] ? true : undefined);
  const describedBy = (field: keyof EmployeeFormValues) =>
    errors[field] ? `${field}-error` : undefined;

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="space-y-6">
      {formError && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="firstName" error={errors.firstName?.message}>
          <Input
            id="firstName"
            autoComplete="off"
            aria-invalid={invalid('firstName')}
            aria-describedby={describedBy('firstName')}
            {...register('firstName')}
          />
        </Field>
        <Field label="Last name" htmlFor="lastName" error={errors.lastName?.message}>
          <Input
            id="lastName"
            autoComplete="off"
            aria-invalid={invalid('lastName')}
            aria-describedby={describedBy('lastName')}
            {...register('lastName')}
          />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="off"
            aria-invalid={invalid('email')}
            aria-describedby={describedBy('email')}
            {...register('email')}
          />
        </Field>
        <Field label="Hire date" htmlFor="hireDate" error={errors.hireDate?.message}>
          <Input
            id="hireDate"
            type="date"
            aria-invalid={invalid('hireDate')}
            aria-describedby={describedBy('hireDate')}
            {...register('hireDate')}
          />
        </Field>

        <Field label="Country" htmlFor="countryCode" error={errors.countryCode?.message}>
          <NativeSelect
            id="countryCode"
            aria-invalid={invalid('countryCode')}
            aria-describedby={describedBy('countryCode')}
            {...register('countryCode')}
          >
            <option value="">Choose a country</option>
            {COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Level" htmlFor="level" error={errors.level?.message}>
          <NativeSelect
            id="level"
            aria-invalid={invalid('level')}
            aria-describedby={describedBy('level')}
            {...register('level')}
          >
            <option value="">Choose a level</option>
            {LEVELS.map((level) => (
              <option key={level} value={level}>
                {formatLevel(level)}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Department" htmlFor="department" error={errors.department?.message}>
          <NativeSelect
            id="department"
            aria-invalid={invalid('department')}
            aria-describedby={describedBy('department')}
            {...register('department', {
              onChange: (event: { target: { value: string } }) => {
                // The job title must belong to the department, so a title from the old one is cleared.
                const next = event.target.value;
                const titles =
                  next === '' ? [] : jobTitlesFor(next as (typeof DEPARTMENT_NAMES)[number]);
                if (!(titles as readonly string[]).includes(getValues('jobTitle'))) {
                  setValue('jobTitle', '');
                }
              },
            })}
          >
            <option value="">Choose a department</option>
            {DEPARTMENT_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          label="Job title"
          htmlFor="jobTitle"
          error={errors.jobTitle?.message}
          hint={department === '' ? 'Choose a department first' : undefined}
        >
          <NativeSelect
            id="jobTitle"
            disabled={department === ''}
            aria-invalid={invalid('jobTitle')}
            aria-describedby={describedBy('jobTitle')}
            {...register('jobTitle')}
          >
            <option value="">Choose a job title</option>
            {jobTitles.map((title) => (
              <option key={title} value={title}>
                {title}
              </option>
            ))}
          </NativeSelect>
        </Field>

        {mode === 'create' && (
          <Field
            label={currency ? `Starting salary (${currency})` : 'Starting salary'}
            htmlFor="startingSalary"
            error={errors.startingSalary?.message}
            hint={
              currency
                ? `Yearly, in ${currency}, the currency of the chosen country.`
                : 'Choose a country to see the currency.'
            }
          >
            <Input
              id="startingSalary"
              inputMode="decimal"
              autoComplete="off"
              placeholder="e.g. 85000"
              aria-invalid={invalid('startingSalary')}
              aria-describedby={describedBy('startingSalary')}
              {...register('startingSalary')}
            />
          </Field>
        )}
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
          {mode === 'create' ? 'Add employee' : 'Save changes'}
        </Button>
        <Button variant="outline" asChild>
          <Link to={props.cancelTo}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
