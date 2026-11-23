import { type LoginInput, loginInputSchema } from '@acme/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { ApiError } from '@/api/client';
import { useLogin, useSession } from '@/api/session';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Only follow a "go back to" address that stays inside this app. A link such as
 * /login with state from "//evil.example" must not send a freshly logged-in user elsewhere.
 */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  if (value.startsWith('/login')) return '/';
  return value;
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return 'Too many failed attempts. Wait a few minutes and try again.';
    if (error.status === 401) return 'Invalid username or password.';
    if (error.status === 0) return error.message;
  }
  return 'Could not log in. Please try again.';
}

export function LoginPage() {
  const session = useSession();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = safeReturnPath((location.state as { from?: unknown } | null)?.from);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginInputSchema),
    defaultValues: { username: '', password: '' },
  });

  // Already logged in (for example after pressing Back): nothing to do here.
  if (session.data) return <Navigate to={returnTo} replace />;

  const onSubmit = (input: LoginInput) => {
    login.mutate(input, { onSuccess: () => void navigate(returnTo, { replace: true }) });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Salary Management</CardTitle>
          <CardDescription>Log in to manage employees and salaries.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => void handleSubmit(onSubmit)(event)}
            noValidate
            className="space-y-4"
          >
            {login.isError && (
              <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {messageFor(login.error)}
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoComplete="username"
                autoFocus
                aria-invalid={errors.username ? true : undefined}
                aria-describedby={errors.username ? 'username-error' : undefined}
                {...register('username')}
              />
              {errors.username && (
                <p id="username-error" className="text-sm text-destructive">
                  {errors.username.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? 'password-error' : undefined}
                {...register('password')}
              />
              {errors.password && (
                <p id="password-error" className="text-sm text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Log in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
