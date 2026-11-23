import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { makeEmployee, makePage } from '@/test/fixtures';
import { apiError, mockApi, reply, type MockReply } from '@/test/mock-api';
import { renderWithProviders } from '@/test/render';

afterEach(() => {
  vi.unstubAllGlobals();
});

const session = reply(200, { user: { username: 'hr.manager' } });
const asha = makeEmployee({ id: 7, firstName: 'Asha', lastName: 'Rao', level: 3 });

type User = ReturnType<typeof userEvent.setup>;
type Routes = Parameters<typeof mockApi>[0];

function openAt(route: string, routes: Routes = {}) {
  const api = mockApi({
    'GET /api/auth/me': session,
    'GET /api/employees': reply(200, makePage([asha])),
    ...routes,
  });
  const user = userEvent.setup({ delay: null });
  renderWithProviders(<App />, { route });
  return { api, user };
}

/** Fills the add form with valid values; pass `skip` to leave one field out. */
async function fillAddForm(user: User, overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    'First name': 'Meera',
    'Last name': 'Iyer',
    Email: 'meera.iyer@acme.example',
    'Hire date': '2024-03-15',
    Country: 'India',
    Level: 'L4',
    Department: 'Engineering',
    'Job title': 'Software Engineer',
    'Starting salary': '85000.50',
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) {
    if (value === '') continue;
    const field = screen.getByLabelText(new RegExp(`^${label}`));
    if (field.tagName === 'SELECT') await user.selectOptions(field, value);
    else if (label === 'Hire date') await user.type(field, value);
    else await user.type(field, value);
  }
}

