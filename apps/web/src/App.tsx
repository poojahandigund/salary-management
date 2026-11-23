import { Route, Routes } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';

/** Placeholder until the employee pages are added in the next commits. */
function HomePage() {
  return <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Everything below needs a login. */}
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
        </Route>
      </Route>
    </Routes>
  );
}
