import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeStats, makeSummary } from '@/test/fixtures';
import { apiError, mockApi, reply } from '@/test/mock-api';
import { createTestQueryClient } from '@/test/render';
import { EMPLOYEES_QUERY_KEY } from './employees';
import { INSIGHTS_QUERY_KEY, useInsightsSummary, useSalaryStats } from './insights';

afterEach(() => {
  vi.unstubAllGlobals();
});

function setup() {
  const queryClient = createTestQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe('useInsightsSummary', () => {
  it('loads the summary, validated against the shared schema', async () => {
    const summary = makeSummary();
    const api = mockApi({ 'GET /api/insights/summary': reply(200, summary) });
    const { wrapper } = setup();

    const { result } = renderHook(() => useInsightsSummary(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(summary);
    expect(api.callsTo('GET /api/insights/summary')).toHaveLength(1);
  });

  it('fails, instead of showing odd numbers, when the answer is not what was promised', async () => {
    mockApi({ 'GET /api/insights/summary': reply(200, { totals: 'lots' }) });
    const { wrapper } = setup();

    const { result } = renderHook(() => useInsightsSummary(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('reports the error the server sent', async () => {
    mockApi({ 'GET /api/insights/summary': apiError(500, 'INTERNAL', 'Something went wrong') });
    const { wrapper } = setup();

    const { result } = renderHook(() => useInsightsSummary(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Something went wrong');
  });
});

describe('useSalaryStats', () => {
  it('asks for the grouping, always, even the default one', async () => {
    const api = mockApi({ 'GET /api/insights/salary-stats': reply(200, makeStats()) });
    const { wrapper } = setup();

    const { result } = renderHook(() => useSalaryStats({ groupBy: 'country' }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.calls[0]?.url).toBe('/api/insights/salary-stats?groupBy=country');
  });

  it('sends the filters along with the grouping', async () => {
    const api = mockApi({
      'GET /api/insights/salary-stats': reply(200, makeStats({ groupBy: 'level' })),
    });
    const { wrapper } = setup();

    const { result } = renderHook(
      () => useSalaryStats({ groupBy: 'level', country: 'IN', department: 'Sales', level: 3 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const params = new URL(api.calls[0]?.url ?? '', 'http://x').searchParams;
    expect(Object.fromEntries(params)).toEqual({
      groupBy: 'level',
      country: 'IN',
      department: 'Sales',
      level: '3',
    });
  });

  it('keeps the earlier figures on screen while the next ones load', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockApi({
      'GET /api/insights/salary-stats': async (call) => {
        if (call.url.includes('groupBy=level')) await gate;
        return reply(
          200,
          makeStats({ groupBy: call.url.includes('groupBy=level') ? 'level' : 'country' }),
        );
      },
    });
    const { wrapper } = setup();
    const { result, rerender } = renderHook(({ groupBy }) => useSalaryStats({ groupBy }), {
      wrapper,
      initialProps: { groupBy: 'country' as 'country' | 'level' },
    });
    await waitFor(() => expect(result.current.data?.groupBy).toBe('country'));

    rerender({ groupBy: 'level' });

    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data?.groupBy).toBe('country');
    release();
    await waitFor(() => expect(result.current.data?.groupBy).toBe('level'));
    expect(result.current.isPlaceholderData).toBe(false);
  });

  it('is refreshed, like every employee query, when employees or salaries change', async () => {
    mockApi({ 'GET /api/insights/salary-stats': reply(200, makeStats()) });
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useSalaryStats({ groupBy: 'country' }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await queryClient.invalidateQueries({ queryKey: EMPLOYEES_QUERY_KEY, refetchType: 'none' });

    const state = queryClient.getQueryState([
      ...INSIGHTS_QUERY_KEY,
      'salary-stats',
      'groupBy=country',
    ]);
    expect(state?.isInvalidated).toBe(true);
  });
});

describe('INSIGHTS_QUERY_KEY', () => {
  it('sits under the employees key, so one invalidation refreshes both', () => {
    expect(INSIGHTS_QUERY_KEY.slice(0, EMPLOYEES_QUERY_KEY.length)).toEqual([
      ...EMPLOYEES_QUERY_KEY,
    ]);
  });
});
