import {
  type CreateEmployeeInput,
  type Employee,
  type EmployeePage,
  type ListEmployeesQuery,
  type UpdateEmployeeInput,
  employeePageSchema,
  employeeSchema,
} from '@acme/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

/** One employee. Pass undefined to not load anything (the id is not known yet). */
export function useEmployee(id: number | undefined) {
  return useQuery({
    queryKey: [...EMPLOYEES_QUERY_KEY, 'detail', id],
    queryFn: ({ signal }): Promise<Employee> =>
      apiRequest(`/api/employees/${id}`, { schema: employeeSchema, signal }),
    enabled: id !== undefined,
  });
}

/** Lists and detail pages show data that a change makes out of date, so refresh them all. */
function useRefreshEmployees() {
  const queryClient = useQueryClient();
  return (employee?: Employee) => {
    if (employee)
      queryClient.setQueryData([...EMPLOYEES_QUERY_KEY, 'detail', employee.id], employee);
    return queryClient.invalidateQueries({ queryKey: EMPLOYEES_QUERY_KEY });
  };
}

export function useCreateEmployee() {
  const refresh = useRefreshEmployees();
  return useMutation({
    mutationFn: (input: CreateEmployeeInput) =>
      apiRequest('/api/employees', { method: 'POST', body: input, schema: employeeSchema }),
    onSuccess: (employee) => refresh(employee),
  });
}

export function useUpdateEmployee(id: number) {
  const refresh = useRefreshEmployees();
  return useMutation({
    mutationFn: (changes: UpdateEmployeeInput) =>
      apiRequest(`/api/employees/${id}`, {
        method: 'PATCH',
        body: changes,
        schema: employeeSchema,
      }),
    onSuccess: (employee) => refresh(employee),
  });
}

/** Deactivate or reactivate. Nothing is deleted; the employee's salary history stays. */
export function useSetEmployeeStatus(id: number) {
  const refresh = useRefreshEmployees();
  return useMutation({
    mutationFn: (action: 'deactivate' | 'reactivate') =>
      apiRequest(`/api/employees/${id}/${action}`, { method: 'POST', schema: employeeSchema }),
    onSuccess: (employee) => refresh(employee),
  });
}
