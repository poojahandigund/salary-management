import { ArrowLeft, Pencil, UserCheck, UserX } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { ApiError } from '@/api/client';
import { useEmployee, useSetEmployeeStatus } from '@/api/employees';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { SalaryAmount } from '@/components/employees/SalaryAmount';
import { SalaryHistory } from '@/components/employees/SalaryHistory';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { countryName, formatDate, formatLevel } from '@/lib/format';
import { parseId } from '@/lib/ids';

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{children}</dd>
    </div>
  );
}

export function EmployeeDetailPage() {
  const id = parseId(useParams().id);
  const employee = useEmployee(id);
  const setStatus = useSetEmployeeStatus(id ?? 0);

  if (id === undefined || (employee.error instanceof ApiError && employee.error.status === 404)) {
    return (
      <div className="py-16 text-center">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Employee not found</h1>
        <Button variant="outline" asChild>
          <Link to="/employees">Back to employees</Link>
        </Button>
      </div>
    );
  }

  if (employee.isError) {
    return (
      <div role="alert" className="rounded-lg border bg-background p-6 text-center">
        <p className="mb-3">Could not load this employee. {employee.error.message}</p>
        <Button onClick={() => void employee.refetch()}>Try again</Button>
      </div>
    );
  }

  if (employee.isPending) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading employee">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const person = employee.data;
  const fullName = `${person.firstName} ${person.lastName}`;
  const active = person.status === 'active';
  const action = active ? 'deactivate' : 'reactivate';

  const confirm = () =>
    setStatus.mutate(action, {
      onSuccess: () => toast.success(`${fullName} was ${active ? 'deactivated' : 'reactivated'}.`),
      onError: (error) => toast.error(error.message),
    });

  return (
    <div className="space-y-4">
      <Link
        to="/employees"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Employees
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{fullName}</h1>
        <Badge variant={active ? 'outline' : 'secondary'}>{active ? 'Active' : 'Inactive'}</Badge>

        <div className="ml-auto flex gap-2">
          <Button variant="outline" asChild>
            <Link to={`/employees/${person.id}/edit`}>
              <Pencil aria-hidden />
              Edit
            </Link>
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={setStatus.isPending}>
                {active ? <UserX aria-hidden /> : <UserCheck aria-hidden />}
                {active ? 'Deactivate' : 'Reactivate'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {active ? `Deactivate ${fullName}?` : `Reactivate ${fullName}?`}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {active
                    ? 'They will no longer appear in the default employee list. Their salary history is kept, and you can reactivate them at any time.'
                    : 'They will appear in the default employee list again.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirm}>
                  {active ? 'Deactivate' : 'Reactivate'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Card>
        <CardContent>
          <dl className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Email">{person.email}</Detail>
            <Detail label="Country">{countryName(person.countryCode)}</Detail>
            <Detail label="Hire date">{formatDate(person.hireDate)}</Detail>
            <Detail label="Department">{person.department}</Detail>
            <Detail label="Job title">{person.jobTitle}</Detail>
            <Detail label="Level">{formatLevel(person.level)}</Detail>
            <Detail label="Current salary">
              <SalaryAmount salary={person.currentSalary} />
            </Detail>
          </dl>
        </CardContent>
      </Card>

      <SalaryHistory employee={person} />
    </div>
  );
}
