import {
  type SalaryChangeInput,
  type SalaryHistory,
  salaryHistorySchema,
  salaryRecordSchema,
} from '@acme/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from './client';
import { EMPLOYEES_QUERY_KEY } from './employees';

/**
 * The history lives under the employees key on purpose: anything that refreshes employees
 * (a salary change, an edit) then refreshes the history too, with no second list to keep in step.
 */
const historyKey = (employeeId: number) =>
  [...EMPLOYEES_QUERY_KEY, 'salary-history', employeeId] as const;

/** An employee's salary records, newest first (the first one is the current salary). */
export function useSalaryHistory(employeeId: number) {
  return useQuery({
    queryKey: historyKey(employeeId),
    queryFn: ({ signal }): Promise<SalaryHistory> =>
      apiRequest(`/api/employees/${employeeId}/salary-history`, {
        schema: salaryHistorySchema,
        signal,
      }),
  });
}

/**
 * Records a salary change. Afterwards the history, the employee's current salary and the
 * directory (which shows salaries) are all out of date, so they are all refreshed.
 */
export function useAddSalaryChange(employeeId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SalaryChangeInput) =>
      apiRequest(`/api/employees/${employeeId}/salary-changes`, {
        method: 'POST',
        body: input,
        schema: salaryRecordSchema,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EMPLOYEES_QUERY_KEY }),
  });
}
