import { type EmployeePage, type ListEmployeesQuery, employeePageSchema } from '@acme/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { toListParams } from '@/lib/list-params';
import { apiRequest } from './client';

export const EMPLOYEES_QUERY_KEY = ['employees'] as const;

/**
 * One page of the employee directory. While the next page loads, the previous one stays on
 * screen (dimmed by the table) instead of flashing empty.
 */
export function useEmployees(query: ListEmployeesQuery) {
  const search = toListParams(query).toString();
  return useQuery({
    queryKey: [...EMPLOYEES_QUERY_KEY, 'list', search],
    queryFn: ({ signal }): Promise<EmployeePage> =>
      apiRequest(`/api/employees${search ? `?${search}` : ''}`, {
        schema: employeePageSchema,
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}
