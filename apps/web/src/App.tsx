import { Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';

/** Placeholder until the employee pages are added in the next commits. */
function HomePage() {
  return <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>;
}

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
      </Route>
    </Routes>
  );
}
