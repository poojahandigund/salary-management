import { type ListEmployeesQuery, DEFAULT_PAGE_SIZE, listEmployeesQuerySchema } from '@acme/shared';

/** The keys of the list query, in the order they appear in a URL. */
const KEYS = [
  'q',
  'country',
  'department',
  'jobTitle',
  'level',
  'status',
  'sort',
  'order',
  'page',
  'pageSize',
] as const;

/**
 * Reads the employee list state from a URL's query string. The address bar can hold
 * anything, so a value that is not valid is ignored (that one setting falls back to its
 * default) instead of breaking the page.
 */
export function parseListParams(params: URLSearchParams): ListEmployeesQuery {
  const raw: Record<string, string> = {};
  for (const key of KEYS) {
    const value = params.get(key);
    if (value !== null) raw[key] = value;
  }

  // Drop the settings that fail validation, one pass is enough: each problem names its key.
  const first = listEmployeesQuerySchema.safeParse(raw);
  if (first.success) return first.data;
  for (const issue of first.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string') delete raw[key];
  }
  return listEmployeesQuerySchema.parse(raw);
}

/**
 * The query string for a list state. Settings at their default value are left out, so the
 * address stays short and the default view has a clean URL.
 */
export function toListParams(query: ListEmployeesQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.country) params.set('country', query.country);
  if (query.department) params.set('department', query.department);
  if (query.jobTitle) params.set('jobTitle', query.jobTitle);
  if (query.level !== undefined) params.set('level', String(query.level));
  if (query.status !== 'active') params.set('status', query.status);
  if (query.sort !== 'name') params.set('sort', query.sort);
  if (query.order !== 'asc') params.set('order', query.order);
  if (query.page !== 1) params.set('page', String(query.page));
  if (query.pageSize !== DEFAULT_PAGE_SIZE) params.set('pageSize', String(query.pageSize));
  return params;
}

/** True when any search or filter (not sorting or paging) is applied. */
export function hasActiveFilters(query: ListEmployeesQuery): boolean {
  return (
    Boolean(query.q) ||
    query.country !== undefined ||
    query.department !== undefined ||
    query.jobTitle !== undefined ||
    query.level !== undefined ||
    query.status !== 'active'
  );
}

/** The same list with every search and filter removed. Sorting and page size are kept. */
export function withoutFilters(query: ListEmployeesQuery): ListEmployeesQuery {
  return {
    ...query,
    q: undefined,
    country: undefined,
    department: undefined,
    jobTitle: undefined,
    level: undefined,
    status: 'active',
    page: 1,
  };
}
