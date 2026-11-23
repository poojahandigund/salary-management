import {
  COUNTRIES,
  DEPARTMENT_NAMES,
  JOB_TITLES,
  MAX_LEVEL,
  MIN_LEVEL,
  jobTitlesFor,
} from '@acme/shared';
import { X } from 'lucide-react';
import { FilterField } from '@/components/FilterField';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { formatLevel } from '@/lib/format';
import type { InsightParams } from '@/lib/insight-params';

const LEVELS = Array.from({ length: MAX_LEVEL - MIN_LEVEL + 1 }, (_, i) => MIN_LEVEL + i);

interface InsightFiltersProps {
  view: InsightParams;
  /** Called with only the settings that changed. */
  onChange: (patch: Partial<InsightParams>) => void;
  onClear: () => void;
  canClear: boolean;
}

/** Narrow the salary analysis to some of the people: a country, department, job title, level. */
export function InsightFilters({ view, onChange, onClear, canClear }: InsightFiltersProps) {
  // Offer only the job titles that belong to the chosen department.
  const jobTitles = view.department === undefined ? JOB_TITLES : jobTitlesFor(view.department);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <FilterField label="Country" htmlFor="insight-country">
        <NativeSelect
          id="insight-country"
          value={view.country ?? ''}
          onChange={(event) =>
            onChange({ country: (event.target.value || undefined) as InsightParams['country'] })
          }
        >
          <option value="">All countries</option>
          {COUNTRIES.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </NativeSelect>
      </FilterField>

      <FilterField label="Department" htmlFor="insight-department">
        <NativeSelect
          id="insight-department"
          value={view.department ?? ''}
          onChange={(event) => {
            const department = (event.target.value || undefined) as InsightParams['department'];
            // A job title from another department can no longer apply.
            const keepTitle =
              department === undefined ||
              (view.jobTitle !== undefined && jobTitlesFor(department).includes(view.jobTitle));
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
      </FilterField>

      <FilterField label="Job title" htmlFor="insight-job-title">
        <NativeSelect
          id="insight-job-title"
          value={view.jobTitle ?? ''}
          onChange={(event) =>
            onChange({ jobTitle: (event.target.value || undefined) as InsightParams['jobTitle'] })
          }
        >
          <option value="">All job titles</option>
          {jobTitles.map((title) => (
            <option key={title} value={title}>
              {title}
            </option>
          ))}
        </NativeSelect>
      </FilterField>

      <FilterField label="Level" htmlFor="insight-level">
        <NativeSelect
          id="insight-level"
          value={view.level === undefined ? '' : String(view.level)}
          onChange={(event) =>
            onChange({ level: event.target.value === '' ? undefined : Number(event.target.value) })
          }
        >
          <option value="">All levels</option>
          {LEVELS.map((level) => (
            <option key={level} value={level}>
              {formatLevel(level)}
            </option>
          ))}
        </NativeSelect>
      </FilterField>

      <div className="flex items-end">
        <Button variant="ghost" onClick={onClear} disabled={!canClear} className="w-full">
          <X aria-hidden />
          Clear filters
        </Button>
      </div>
    </div>
  );
}
