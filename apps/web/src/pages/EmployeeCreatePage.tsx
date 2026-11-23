import type { CreateEmployeeInput } from '@acme/shared';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useCreateEmployee } from '@/api/employees';
import { EmployeeForm } from '@/components/employees/EmployeeForm';

export function EmployeeCreatePage() {
  const navigate = useNavigate();
  const create = useCreateEmployee();

  const onSubmit = async (input: CreateEmployeeInput) => {
    const employee = await create.mutateAsync(input);
    toast.success(`${employee.firstName} ${employee.lastName} was added.`);
    void navigate('/employees');
  };

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Add employee</h1>
      <div className="rounded-lg border bg-background p-6">
        <EmployeeForm mode="create" onSubmit={onSubmit} cancelTo="/employees" />
      </div>
    </div>
  );
}
