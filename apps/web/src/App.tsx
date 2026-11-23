import { Route, Routes } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { AppShell, HomeRedirect, NotFoundPage } from './components/AppShell';
import { EmployeeCreatePage } from './pages/EmployeeCreatePage';
import { EmployeeDirectoryPage } from './pages/EmployeeDirectoryPage';
import { EmployeeEditPage } from './pages/EmployeeEditPage';
import { LoginPage } from './pages/LoginPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Everything below needs a login. */}
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<HomeRedirect />} />
          <Route path="/employees" element={<EmployeeDirectoryPage />} />
          <Route path="/employees/new" element={<EmployeeCreatePage />} />
          <Route path="/employees/:id/edit" element={<EmployeeEditPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
