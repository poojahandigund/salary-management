import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { makeEmployee, makePage, makeSalaryRecord } from '@/test/fixtures';
import { apiError, mockApi, reply } from '@/test/mock-api';
import { renderWithProviders } from '@/test/render';

afterEach(() => {
  vi.unstubAllGlobals();
});

const session = reply(200, { user: { username: 'hr.manager' } });
const asha = makeEmployee({
  id: 7,
  firstName: 'Asha',
  lastName: 'Rao',
  email: 'asha.rao@acme.example',
  countryCode: 'IN',
  department: 'Engineering',
  jobTitle: 'Software Engineer',
  level: 3,
  hireDate: '2022-04-01',
});

type Routes = Parameters<typeof mockApi>[0];

function openAt(route: string, routes: Routes = {}) {
  const api = mockApi({
    'GET /api/auth/me': session,
    'GET /api/employees': reply(200, makePage([asha])),
    'GET /api/employees/7/salary-history': reply(200, {
      items: [makeSalaryRecord({ employeeId: 7 })],
    }),
    ...routes,
  });
  const user = userEvent.setup({ delay: null });
  renderWithProviders(<App />, { route });
  return { api, user };
}

describe('employee detail page', () => {
  it('shows the employee’s details in readable form', async () => {
    openAt('/employees/7', { 'GET /api/employees/7': reply(200, asha) });

    expect(await screen.findByRole('heading', { name: 'Asha Rao' })).toBeInTheDocument();
    const details = screen.getByText('Email').closest('dl') as HTMLElement;
    const text = details.textContent;
    for (const expected of [
      'asha.rao@acme.example',
      'India',
      '1 Apr 2022',
      'Engineering',
      'Software Engineer',
      'L3',
    ]) {
      expect(text).toContain(expected);
    }
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows the current salary with its US-dollar equivalent', async () => {
    openAt('/employees/7', { 'GET /api/employees/7': reply(200, asha) });

    await screen.findByRole('heading', { name: 'Asha Rao' });
    const details = screen.getByText('Current salary').closest('div') as HTMLElement;
    expect(details.textContent).toContain('₹1,500,000.00');
    expect(details.textContent).toContain('≈ $18,000.00');
  });

  it('shows a dash as the current salary when there is no salary record', async () => {
    openAt('/employees/7', {
      'GET /api/employees/7': reply(200, { ...asha, currentSalary: null }),
    });

    await screen.findByRole('heading', { name: 'Asha Rao' });
    const details = screen.getByText('Current salary').closest('div') as HTMLElement;
    expect(details.textContent).toContain('—');
  });

  it('shows the salary history below the details, and offers to change the salary', async () => {
    openAt('/employees/7', { 'GET /api/employees/7': reply(200, asha) });

    expect(await screen.findByRole('heading', { name: 'Salary history' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Change salary' })).toBeInTheDocument();
  });

  it('links to the edit form and back to the directory', async () => {
    openAt('/employees/7', { 'GET /api/employees/7': reply(200, asha) });

    expect(await screen.findByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/employees/7/edit',
    );
    // Both the header navigation and the back link lead to the directory.
    for (const link of screen.getAllByRole('link', { name: 'Employees' })) {
      expect(link).toHaveAttribute('href', '/employees');
    }
  });

  it('shows placeholders while loading', async () => {
    openAt('/employees/7', { 'GET /api/employees/7': () => new Promise(() => undefined) });

    expect(await screen.findByRole('status', { name: 'Loading employee' })).toBeInTheDocument();
  });

  it('says so when the employee does not exist', async () => {
    openAt('/employees/999', {
      'GET /api/employees/999': apiError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found'),
    });

    expect(await screen.findByRole('heading', { name: 'Employee not found' })).toBeInTheDocument();
  });

  it('does not ask the API about a malformed id', async () => {
    const { api } = openAt('/employees/1e3');

    expect(await screen.findByRole('heading', { name: 'Employee not found' })).toBeInTheDocument();
    expect(api.calls.filter((c) => c.url.startsWith('/api/employees/'))).toHaveLength(0);
  });

  it('explains a failure and can try again', async () => {
    let fail = true;
    const { user } = openAt('/employees/7', {
      'GET /api/employees/7': () =>
        fail ? apiError(500, 'INTERNAL_ERROR', 'Internal server error') : reply(200, asha),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load this employee');
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'Asha Rao' })).toBeInTheDocument();
  });

  it('is reached by clicking a name in the directory', async () => {
    const { user } = openAt('/employees', { 'GET /api/employees/7': reply(200, asha) });

    await user.click(await screen.findByRole('link', { name: 'Asha Rao' }));

    expect(await screen.findByRole('link', { name: 'Edit' })).toBeInTheDocument();
  });
});

describe('deactivating and reactivating', () => {
  it('asks for confirmation before deactivating, and does nothing if cancelled', async () => {
    const { user, api } = openAt('/employees/7', { 'GET /api/employees/7': reply(200, asha) });
    await screen.findByRole('heading', { name: 'Asha Rao' });

    await user.click(screen.getByRole('button', { name: 'Deactivate' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Deactivate Asha Rao?');
    expect(dialog).toHaveTextContent('salary history is kept');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(api.callsTo('POST /api/employees/7/deactivate')).toHaveLength(0);
  });

  it('deactivates after confirmation and shows the new status', async () => {
    let current = asha;
    const { user, api } = openAt('/employees/7', {
      'GET /api/employees/7': () => reply(200, current),
      'POST /api/employees/7/deactivate': () => {
        current = { ...asha, status: 'inactive' };
        return reply(200, current);
      },
    });
    await screen.findByRole('heading', { name: 'Asha Rao' });

    await user.click(screen.getByRole('button', { name: 'Deactivate' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }));

    expect(await screen.findByText('Inactive')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Reactivate' })).toBeInTheDocument();
    expect(api.callsTo('POST /api/employees/7/deactivate')).toHaveLength(1);
  });

  it('reactivates an inactive employee after confirmation', async () => {
    let current = { ...asha, status: 'inactive' as const };
    const { user, api } = openAt('/employees/7', {
      'GET /api/employees/7': () => reply(200, current),
      'POST /api/employees/7/reactivate': () => {
        current = { ...asha, status: 'active' as never };
        return reply(200, current);
      },
    });
    expect(await screen.findByText('Inactive')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reactivate' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Reactivate Asha Rao?');
    await user.click(within(dialog).getByRole('button', { name: 'Reactivate' }));

    expect(await screen.findByRole('button', { name: 'Deactivate' })).toBeInTheDocument();
    expect(api.callsTo('POST /api/employees/7/reactivate')).toHaveLength(1);
  });

  it('keeps the employee as they were if the server refuses', async () => {
    const { user } = openAt('/employees/7', {
      'GET /api/employees/7': reply(200, asha),
      'POST /api/employees/7/deactivate': apiError(500, 'INTERNAL_ERROR', 'Internal server error'),
    });
    await screen.findByRole('heading', { name: 'Asha Rao' });

    await user.click(screen.getByRole('button', { name: 'Deactivate' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Deactivate' }),
    );

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeInTheDocument();
  });

  it('refreshes the directory so a deactivated employee disappears from it', async () => {
    let listed = [asha];
    let current = asha;
    const { user } = openAt('/employees', {
      'GET /api/employees': () => reply(200, makePage(listed)),
      'GET /api/employees/7': () => reply(200, current),
      'POST /api/employees/7/deactivate': () => {
        listed = [];
        current = { ...asha, status: 'inactive' };
        return reply(200, current);
      },
    });
    await user.click(await screen.findByRole('link', { name: 'Asha Rao' }));
    await screen.findByRole('heading', { name: 'Asha Rao' });
    await user.click(screen.getByRole('button', { name: 'Deactivate' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Deactivate' }),
    );
    await screen.findByText('Inactive');

    await user.click(screen.getAllByRole('link', { name: 'Employees' })[0] as HTMLElement);

    expect(
      await screen.findByText('No employees match your search or filters.'),
    ).toBeInTheDocument();
  });
});
