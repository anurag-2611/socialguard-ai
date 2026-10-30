import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth, RequirePermission } from './components/Layout';
import { Admin } from './pages/Admin';
import { Analyze } from './pages/Analyze';
import { CaseDetails } from './pages/CaseDetails';
import { Cases } from './pages/Cases';
import { Dashboard } from './pages/Dashboard';
import { ForgotPassword, Login } from './pages/Login';
import { Profile } from './pages/Profile';
import { ReportView, Reports } from './pages/Reports';

export function Layout_() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route element={<RequireAuth />}>
        <Route index element={<RequirePermission any={['analytics.view']}><Dashboard /></RequirePermission>} />
        <Route path="analyze" element={<RequirePermission any={['profiles.analyze']}><Analyze /></RequirePermission>} />
        <Route path="cases" element={<RequirePermission any={['cases.view']}><Cases /></RequirePermission>} />
        <Route path="cases/:id" element={<RequirePermission any={['cases.view']}><CaseDetails /></RequirePermission>} />
        <Route path="reports" element={<RequirePermission any={['reports.view']}><Reports /></RequirePermission>} />
        <Route path="reports/:id" element={<RequirePermission any={['reports.view']}><ReportView /></RequirePermission>} />
        <Route path="admin" element={<RequirePermission any={['users.manage', 'audit.view', 'config.manage', 'models.manage']}><Admin /></RequirePermission>} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
