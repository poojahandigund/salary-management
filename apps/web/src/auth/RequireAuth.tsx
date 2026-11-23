import { Loader2 } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useSession } from '@/api/session';
import { Button } from '@/components/ui/button';

/**
 * Lets the pages inside through only when logged in. Anyone else is sent to the login
 * page, which sends them back here afterwards.
 *
 * This is for convenience only. The API checks the login on every request, so hiding a
 * page here is never what protects the data.
 */
export function RequireAuth() {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  if (session.isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3" role="alert">
        <p>Cannot reach the server. Check your connection and try again.</p>
        <Button onClick={() => void session.refetch()}>Try again</Button>
      </div>
    );
  }

  if (session.data === null) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <Outlet />;
}
