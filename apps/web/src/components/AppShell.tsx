import { Navigate, NavLink, Outlet } from 'react-router';
import { LogOut } from 'lucide-react';
import { useLogout, useSession } from '@/api/session';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { to: '/employees', label: 'Employees' },
  { to: '/insights', label: 'Insights' },
];

/**
 * The frame around every page after login: a header with the product name, navigation,
 * who is logged in and the log out button, and the page itself below it.
 */
export function AppShell() {
  const session = useSession();
  const logout = useLogout();

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
          <span className="text-lg font-semibold tracking-tight">Salary Management</span>
          <nav aria-label="Main" className="flex gap-1">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium hover:bg-accent',
                    isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{session.data?.user.username}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
            >
              <LogOut aria-hidden />
              Log out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

/** Shown for an address that matches no page. */
export function NotFoundPage() {
  return (
    <div className="py-16 text-center">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground">That address does not match a page in this app.</p>
    </div>
  );
}

/** The home page is the employee directory. */
export function HomeRedirect() {
  return <Navigate to="/employees" replace />;
}
