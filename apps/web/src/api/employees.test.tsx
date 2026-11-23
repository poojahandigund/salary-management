import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeEmployee, makePage } from '@/test/fixtures';
import { mockApi, reply } from '@/test/mock-api';
import { createTestQueryClient } from '@/test/render';
import {
  EMPLOYEES_QUERY_KEY,
  useCreateEmployee,
  useSetEmployeeStatus,
  useUpdateEmployee,
} from './employees';

afterEach(() => {
  vi.unstubAllGlobals();
});

const LIST_KEY = [...EMPLOYEES_QUERY_KEY, 'list', ''];
const detailKey = (id: number) => [...EMPLOYEES_QUERY_KEY, 'detail', id];

function setup() {
  const queryClient = createTestQueryClient();
  // A list that was loaded earlier and is not on screen right now.
  queryClient.setQueryData(LIST_KEY, makePage([makeEmployee({ id: 1 })]));
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe('employee mutations keep cached data honest', () => {
  it('after updating, the saved employee is cached and every cached list is marked out of date', async () => {
    const saved = makeEmployee({ id: 7, level: 5 });
    mockApi({ 'PATCH /api/employees/7': reply(200, saved) });
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useUpdateEmployee(7), { wrapper });

    await act(() => result.current.mutateAsync({ level: 5 }));

    expect(queryClient.getQueryData(detailKey(7))).toEqual(saved);
    await waitFor(() => expect(queryClient.getQueryState(LIST_KEY)?.isInvalidated).toBe(true));
  });

  it('after creating, the new employee is cached and lists are marked out of date', async () => {
    const created = makeEmployee({ id: 99 });
    mockApi({ 'POST /api/employees': reply(201, created) });
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useCreateEmployee(), { wrapper });

    await act(() =>
      result.current.mutateAsync({
        firstName: 'Meera',
        lastName: 'Iyer',
        email: 'meera@acme.example',
        countryCode: 'IN',
        department: 'Engineering',
        jobTitle: 'Software Engineer',
        level: 4,
        hireDate: '2024-03-15',
        startingSalaryMinor: 8_500_000,
      }),
    );

    expect(queryClient.getQueryData(detailKey(99))).toEqual(created);
    await waitFor(() => expect(queryClient.getQueryState(LIST_KEY)?.isInvalidated).toBe(true));
  });

  it('after deactivating, the employee and lists are refreshed', async () => {
    const inactive = makeEmployee({ id: 7, status: 'inactive' });
    mockApi({ 'POST /api/employees/7/deactivate': reply(200, inactive) });
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useSetEmployeeStatus(7), { wrapper });

    await act(() => result.current.mutateAsync('deactivate'));

    expect(queryClient.getQueryData(detailKey(7))).toEqual(inactive);
    await waitFor(() => expect(queryClient.getQueryState(LIST_KEY)?.isInvalidated).toBe(true));
  });
});
