import type { UpdateEmployeeInput } from '@acme/shared';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ApiError } from '@/api/client';
import { useEmployee, useUpdateEmployee } from '@/api/employees';
import { EmployeeForm } from '@/components/employees/EmployeeForm';
import { Button } from '@/components/ui/button';
import { parseId } from '@/lib/ids';

export function EmployeeEditPage() {
  const id = parseId(useParams().id);
  const employee = useEmployee(id);

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
    return <p role="status">Loading employee</p>;
  }

  return <EditForm id={id} initial={employee.data} />;
}

function EditForm({
  id,
  initial,
}: {
  id: number;
  initial: NonNullable<ReturnType<typeof useEmployee>['data']>;
}) {
  const navigate = useNavigate();
  const update = useUpdateEmployee(id);

  const onSubmit = async (changes: UpdateEmployeeInput) => {
    const saved = await update.mutateAsync(changes);
    toast.success(`${saved.firstName} ${saved.lastName} was updated.`);
    void navigate('/employees');
  };

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        Edit {initial.firstName} {initial.lastName}
      </h1>
      <div className="rounded-lg border bg-background p-6">
        <EmployeeForm mode="edit" initial={initial} onSubmit={onSubmit} cancelTo="/employees" />
      </div>
    </div>
  );
}