describe('add employee form', () => {
  it('is reached from the directory', async () => {
    const { user } = openAt('/employees');

    await user.click(await screen.findByRole('link', { name: 'Add employee' }));

    expect(await screen.findByRole('heading', { name: 'Add employee' })).toBeInTheDocument();
  });

  it('asks for every field and does not call the API when the form is empty', async () => {
    const { user, api } = openAt('/employees/new');
    await screen.findByRole('heading', { name: 'Add employee' });

    await user.click(screen.getByRole('button', { name: 'Add employee' }));

    const expected: Record<string, string> = {
      firstName: 'First name is required',
      lastName: 'Last name is required',
      email: 'Email is required',
      hireDate: 'Enter the hire date',
      countryCode: 'Choose a country',
      level: 'Choose a level',
      department: 'Choose a department',
      startingSalary: 'Enter the starting salary',
    };
    await screen.findByText('First name is required');
    for (const [field, message] of Object.entries(expected)) {
      expect(document.getElementById(`${field}-error`), field).toHaveTextContent(message);
    }
    // Job title cannot be chosen yet, so it is not reported.
    expect(document.getElementById('jobTitle-error')).toBeInTheDocument();
    expect(api.callsTo('POST /api/employees')).toHaveLength(0);
  });

  it('marks invalid fields for screen readers and links each to its message', async () => {
    const { user } = openAt('/employees/new');
    await screen.findByRole('heading', { name: 'Add employee' });

    await user.click(screen.getByRole('button', { name: 'Add employee' }));

    const email = await screen.findByLabelText('Email');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAttribute('aria-describedby', 'email-error');
    expect(document.getElementById('email-error')).toHaveTextContent('Email is required');
  });

  it('only offers job titles of the chosen department, and needs one first', async () => {
    const { user } = openAt('/employees/new');
    await screen.findByRole('heading', { name: 'Add employee' });
    expect(screen.getByLabelText('Job title')).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Department'), 'Finance');

    const titles = within(screen.getByLabelText('Job title'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(titles).toEqual([
      'Choose a job title',
      'Accountant',
      'Financial Analyst',
      'Finance Manager',
    ]);
  });

  it('clears the job title when the department changes to one it does not belong to', async () => {
    const { user } = openAt('/employees/new');
    await screen.findByRole('heading', { name: 'Add employee' });
    await user.selectOptions(screen.getByLabelText('Department'), 'Engineering');
    await user.selectOptions(screen.getByLabelText('Job title'), 'QA Engineer');

    await user.selectOptions(screen.getByLabelText('Department'), 'Sales');

    expect(screen.getByLabelText('Job title')).toHaveValue('');
  });

  it('shows the currency of the chosen country on the salary field', async () => {
    const { user } = openAt('/employees/new');
    await screen.findByRole('heading', { name: 'Add employee' });
    expect(screen.getByLabelText('Starting salary')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Country'), 'Germany');

    expect(screen.getByLabelText('Starting salary (EUR)')).toBeInTheDocument();
  });

  it('sends the API exactly what it expects: trimmed text, a numeric level, the salary in minor units', async () => {
    const { user, api } = openAt('/employees/new', {
      'POST /api/employees': (call) =>
        reply(
          201,
          makeEmployee({ id: 99, firstName: 'Meera', lastName: 'Iyer', ...(call.body as object) }),
        ),
    });
    await screen.findByRole('heading', { name: 'Add employee' });

    await fillAddForm(user, { 'First name': '  Meera ', 'Starting salary': '85,000.50' });
    await user.click(screen.getByRole('button', { name: 'Add employee' }));

    await waitFor(() => expect(api.callsTo('POST /api/employees')).toHaveLength(1));
    expect(api.callsTo('POST /api/employees')[0]?.body).toEqual({
      firstName: 'Meera',
      lastName: 'Iyer',
      email: 'meera.iyer@acme.example',
      countryCode: 'IN',
      department: 'Engineering',
      jobTitle: 'Software Engineer',
      level: 4,
      hireDate: '2024-03-15',
      startingSalaryMinor: 8_500_050,
    });
  });

  it('opens the new employee’s page, and the directory then lists them', async () => {
    const created = makeEmployee({ id: 99, firstName: 'Meera', lastName: 'Iyer' });
    let listed = [asha];
    const { user } = openAt('/employees', {
      'GET /api/employees': () => reply(200, makePage(listed)),
      'POST /api/employees': () => {
        listed = [asha, created];
        return reply(201, created);
      },
      'GET /api/employees/99': reply(200, created),
    });
    await user.click(await screen.findByRole('link', { name: 'Add employee' }));
    await screen.findByRole('heading', { name: 'Add employee' });
    await fillAddForm(user);

    await user.click(screen.getByRole('button', { name: 'Add employee' }));

    expect(await screen.findByRole('heading', { name: 'Meera Iyer' })).toBeInTheDocument();
    await user.click(screen.getAllByRole('link', { name: 'Employees' })[0] as HTMLElement);
    expect(await screen.findByRole('link', { name: 'Meera Iyer' })).toBeInTheDocument();
  });
  it.each([
    ['not an amount', 'lots', 'Enter an amount such as 85000 or 85000.50'],
    ['too many decimals', '1.234', 'Enter an amount such as 85000 or 85000.50'],
    ['negative', '-5', 'Enter an amount such as 85000 or 85000.50'],
    ['zero', '0', 'Amount must be greater than zero'],
    ['absurdly large', '99999999999', 'Amount is too large'],
  ])('rejects a salary that is %s', async (_name, text, message) => {
    const { user, api } = openAt('/employees/new');
    await screen.findByRole('heading', { name: 'Add employee' });
    await fillAddForm(user, { 'Starting salary': text });

    await user.click(screen.getByRole('button', { name: 'Add employee' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(api.callsTo('POST /api/employees')).toHaveLength(0);
  });

  it('uses the shared rules for the other fields, with messages a person can act on', async () => {
    const { user } = openAt('/employees/new');
    await screen.findByRole('heading', { name: 'Add employee' });
    await fillAddForm(user, { Email: 'not-an-email' });

    await user.click(screen.getByRole('button', { name: 'Add employee' }));

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
  });

  it('shows a duplicate email next to the email field and stays on the form', async () => {
    const { user } = openAt('/employees/new', {
      'POST /api/employees': apiError(
        409,
        'EMAIL_ALREADY_EXISTS',
        'An employee with this email already exists',
        [{ path: 'email', message: 'An employee with this email already exists' }],
      ),
    });
    await screen.findByRole('heading', { name: 'Add employee' });
    await fillAddForm(user);

    await user.click(screen.getByRole('button', { name: 'Add employee' }));

    expect(
      await screen.findByText('An employee with this email already exists'),
    ).toBeInTheDocument();
    expect(document.getElementById('email-error')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Add employee' })).toBeInTheDocument();
    // What was typed is still there.
    expect(screen.getByLabelText('First name')).toHaveValue('Meera');
  });

  it('clears a server-reported email problem as soon as the email is edited', async () => {
    const { user } = openAt('/employees/new', {
      'POST /api/employees': apiError(
        409,
        'EMAIL_ALREADY_EXISTS',
        'An employee with this email already exists',
        [{ path: 'email', message: 'An employee with this email already exists' }],
      ),
    });
    await screen.findByRole('heading', { name: 'Add employee' });
    await fillAddForm(user);
    await user.click(screen.getByRole('button', { name: 'Add employee' }));
    await screen.findByText('An employee with this email already exists');

    await user.type(screen.getByLabelText('Email'), 'x');

    await waitFor(() => expect(document.getElementById('email-error')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid');
  });
  it('places a salary problem reported by the server on the salary field', async () => {
    const { user } = openAt('/employees/new', {
      'POST /api/employees': apiError(400, 'VALIDATION_ERROR', 'Request validation failed', [
        { path: 'startingSalaryMinor', message: 'Amount is too large' },
      ]),
    });
    await screen.findByRole('heading', { name: 'Add employee' });
    await fillAddForm(user);

    await user.click(screen.getByRole('button', { name: 'Add employee' }));

    expect(await screen.findByText('Amount is too large')).toBeInTheDocument();
    expect(document.getElementById('startingSalary-error')).toBeInTheDocument();
  });

  it('shows other failures at the top of the form', async () => {
    const { user } = openAt('/employees/new', {
      'POST /api/employees': apiError(500, 'INTERNAL_ERROR', 'Internal server error'),
    });
    await screen.findByRole('heading', { name: 'Add employee' });
    await fillAddForm(user);

    await user.click(screen.getByRole('button', { name: 'Add employee' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Internal server error');
  });

  it('cannot be submitted twice while a request is in progress', async () => {
    let release: (answer: MockReply) => void = () => undefined;
    const { user, api } = openAt('/employees/new', {
      'POST /api/employees': () => new Promise<MockReply>((resolve) => (release = resolve)),
      'GET /api/employees/99': reply(
        200,
        makeEmployee({ id: 99, firstName: 'Meera', lastName: 'Iyer' }),
      ),
    });
    await screen.findByRole('heading', { name: 'Add employee' });
    await fillAddForm(user);

    await user.click(screen.getByRole('button', { name: 'Add employee' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add employee' })).toBeDisabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Add employee' }));

    expect(api.callsTo('POST /api/employees')).toHaveLength(1);
    release(reply(201, makeEmployee({ id: 99, firstName: 'Meera', lastName: 'Iyer' })));
    await screen.findByRole('heading', { name: 'Meera Iyer' });
  });
});

describe('edit employee form', () => {
  const editRoute = '/employees/7/edit';
  const detail = { 'GET /api/employees/7': reply(200, asha) };

  it('shows the current values and no salary field', async () => {
    openAt(editRoute, detail);

    expect(await screen.findByRole('heading', { name: 'Edit Asha Rao' })).toBeInTheDocument();
    expect(screen.getByLabelText('First name')).toHaveValue('Asha');
    expect(screen.getByLabelText('Email')).toHaveValue(asha.email);
    expect(screen.getByLabelText('Country')).toHaveValue('IN');
    expect(screen.getByLabelText('Department')).toHaveValue('Engineering');
    expect(screen.getByLabelText('Job title')).toHaveValue('Software Engineer');
    expect(screen.getByLabelText('Level')).toHaveValue('3');
    expect(screen.getByLabelText('Hire date')).toHaveValue('2022-04-01');
    expect(screen.queryByLabelText(/Starting salary/)).not.toBeInTheDocument();
  });

  it('does not call the API when nothing was changed', async () => {
    const { user, api } = openAt(editRoute, detail);
    await screen.findByRole('heading', { name: 'Edit Asha Rao' });

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No changes to save.');
    expect(api.callsTo('PATCH /api/employees/7')).toHaveLength(0);
  });

  it('sends only the fields that changed', async () => {
    const { user, api } = openAt(editRoute, {
      ...detail,
      'PATCH /api/employees/7': reply(200, { ...asha, level: 5 }),
    });
    await screen.findByRole('heading', { name: 'Edit Asha Rao' });

    await user.selectOptions(screen.getByLabelText('Level'), 'L5');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(api.callsTo('PATCH /api/employees/7')).toHaveLength(1));
    expect(api.callsTo('PATCH /api/employees/7')[0]?.body).toEqual({ level: 5 });
  });

  it('treats extra spaces as no change', async () => {
    const { user, api } = openAt(editRoute, detail);
    await screen.findByRole('heading', { name: 'Edit Asha Rao' });

    await user.type(screen.getByLabelText('First name'), '   ');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No changes to save.');
    expect(api.callsTo('PATCH /api/employees/7')).toHaveLength(0);
  });

  it('requires a new job title after moving to another department', async () => {
    const { user, api } = openAt(editRoute, detail);
    await screen.findByRole('heading', { name: 'Edit Asha Rao' });

    await user.selectOptions(screen.getByLabelText('Department'), 'Sales');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(document.getElementById('jobTitle-error')).toHaveTextContent('Choose a job title'),
    );
    expect(api.callsTo('PATCH /api/employees/7')).toHaveLength(0);
  });

  it('saves a new department together with its job title and shows the employee’s page', async () => {
    const { user, api } = openAt(editRoute, {
      ...detail,
      'PATCH /api/employees/7': reply(200, asha),
    });
    await screen.findByRole('heading', { name: 'Edit Asha Rao' });

    await user.selectOptions(screen.getByLabelText('Department'), 'Sales');
    await user.selectOptions(screen.getByLabelText('Job title'), 'Account Executive');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('heading', { name: 'Asha Rao' })).toBeInTheDocument();
    expect(api.callsTo('PATCH /api/employees/7')[0]?.body).toEqual({
      department: 'Sales',
      jobTitle: 'Account Executive',
    });
  });

  it('shows a duplicate email next to the field', async () => {
    const { user } = openAt(editRoute, {
      ...detail,
      'PATCH /api/employees/7': apiError(
        409,
        'EMAIL_ALREADY_EXISTS',
        'An employee with this email already exists',
        [{ path: 'email', message: 'An employee with this email already exists' }],
      ),
    });
    await screen.findByRole('heading', { name: 'Edit Asha Rao' });

    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'taken@acme.example');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText('An employee with this email already exists'),
    ).toBeInTheDocument();
  });

  it('says so when the employee does not exist', async () => {
    openAt('/employees/999/edit', {
      'GET /api/employees/999': apiError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found'),
    });

    expect(await screen.findByRole('heading', { name: 'Employee not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to employees' })).toHaveAttribute(
      'href',
      '/employees',
    );
  });

  it('does not even ask the API for a malformed id', async () => {
    const { api } = openAt('/employees/abc/edit');

    expect(await screen.findByRole('heading', { name: 'Employee not found' })).toBeInTheDocument();
    expect(api.calls.filter((call) => call.url.startsWith('/api/employees/'))).toHaveLength(0);
  });
});
