import {
  COUNTRIES,
  DEPARTMENT_NAMES,
  JOB_TITLES,
  MAX_LEVEL,
  MIN_LEVEL,
  type ListEmployeesQuery,
  jobTitlesFor,
} from '@acme/shared';
import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { formatLevel } from '@/lib/format';

/** How long typing must pause before the search is sent, so each keystroke is not a request. */
export const SEARCH_DEBOUNCE_MS = 300;

const LEVELS = Array.from({ length: MAX_LEVEL - MIN_LEVEL + 1 }, (_, i) => MIN_LEVEL + i);

interface EmployeeFiltersProps {
  query: ListEmployeesQuery;
  /** Called with only the settings that changed. */
  onChange: (patch: Partial<ListEmployeesQuery>) => void;
  onClear: () => void;
  canClear: boolean;
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function EmployeeFilters({ query, onChange, onClear, canClear }: EmployeeFiltersProps) {
  // The box shows what was typed straight away; the search itself runs after a short pause.
  const [text, setText] = useState(query.q ?? '');

  // Follow the address bar when it changes by itself (Back button, "Clear filters").
  useEffect(() => {
    setText(query.q ?? '');
  }, [query.q]);

  useEffect(() => {
    const typed = text.trim();
    if (typed === (query.q ?? '')) return;
    const timer = setTimeout(() => {
      onChange({ q: typed === '' ? undefined : typed });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // Only a change in what was typed should restart the timer.
  }, [text]);

  // Offer only the job titles that belong to the chosen department.
  const jobTitles = query.department === undefined ? JOB_TITLES : jobTitlesFor(query.department);

  return (
    <div className="space-y-4 rounded-lg border bg-background p-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Search by name or email"
          aria-label="Search employees"
          className="pl-9"
          maxLength={100}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Field label="Country" htmlFor="filter-country">
          <NativeSelect
            id="filter-country"
            value={query.country ?? ''}
            onChange={(event) =>
              onChange({
                country: (event.target.value || undefined) as ListEmployeesQuery['country'],
              })
            }
          >
            <option value="">All countries</option>
            {COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Department" htmlFor="filter-department">
          <NativeSelect
            id="filter-department"
            value={query.department ?? ''}
            onChange={(event) => {
              const department = (event.target.value ||
                undefined) as ListEmployeesQuery['department'];
              // A job title from another department can no longer apply.
              const keepTitle =
                department === undefined ||
                (query.jobTitle !== undefined && jobTitlesFor(department).includes(query.jobTitle));
              onChange({ department, ...(keepTitle ? {} : { jobTitle: undefined }) });
            }}
          >
            <option value="">All departments</option>
            {DEPARTMENT_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Job title" htmlFor="filter-job-title">
          <NativeSelect
            id="filter-job-title"
            value={query.jobTitle ?? ''}
            onChange={(event) =>
              onChange({
                jobTitle: (event.target.value || undefined) as ListEmployeesQuery['jobTitle'],
              })
            }
          >
            <option value="">All job titles</option>
            {jobTitles.map((title) => (
              <option key={title} value={title}>
                {title}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Level" htmlFor="filter-level">
          <NativeSelect
            id="filter-level"
            value={query.level === undefined ? '' : String(query.level)}
            onChange={(event) =>
              onChange({
                level: event.target.value === '' ? undefined : Number(event.target.value),
              })
            }
          >
            <option value="">All levels</option>
            {LEVELS.map((level) => (
              <option key={level} value={level}>
                {formatLevel(level)}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="Status" htmlFor="filter-status">
          <NativeSelect
            id="filter-status"
            value={query.status}
            onChange={(event) =>
              onChange({ status: event.target.value as ListEmployeesQuery['status'] })
            }
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </NativeSelect>
        </Field>

        <div className="flex items-end">
          <Button variant="ghost" onClick={onClear} disabled={!canClear} className="w-full">
            <X aria-hidden />
            Clear filters
          </Button>
        </div>
      </div>
    </div>
  );
}
