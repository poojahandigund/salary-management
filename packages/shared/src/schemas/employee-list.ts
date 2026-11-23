import { z } from 'zod';
import { COUNTRY_CODES } from '../reference-data/countries';
import { DEPARTMENT_NAMES, JOB_TITLES } from '../reference-data/departments';
import { EMPLOYEE_STATUSES } from '../reference-data/enums';
import { MAX_LEVEL, MIN_LEVEL } from '../reference-data/levels';
import { employeeSchema } from './employee';

/**
 * The query string of "list employees": search, filters, sorting and paging.
 * Shared so the web app builds and reads exactly what the API accepts.
 *
 * Everything is optional. Unknown parameters are rejected, so a typo such as `contry=IN`
 * is an error instead of silently returning unfiltered data.
 */

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
export const MAX_SEARCH_LENGTH = 100;

/** Columns the list can be sorted by. A fixed list: the API never sorts by arbitrary text. */
export const EMPLOYEE_SORT_FIELDS = [
  'name',
  'email',
  'country',
  'department',
  'jobTitle',
  'level',
  'hireDate',
  // By the US-dollar equivalent, since amounts in different currencies cannot be compared.
  'salary',
] as const;
export type EmployeeSortField = (typeof EMPLOYEE_SORT_FIELDS)[number];

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

/** `all` shows active and inactive employees together. */
export const STATUS_FILTERS = [...EMPLOYEE_STATUSES, 'all'] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

/** A whole number in query-string form ("3"). Rejects "", "abc" and "1.5". */
const wholeNumber = (label: string) =>
  z
    .string()
    .regex(/^\d{1,9}$/, `${label} must be a whole number`)
    .transform(Number);

/**
 * The filters that narrow employees by who they are, in query-string form. Shared by the
 * employee list and the insights, so both accept exactly the same values.
 */
export const employeeFilterFields = {
  country: z.enum(COUNTRY_CODES, 'Choose a supported country').optional(),
  department: z.enum(DEPARTMENT_NAMES, 'Choose a department').optional(),
  jobTitle: z.enum(JOB_TITLES, 'Choose a job title').optional(),
  level: wholeNumber('Level')
    .pipe(
      z
        .number()
        .min(MIN_LEVEL, `Level must be between ${MIN_LEVEL} and ${MAX_LEVEL}`)
        .max(MAX_LEVEL, `Level must be between ${MIN_LEVEL} and ${MAX_LEVEL}`),
    )
    .optional(),
};

export const listEmployeesQuerySchema = z.strictObject({
  // Matches first name, last name or email. Each word must match somewhere ("asha rao").
  q: z
    .string()
    .trim()
    .max(MAX_SEARCH_LENGTH, `Search must be at most ${MAX_SEARCH_LENGTH} characters`)
    // An empty search box means "no search".
    .transform((value) => (value === '' ? undefined : value))
    .optional(),
  ...employeeFilterFields,
  // Active employees by default: the directory is about current staff.
  status: z.enum(STATUS_FILTERS, 'Status must be active, inactive or all').default('active'),
  sort: z.enum(EMPLOYEE_SORT_FIELDS, 'Choose a column to sort by').default('name'),
  order: z.enum(SORT_DIRECTIONS, 'Order must be asc or desc').default('asc'),
  page: wholeNumber('Page').pipe(z.number().min(1, 'Page starts at 1')).default(1),
  pageSize: wholeNumber('Page size')
    .pipe(
      z
        .number()
        .min(1, 'Page size must be at least 1')
        .max(MAX_PAGE_SIZE, `Page size must be at most ${MAX_PAGE_SIZE}`),
    )
    .default(DEFAULT_PAGE_SIZE),
});
/** What the schema produces: defaults filled in, numbers converted. */
export type ListEmployeesQuery = z.output<typeof listEmployeesQuerySchema>;
/** What a caller may send: every field optional, numbers as strings or numbers. */
export type ListEmployeesQueryInput = z.input<typeof listEmployeesQuerySchema>;

/** One page of employees plus what the table needs to draw its pager. */
export const employeePageSchema = z.object({
  items: z.array(employeeSchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  /** Employees matching the filters, across all pages. */
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});
export type EmployeePage = z.infer<typeof employeePageSchema>;
