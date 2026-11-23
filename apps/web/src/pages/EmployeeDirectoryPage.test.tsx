import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { SEARCH_DEBOUNCE_MS } from '@/components/employees/EmployeeFilters';
import { makeEmployee, makePage } from '@/test/fixtures';
import { apiError, mockApi, reply, type MockReply, type RecordedCall } from '@/test/mock-api';
import { renderWithProviders } from '@/test/render';

afterEach(() => {
  vi.unstubAllGlobals();
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

const session = reply(200, { user: { username: 'hr.manager' } });

const asha = makeEmployee({ id: 1, firstName: 'Asha', lastName: 'Rao' });
const ben = makeEmployee({
  id: 2,
  firstName: 'Ben',
  lastName: 'Carter',
  email: 'ben.carter@acme.example',
  countryCode: 'US',
  department: 'Sales',
  jobTitle: 'Account Executive',
  level: 6,
  hireDate: '2019-01-15',
  status: 'inactive',
});

/** Opens the directory with the API answering every list request with `answer`. */
async function openDirectory(
  route = '/employees',
  answer: (call: RecordedCall) => MockReply | Promise<MockReply> = () =>
    reply(200, makePage([asha, ben])),
) {
  const api = mockApi({ 'GET /api/auth/me': session, 'GET /api/employees': answer });
  const user = userEvent.setup();
  renderWithProviders(
    <>
      <App />
      <LocationProbe />
    </>,
    { route },
  );
  return { api, user };
}

const listCalls = (api: ReturnType<typeof mockApi>) => api.callsTo('GET /api/employees');
const lastListUrl = (api: ReturnType<typeof mockApi>) => listCalls(api).at(-1)?.url;
const location = () => screen.getByTestId('location').textContent;

describe('employee directory', () => {
  describe('rows', () => {
    it('shows each employee with readable values', async () => {
      await openDirectory();

      const row = (await screen.findByRole('link', { name: 'Asha Rao' })).closest(
        'tr',
      ) as HTMLElement;
      expect(within(row).getByText('asha.rao.1@acme.example')).toBeInTheDocument();
      expect(within(row).getByText('India')).toBeInTheDocument();
      expect(within(row).getByText('Engineering')).toBeInTheDocument();
      expect(within(row).getByText('Software Engineer')).toBeInTheDocument();
      expect(within(row).getByText('L3')).toBeInTheDocument();
      expect(within(row).getByText('1 Apr 2022')).toBeInTheDocument();
      expect(within(row).getByText('Active')).toBeInTheDocument();
    });

    it('marks inactive employees', async () => {
      await openDirectory();

      const row = (await screen.findByRole('link', { name: 'Ben Carter' })).closest(
        'tr',
      ) as HTMLElement;
      expect(within(row).getByText('Inactive')).toBeInTheDocument();
    });

    it('links each name to the employee page', async () => {
      await openDirectory();

      expect(await screen.findByRole('link', { name: 'Asha Rao' })).toHaveAttribute(
        'href',
        '/employees/1',
      );
    });

    it('shows placeholder rows while the first page loads', async () => {
      let release: (reply: MockReply) => void = () => undefined;
      await openDirectory(
        '/employees',
        () => new Promise<MockReply>((resolve) => (release = resolve)),
      );

      expect((await screen.findAllByTestId('skeleton-row')).length).toBeGreaterThan(0);

      release(reply(200, makePage([asha])));
      expect(await screen.findByRole('link', { name: 'Asha Rao' })).toBeInTheDocument();
      expect(screen.queryByTestId('skeleton-row')).not.toBeInTheDocument();
    });

    it('says so when nothing matches', async () => {
      await openDirectory('/employees?q=zzz', () => reply(200, makePage([])));

      expect(
        await screen.findByText('No employees match your search or filters.'),
      ).toBeInTheDocument();
      expect(screen.getByText('No employees')).toBeInTheDocument();
    });

    it('explains an error and can try again', async () => {
      let fail = true;
      const { user, api } = await openDirectory('/employees', () =>
        fail
          ? apiError(500, 'INTERNAL_ERROR', 'Internal server error')
          : reply(200, makePage([asha])),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent('Could not load employees');
      fail = false;
      await user.click(screen.getByRole('button', { name: 'Try again' }));

      expect(await screen.findByRole('link', { name: 'Asha Rao' })).toBeInTheDocument();
      expect(listCalls(api)).toHaveLength(2);
    });

    it('offers the first page when the address points past the last page', async () => {
      const { user } = await openDirectory('/employees?page=9', (call) =>
        call.url.includes('page=9')
          ? reply(200, makePage([], { page: 9, total: 30 }))
          : reply(200, makePage([asha], { total: 30 })),
      );

      await user.click(await screen.findByRole('button', { name: 'Go to the first page' }));

      expect(await screen.findByRole('link', { name: 'Asha Rao' })).toBeInTheDocument();
      expect(location()).toBe('/employees');
    });
  });

  describe('the address is the state', () => {
    it('asks the API for the default view with no parameters', async () => {
      const { api } = await openDirectory();
      await screen.findByRole('link', { name: 'Asha Rao' });

      expect(lastListUrl(api)).toBe('/api/employees');
    });

    it('restores filters, sorting and paging from the address', async () => {
      const { api } = await openDirectory(
        '/employees?q=asha&country=IN&department=Engineering&level=3&status=all&sort=hireDate&order=desc&page=2&pageSize=50',
        () => reply(200, makePage([asha], { page: 2, pageSize: 50, total: 80 })),
      );
      await screen.findByRole('link', { name: 'Asha Rao' });

      expect(screen.getByLabelText('Search employees')).toHaveValue('asha');
      expect(screen.getByLabelText('Country')).toHaveValue('IN');
      expect(screen.getByLabelText('Department')).toHaveValue('Engineering');
      expect(screen.getByLabelText('Level')).toHaveValue('3');
      expect(screen.getByLabelText('Status')).toHaveValue('all');
      expect(screen.getByLabelText('Rows per page')).toHaveValue('50');
      const requested = new URLSearchParams(lastListUrl(api)?.split('?')[1]);
      expect(Object.fromEntries(requested)).toEqual({
        q: 'asha',
        country: 'IN',
        department: 'Engineering',
        level: '3',
        status: 'all',
        sort: 'hireDate',
        order: 'desc',
        page: '2',
        pageSize: '50',
      });
    });

    it('ignores invalid values in the address instead of failing', async () => {
      const { api } = await openDirectory('/employees?level=99&page=abc&sort=salary&country=IN');
      await screen.findByRole('link', { name: 'Asha Rao' });

      expect(lastListUrl(api)).toBe('/api/employees?country=IN');
    });
  });

  describe('filters', () => {
    it('filters by country, going back to the first page', async () => {
      const { user, api } = await openDirectory('/employees?page=3', () =>
        reply(200, makePage([asha], { page: 3, total: 100 })),
      );
      await screen.findByRole('link', { name: 'Asha Rao' });

      await user.selectOptions(screen.getByLabelText('Country'), 'India');

      await waitFor(() => expect(lastListUrl(api)).toBe('/api/employees?country=IN'));
      expect(location()).toBe('/employees?country=IN');
    });

    it('filters by department, job title, level and status', async () => {
      const { user, api } = await openDirectory();
      await screen.findByRole('link', { name: 'Asha Rao' });

      await user.selectOptions(screen.getByLabelText('Department'), 'Sales');
      await user.selectOptions(screen.getByLabelText('Job title'), 'Account Executive');
      await user.selectOptions(screen.getByLabelText('Level'), 'L6');
      await user.selectOptions(screen.getByLabelText('Status'), 'Inactive');

      await waitFor(() =>
        expect(Object.fromEntries(new URLSearchParams(lastListUrl(api)?.split('?')[1]))).toEqual({
          department: 'Sales',
          jobTitle: 'Account Executive',
          level: '6',
          status: 'inactive',
        }),
      );
    });

    it('offers only the job titles of the chosen department', async () => {
      const { user } = await openDirectory();
      await screen.findByRole('link', { name: 'Asha Rao' });

      await user.selectOptions(screen.getByLabelText('Department'), 'Finance');

      const titles = within(screen.getByLabelText('Job title'))
        .getAllByRole('option')
        .map((o) => o.textContent);
      expect(titles).toEqual([
        'All job titles',
        'Accountant',
        'Financial Analyst',
        'Finance Manager',
      ]);
    });

    it('drops a chosen job title when the department changes to one it does not belong to', async () => {
      const { user, api } = await openDirectory(
        '/employees?department=Engineering&jobTitle=QA%20Engineer',
      );
      await screen.findByRole('link', { name: 'Asha Rao' });

      await user.selectOptions(screen.getByLabelText('Department'), 'Sales');

      await waitFor(() => expect(lastListUrl(api)).toBe('/api/employees?department=Sales'));
    });

    it('keeps a chosen job title when the department is cleared', async () => {
      const { user, api } = await openDirectory(
        '/employees?department=Engineering&jobTitle=QA%20Engineer',
      );
      await screen.findByRole('link', { name: 'Asha Rao' });

      await user.selectOptions(screen.getByLabelText('Department'), 'All departments');

      await waitFor(() => expect(lastListUrl(api)).toBe('/api/employees?jobTitle=QA+Engineer'));
    });

    it('clears all filters but keeps the sorting', async () => {
      const { user, api } = await openDirectory(
        '/employees?country=IN&q=asha&level=2&sort=level&order=desc&page=2',
      );
      await screen.findByRole('link', { name: 'Asha Rao' });

      await user.click(screen.getByRole('button', { name: 'Clear filters' }));

      await waitFor(() => expect(lastListUrl(api)).toBe('/api/employees?sort=level&order=desc'));
      expect(screen.getByLabelText('Search employees')).toHaveValue('');
      expect(screen.getByLabelText('Country')).toHaveValue('');
    });

    it('disables "Clear filters" when nothing is filtered', async () => {
      await openDirectory();
      await screen.findByRole('link', { name: 'Asha Rao' });

      expect(screen.getByRole('button', { name: 'Clear filters' })).toBeDisabled();
    });
  });

  describe('search', () => {
    it('waits for a pause in typing and sends a single request for the whole word', async () => {
      const { user, api } = await openDirectory();
      await screen.findByRole('link', { name: 'Asha Rao' });
      const before = listCalls(api).length;

      await user.type(screen.getByLabelText('Search employees'), 'asha');

      await waitFor(() => expect(lastListUrl(api)).toBe('/api/employees?q=asha'), {
        timeout: SEARCH_DEBOUNCE_MS * 5,
      });
      expect(listCalls(api)).toHaveLength(before + 1);
    });

    it('ignores spaces around the search and treats an emptied box as no search', async () => {
      const { user, api } = await openDirectory('/employees?q=asha');
      await screen.findByRole('link', { name: 'Asha Rao' });

      await user.clear(screen.getByLabelText('Search employees'));
      await user.type(screen.getByLabelText('Search employees'), '  ');

      await waitFor(() => expect(lastListUrl(api)).toBe('/api/employees'));
    });
  });

  describe('sorting', () => {
    it('shows which column the list is sorted by', async () => {
      await openDirectory('/employees?sort=level&order=desc');
      await screen.findByRole('link', { name: 'Asha Rao' });

      expect(screen.getByRole('columnheader', { name: /Level/ })).toHaveAttribute(
        'aria-sort',
        'descending',
      );
      expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute(
        'aria-sort',
        'none',
      );
    });

    it('sorts a new column ascending, then flips the direction on each click', async () => {
      const { user, api } = await openDirectory();
      await screen.findByRole('link', { name: 'Asha Rao' });

      await user.click(screen.getByRole('button', { name: 'Email' }));
      await waitFor(() => expect(lastListUrl(api)).toBe('/api/employees?sort=email'));

      await user.click(screen.getByRole('button', { name: 'Email' }));
      await waitFor(() => expect(lastListUrl(api)).toBe('/api/employees?sort=email&order=desc'));

      await user.click(screen.getByRole('button', { name: 'Email' }));
      await waitFor(() => expect(lastListUrl(api)).toBe('/api/employees?sort=email'));
    });

    it('returns to the first page when the sorting changes', async () => {
      const { user, api } = await openDirectory('/employees?page=3', () =>
        reply(200, makePage([asha], { page: 3, total: 100 })),
      );
      await screen.findByRole('link', { name: 'Asha Rao' });

      await user.click(screen.getByRole('button', { name: 'Hired' }));

      await waitFor(() => expect(lastListUrl(api)).toBe('/api/employees?sort=hireDate'));
    });

    it('does not offer sorting by status', async () => {
      await openDirectory();
      await screen.findByRole('link', { name: 'Asha Rao' });

      expect(screen.queryByRole('button', { name: 'Status' })).not.toBeInTheDocument();
    });
  });

  describe('paging', () => {
    const manyPages = (call: RecordedCall) => {
      const page = Number(new URLSearchParams(call.url.split('?')[1]).get('page') ?? 1);
      return reply(200, makePage([asha], { page, total: 60 }));
    };

    it('shows the range, the total and the page number', async () => {
      await openDirectory('/employees?page=2', manyPages);

      expect(await screen.findByText('Showing 26\u201350 of 60')).toBeInTheDocument();
      expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    });

    it('goes to the next and the previous page', async () => {
      const { user, api } = await openDirectory('/employees', manyPages);
      await screen.findByText('Page 1 of 3');

      await user.click(screen.getByRole('button', { name: /Next/ }));
      await waitFor(() => expect(lastListUrl(api)).toBe('/api/employees?page=2'));
      await screen.findByText('Page 2 of 3');

      await user.click(screen.getByRole('button', { name: /Previous/ }));
      await waitFor(() => expect(lastListUrl(api)).toBe('/api/employees'));
    });

    it('cannot go before the first or after the last page', async () => {
      await openDirectory('/employees', manyPages);
      await screen.findByText('Page 1 of 3');
      expect(screen.getByRole('button', { name: /Previous/ })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Next/ })).toBeEnabled();
    });

    it('disables Next on the last page', async () => {
      await openDirectory('/employees?page=3', manyPages);
      await screen.findByText('Page 3 of 3');

      expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
    });

    it('changes the page size and returns to the first page', async () => {
      const { user, api } = await openDirectory('/employees?page=2', manyPages);
      await screen.findByText('Page 2 of 3');

      await user.selectOptions(screen.getByLabelText('Rows per page'), '50');

      await waitFor(() => expect(lastListUrl(api)).toBe('/api/employees?pageSize=50'));
    });
  });
});
