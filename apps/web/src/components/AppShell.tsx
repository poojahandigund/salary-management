import { LogOut } from 'lucide-react';
import { Outlet } from 'react-router';
import { useLogout, useSession } from '@/api/session';
import { Button } from '@/components/ui/button';

/**
 * The frame around every page after login: a header with the product name, who is logged
 * in and the log out button, and the page itself below it.
 */
export function AppShell() {
  const session = useSession();
  const logout = useLogout();

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
          <span className="text-lg font-semibold tracking-tight">Salary Management</span>
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
