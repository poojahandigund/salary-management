import { MAX_PAGE_SIZE } from '@acme/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';

export const PAGE_SIZE_OPTIONS = [25, 50, MAX_PAGE_SIZE];

interface PagerProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
}

const number = (value: number) => value.toLocaleString('en-US');

/** "Showing 26-50 of 9,412", previous and next buttons, and the page size. */
export function Pager({ page, pageSize, total, totalPages, onPage, onPageSize }: PagerProps) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p aria-live="polite" className="text-muted-foreground">
        {total === 0
          ? 'No employees'
          : first > total
            ? `${number(total)} employees`
            : `Showing ${number(first)}\u2013${number(last)} of ${number(total)}`}
      </p>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-muted-foreground">
          Rows per page
          <NativeSelect
            value={pageSize}
            onChange={(event) => onPageSize(Number(event.target.value))}
            className="h-8 w-20"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </NativeSelect>
        </label>

        <span className="text-muted-foreground">
          Page {number(page)} of {number(Math.max(totalPages, 1))}
        </span>

        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1}>
            <ChevronLeft aria-hidden />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPage(page + 1)}
            disabled={page >= totalPages}
          >
            Next
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
