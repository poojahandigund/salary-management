import type { EmployeeSortField, ListEmployeesQuery } from '@acme/shared';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useEmployees } from '@/api/employees';
import { EmployeeFilters } from '@/components/employees/EmployeeFilters';
import { EmployeeTable } from '@/components/employees/EmployeeTable';
import { Pager } from '@/components/employees/Pager';
import { Button } from '@/components/ui/button';
import { hasActiveFilters, parseListParams, toListParams, withoutFilters } from '@/lib/list-params';

export function EmployeeDirectoryPage() {
  // The whole list state (search, filters, sort, page) lives in the address bar: a view can
  // be bookmarked or shared, and the Back button steps through it.
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => parseListParams(params), [params]);
  const employees = useEmployees(query);

  const show = (next: ListEmployeesQuery, options?: { replace?: boolean }) =>
    setParams(toListParams(next), options);

  /** Change search, filters or sorting. The first page is shown again, as the results differ. */
  const change = (patch: Partial<ListEmployeesQuery>) =>
    show({ ...query, ...patch, page: 1 }, { replace: 'q' in patch });

  const sortBy = (field: EmployeeSortField) =>
    change(
      query.sort === field
        ? { order: query.order === 'asc' ? 'desc' : 'asc' }
        : { sort: field, order: 'asc' },
    );

  const data = employees.data;
  const pastTheEnd = data !== undefined && data.items.length === 0 && data.total > 0;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>

      <EmployeeFilters
        query={query}
        onChange={change}
        onClear={() => show(withoutFilters(query))}
        canClear={hasActiveFilters(query)}
      />

      {employees.isError && !data ? (
        <div role="alert" className="rounded-lg border bg-background p-6 text-center">
          <p className="mb-3">Could not load employees. {employees.error.message}</p>
          <Button onClick={() => void employees.refetch()}>Try again</Button>
        </div>
      ) : (
        <>
          {data !== undefined && data.items.length === 0 ? (
            <div className="rounded-lg border bg-background p-10 text-center">
              {pastTheEnd ? (
                <>
                  <p className="mb-3">There is no page {query.page}.</p>
                  <Button variant="outline" onClick={() => show({ ...query, page: 1 })}>
                    Go to the first page
                  </Button>
                </>
              ) : (
                <p>No employees match your search or filters.</p>
              )}
            </div>
          ) : (
            <EmployeeTable
              employees={data?.items}
              query={query}
              onSort={sortBy}
              refreshing={employees.isPlaceholderData}
              skeletonRows={Math.min(query.pageSize, 10)}
            />
          )}

          {data !== undefined && (
            <Pager
              page={query.page}
              pageSize={query.pageSize}
              total={data.total}
              totalPages={data.totalPages}
              onPage={(page) => show({ ...query, page })}
              onPageSize={(pageSize) => change({ pageSize })}
            />
          )}
        </>
      )}
    </div>
  );
}
