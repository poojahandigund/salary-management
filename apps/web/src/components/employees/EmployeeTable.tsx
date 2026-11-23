import type { Employee, EmployeeSortField, ListEmployeesQuery } from '@acme/shared';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Link } from 'react-router';
import { SalaryAmount } from '@/components/employees/SalaryAmount';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { countryName, formatDate, formatLevel } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Column {
  header: string;
  /** Set when the server can sort by this column. */
  sortField?: EmployeeSortField;
}

const COLUMNS: Column[] = [
  { header: 'Name', sortField: 'name' },
  { header: 'Email', sortField: 'email' },
  { header: 'Country', sortField: 'country' },
  { header: 'Department', sortField: 'department' },
  { header: 'Job title', sortField: 'jobTitle' },
  { header: 'Level', sortField: 'level' },
  { header: 'Salary', sortField: 'salary' },
  { header: 'Hired', sortField: 'hireDate' },
  { header: 'Status' },
];

interface EmployeeTableProps {
  /** Undefined while the first page is loading. */
  employees: Employee[] | undefined;
  query: ListEmployeesQuery;
  onSort: (field: EmployeeSortField) => void;
  /** True while a new page is loading over the old one. */
  refreshing: boolean;
  /** How many placeholder rows to show during the first load. */
  skeletonRows: number;
}

function SortHeader({
  column,
  query,
  onSort,
}: {
  column: Column;
  query: ListEmployeesQuery;
  onSort: (field: EmployeeSortField) => void;
}) {
  const field = column.sortField;
  if (field === undefined) return <TableHead>{column.header}</TableHead>;

  const active = query.sort === field;
  const Icon = !active ? ArrowUpDown : query.order === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead aria-sort={active ? (query.order === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className="-ml-2 inline-flex items-center gap-1 rounded px-2 py-1 font-medium hover:bg-accent"
      >
        {column.header}
        <Icon className={cn('size-3.5', !active && 'text-muted-foreground')} aria-hidden />
      </button>
    </TableHead>
  );
}

export function EmployeeTable({
  employees,
  query,
  onSort,
  refreshing,
  skeletonRows,
}: EmployeeTableProps) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-background transition-opacity',
        refreshing && 'opacity-60',
      )}
      aria-busy={refreshing || employees === undefined}
    >
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((column) => (
              <SortHeader key={column.header} column={column} query={query} onSort={onSort} />
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {employees === undefined
            ? Array.from({ length: skeletonRows }, (_, row) => (
                <TableRow key={row} data-testid="skeleton-row">
                  {COLUMNS.map((column) => (
                    <TableCell key={column.header}>
                      <Skeleton className="h-4 w-full max-w-32" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : employees.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell className="font-medium">
                    <Link to={`/employees/${employee.id}`} className="hover:underline">
                      {employee.firstName} {employee.lastName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{employee.email}</TableCell>
                  <TableCell>{countryName(employee.countryCode)}</TableCell>
                  <TableCell>{employee.department}</TableCell>
                  <TableCell>{employee.jobTitle}</TableCell>
                  <TableCell>{formatLevel(employee.level)}</TableCell>
                  <TableCell>
                    <SalaryAmount salary={employee.currentSalary} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(employee.hireDate)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={employee.status === 'active' ? 'outline' : 'secondary'}>
                      {employee.status === 'active' ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
        </TableBody>
      </Table>
    </div>
  );
}
