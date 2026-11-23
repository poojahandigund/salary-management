import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { makeEmployee } from '@/test/fixtures';
import { apiError, mockApi, reply } from '@/test/mock-api';
import { renderWithProviders } from '@/test/render';

// The form itself is tested in EmployeeForm.test.tsx. This file covers what the page shows
// around it: an address that points at nobody, a failed load, and loading.
afterEach(() => {
  vi.unstubAllGlobals();
});

const session = reply(200, { user: { username: 'hr.manager' } });

function openEdit(path: string, routes: Parameters<typeof mockApi>[0] = {}) {
  const api = mockApi({ 'GET /api/auth/me': session, ...routes });
  const user = userEvent.setup({ delay: null });
  renderWithProviders(<App />, { route: path });
  return { api, user };
}

describe('edit employee page', () => {
  it('says the employee was not found when the server says 404', async () => {
    openEdit('/employees/404/edit', {
      'GET /api/employees/404': apiError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found'),
    });

    expect(await screen.findByRole('heading', { name: 'Employee not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to employees' })).toHaveAttribute(
      'href',
      '/employees',
    );
  });

  it.each(['abc', '0', '-3', '1.5'])(
    'says not found for the address /employees/%s/edit without asking the server',
    async (id) => {
      const { api } = openEdit(`/employees/${id}/edit`);

      expect(
        await screen.findByRole('heading', { name: 'Employee not found' }),
      ).toBeInTheDocument();
      expect(api.calls.filter((c) => c.url.startsWith('/api/employees'))).toHaveLength(0);
    },
  );

  it('shows other load failures with the reason, and a retry that recovers', async () => {
    let healthy = false;
    const { api, user } = openEdit('/employees/7/edit', {
      'GET /api/employees/7': () =>
        healthy
          ? reply(200, makeEmployee({ id: 7, firstName: 'Asha', lastName: 'Rao' }))
          : apiError(500, 'INTERNAL_ERROR', 'Internal server error'),
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load this employee.');
    expect(alert).toHaveTextContent('Internal server error');
    expect(screen.queryByRole('heading', { name: 'Employee not found' })).not.toBeInTheDocument();

    healthy = true;
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'Edit Asha Rao' })).toBeInTheDocument();
    expect(api.callsTo('GET /api/employees/7')).toHaveLength(2);
  });

  it('shows a loading message until the employee arrives', async () => {
    let release: (() => void) | undefined;
    const arrives = new Promise<void>((resolve) => {
      release = resolve;
    });
    openEdit('/employees/7/edit', {
      'GET /api/employees/7': async () => {
        await arrives;
        return reply(200, makeEmployee({ id: 7, firstName: 'Asha', lastName: 'Rao' }));
      },
    });

    // (An earlier "Loading" status belongs to the login check, so look for this one by text.)
    expect(await screen.findByText('Loading employee')).toHaveAttribute('role', 'status');
    expect(screen.queryByLabelText('First name')).not.toBeInTheDocument();

    release?.();
    expect(await screen.findByRole('heading', { name: 'Edit Asha Rao' })).toBeInTheDocument();
  });
});
