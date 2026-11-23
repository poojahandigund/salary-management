import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeEmployee, makePage, makeSalaryRecord } from '@/test/fixtures';
import { apiError, mockApi, reply } from '@/test/mock-api';
import { createTestQueryClient } from '@/test/render';
import { EMPLOYEES_QUERY_KEY } from './employees';
import { useAddSalaryChange, useSalaryHistory } from './salary';

afterEach(() => {
  vi.unstubAllGlobals();
});

const LIST_KEY = [...EMPLOYEES_QUERY_KEY, 'list', ''];
const DETAIL_KEY = [...EMPLOYEES_QUERY_KEY, 'detail', 7];
const HISTORY_KEY = [...EMPLOYEES_QUERY_KEY, 'salary-history', 7];

const change = {
  amountMinor: 210_000_000,
  effectiveDate: '2024-07-01',
  reason: 'promotion',
} as const;

function setup() {
  const queryClient = createTestQueryClient();
  // The test client forgets unused data at once; keep it, so the checks below can look at it.
  queryClient.setDefaultOptions({ queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } });
  // Data that was loaded earlier, and is out of date once a salary changes.
  queryClient.setQueryData(LIST_KEY, makePage([makeEmployee({ id: 7 })]));
  queryClient.setQueryData(DETAIL_KEY, makeEmployee({ id: 7 }));
  queryClient.setQueryData(HISTORY_KEY, { items: [makeSalaryRecord({ employeeId: 7 })] });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe('useSalaryHistory', () => {
  it('loads the history of the employee, validated against the shared schema', async () => {
    const record = makeSalaryRecord({ employeeId: 7 });
    const api = mockApi({
      'GET /api/employees/7/salary-history': reply(200, { items: [record] }),
    });
    const queryClient = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useSalaryHistory(7), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ items: [record] });
    expect(api.callsTo('GET /api/employees/7/salary-history')).toHaveLength(1);
  });

  it('treats a response in the wrong shape as an error, instead of showing wrong data', async () => {
    mockApi({
      'GET /api/employees/7/salary-history': reply(200, { items: [{ id: 'x' }] }),
    });
    const queryClient = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useSalaryHistory(7), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useAddSalaryChange', () => {
  it('posts the change to the employee, as sent', async () => {
    const saved = makeSalaryRecord({ employeeId: 7, ...change });
    const api = mockApi({ 'POST /api/employees/7/salary-changes': reply(201, saved) });
    const { wrapper } = setup();
    const { result } = renderHook(() => useAddSalaryChange(7), { wrapper });

    const record = await act(() => result.current.mutateAsync(change));

    expect(record).toEqual(saved);
    expect(api.callsTo('POST /api/employees/7/salary-changes')[0]?.body).toEqual(change);
  });

  it('afterwards marks the history, the employee and every list as out of date', async () => {
    mockApi({
      'POST /api/employees/7/salary-changes': reply(201, makeSalaryRecord({ employeeId: 7 })),
    });
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useAddSalaryChange(7), { wrapper });

    await act(() => result.current.mutateAsync(change));

    await waitFor(() => {
      expect(queryClient.getQueryState(HISTORY_KEY)?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(DETAIL_KEY)?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(LIST_KEY)?.isInvalidated).toBe(true);
    });
  });

  it('leaves cached data alone when the change is refused', async () => {
    mockApi({
      'POST /api/employees/7/salary-changes': apiError(409, 'EMPLOYEE_INACTIVE', 'Inactive'),
    });
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useAddSalaryChange(7), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(change).catch(() => undefined);
    });

    expect(queryClient.getQueryState(HISTORY_KEY)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(LIST_KEY)?.isInvalidated).toBe(false);
  });
});
