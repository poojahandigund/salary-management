import { Outlet } from 'react-router';

/**
 * The frame around every page after login: a header with the product name and room for
 * navigation, and the page itself below it.
 */
export function AppShell() {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
          <span className="text-lg font-semibold tracking-tight">Salary Management</span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
