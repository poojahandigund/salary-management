import type { Employee } from '@acme/shared';
import { TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAddSalaryChange, useSalaryHistory } from '@/api/salary';
import { SalaryChangeForm } from '@/components/employees/SalaryChangeForm';
import { SalaryAmount } from '@/components/employees/SalaryAmount';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate, formatReason } from '@/lib/format';

/**
 * The salary history of one employee, newest first, with the form to record a change. An
 * inactive employee's history can be read but not changed (the API refuses too).
 */
export function SalaryHistory({ employee }: { employee: Employee }) {
  const history = useSalaryHistory(employee.id);
  const addChange = useAddSalaryChange(employee.id);
  const [adding, setAdding] = useState(false);
  const active = employee.status === 'active';

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Salary history</h2>
          {active && !adding && (
            <Button className="ml-auto" variant="outline" onClick={() => setAdding(true)}>
              <TrendingUp aria-hidden />
              Change salary
            </Button>
          )}
        </div>

        {!active && (
          <p className="text-sm text-muted-foreground">
            This employee is inactive. Reactivate them to change their salary.
          </p>
        )}

        {adding && (
          <SalaryChangeForm
            employee={employee}
            onCancel={() => setAdding(false)}
            onSubmit={async (input) => {
              await addChange.mutateAsync(input);
              toast.success('Salary change saved.');
              setAdding(false);
            }}
          />
        )}

        {history.isPending && (
          <div className="space-y-2" role="status" aria-label="Loading salary history">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        )}

        {history.isError && (
          <div role="alert" className="rounded-lg border p-4 text-center">
            <p className="mb-3">Could not load the salary history. {history.error.message}</p>
            <Button onClick={() => void history.refetch()}>Try again</Button>
          </div>
        )}

        {history.isSuccess && history.data.items.length === 0 && (
          <p className="text-sm text-muted-foreground">No salary records yet.</p>
        )}

        {history.isSuccess && history.data.items.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Effective</TableHead>
                <TableHead>Salary</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.data.items.map((record, index) => (
                <TableRow key={record.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(record.effectiveDate)}
                  </TableCell>
                  <TableCell>
                    <SalaryAmount salary={record} />
                  </TableCell>
                  <TableCell>
                    {formatReason(record.reason)}
                    {index === 0 && (
                      <Badge className="ml-2" variant="outline">
                        Current
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
