import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { renderWithProviders } from './test/render';
import { apiError, mockApi, reply } from './test/mock-api';

afterEach(() => {
  vi.unstubAllGlobals();
});

const session = { user: { username: 'hr.manager' } };
const notLoggedIn = apiError(401, 'UNAUTHENTICATED', 'Authentication required');

describe('App routing and login', () => {
  it('sends a visitor who is not logged in to the login page', async () => {
    mockApi({ 'GET /api/auth/me': notLoggedIn });

    renderWithProviders(<App />);

    expect(await screen.findByLabelText('Username')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Employees' })).not.toBeInTheDocument();
  });

  it('shows the page, the username and a log out button when logged in', async () => {
    mockApi({ 'GET /api/auth/me': reply(200, session) });

    renderWithProviders(<App />);

    expect(await screen.findByRole('heading', { name: 'Employees' })).toBeInTheDocument();
    expect(screen.getByText('hr.manager')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
  });

  it('skips the login page for someone who is already logged in', async () => {
    mockApi({ 'GET /api/auth/me': reply(200, session) });

    renderWithProviders(<App />, { route: '/login' });

    expect(await screen.findByRole('heading', { name: 'Employees' })).toBeInTheDocument();
  });

  it('says so, with a retry button, when the server cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    renderWithProviders(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('logs in and then shows the page that was asked for', async () => {
    let loggedIn = false;
    const api = mockApi({
      'GET /api/auth/me': () => (loggedIn ? reply(200, session) : notLoggedIn),
      'POST /api/auth/login': () => {
        loggedIn = true;
        return reply(200, session);
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<App />);

    await user.type(await screen.findByLabelText('Username'), '  hr.manager ');
    await user.type(screen.getByLabelText('Password'), 'my password');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('heading', { name: 'Employees' })).toBeInTheDocument();
    // The username is trimmed; the password is sent exactly as typed.
    expect(api.callsTo('POST /api/auth/login')[0]?.body).toEqual({
      username: 'hr.manager',
      password: 'my password',
    });
  });

  it('logs out and goes back to the login page', async () => {
    let loggedIn = true;
    const api = mockApi({
      'GET /api/auth/me': () => (loggedIn ? reply(200, session) : notLoggedIn),
      'POST /api/auth/logout': () => {
        loggedIn = false;
        return reply(204);
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<App />);

    await user.click(await screen.findByRole('button', { name: /log out/i }));

    expect(await screen.findByLabelText('Username')).toBeInTheDocument();
    expect(api.callsTo('POST /api/auth/logout')).toHaveLength(1);
    expect(screen.queryByText('hr.manager')).not.toBeInTheDocument();
  });
});

describe('login form', () => {
  async function openLogin(extra: Parameters<typeof mockApi>[0] = {}) {
    const api = mockApi({ 'GET /api/auth/me': notLoggedIn, ...extra });
    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/login' });
    await screen.findByLabelText('Username');
    return { api, user };
  }

  it('asks for both fields without calling the API when they are empty', async () => {
    const { api, user } = await openLogin();

    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Username is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(api.callsTo('POST /api/auth/login')).toHaveLength(0);
  });

  it('marks the empty fields as invalid for screen readers', async () => {
    const { user } = await openLogin();

    await user.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
  });

  it('keeps the password hidden', async () => {
    await openLogin();

    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });

  it('shows one message for wrong credentials and stays on the form', async () => {
    const { user } = await openLogin({
      'POST /api/auth/login': apiError(401, 'INVALID_CREDENTIALS', 'Invalid username or password'),
    });

    await user.type(screen.getByLabelText('Username'), 'hr.manager');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid username or password.');
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
  });

  it('tells the user to wait when the login limit is hit', async () => {
    const { user } = await openLogin({
      'POST /api/auth/login': apiError(429, 'TOO_MANY_LOGIN_ATTEMPTS', 'Too many'),
    });

    await user.type(screen.getByLabelText('Username'), 'hr.manager');
    await user.type(screen.getByLabelText('Password'), 'x');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many failed attempts');
  });

  it('shows a network problem instead of calling it wrong credentials', async () => {
    const { user } = await openLogin({
      'POST /api/auth/login': () => {
        throw new TypeError('Failed to fetch');
      },
    });

    await user.type(screen.getByLabelText('Username'), 'hr.manager');
    await user.type(screen.getByLabelText('Password'), 'x');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
  });
});
