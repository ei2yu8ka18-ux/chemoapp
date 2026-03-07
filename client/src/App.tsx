import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import TreatmentListPage from './pages/TreatmentListPage';
import UserManagementPage from './pages/UserManagementPage';
import HistoryPage from './pages/HistoryPage';
import DiaryPage from './pages/DiaryPage';
import DiaryListPage from './pages/DiaryListPage';
import MonthlyPage from './pages/MonthlyPage';
import AnnualPage  from './pages/AnnualPage';
import GuidancePage from './pages/GuidancePage';
import RegimenCheckPage from './pages/RegimenCheckPage';
import RegimenCalendarPage from './pages/RegimenCalendarPage';
import InterventionReportPage from './pages/InterventionReportPage';
import PasswordChangePage from './pages/PasswordChangePage';
import PreConsultSettingsPage from './pages/PreConsultSettingsPage';
import DailySnapshotListPage from './pages/DailySnapshotListPage';
import AuthLogsPage from './pages/AuthLogsPage';
import Sidebar from './components/Sidebar';


function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, overflow: 'auto' }}>
        {children}
      </Box>
    </Box>
  );
}

function AppRoutes() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />

      <Route path="/" element={
        <PrivateRoute><AppLayout><TreatmentListPage /></AppLayout></PrivateRoute>
      } />
      <Route path="/regimen" element={
        <PrivateRoute><AppLayout><RegimenCheckPage /></AppLayout></PrivateRoute>
      } />
      <Route path="/regimen-calendar" element={
        <PrivateRoute><AppLayout><RegimenCalendarPage /></AppLayout></PrivateRoute>
      } />
      <Route path="/guidance" element={
        <PrivateRoute><AppLayout><GuidancePage /></AppLayout></PrivateRoute>
      } />
      <Route path="/diary" element={
        <PrivateRoute><AppLayout><DiaryPage /></AppLayout></PrivateRoute>
      } />
      <Route path="/history" element={
        <PrivateRoute><AppLayout><HistoryPage /></AppLayout></PrivateRoute>
      } />
      <Route path="/diary-list" element={
        <PrivateRoute><AppLayout><DiaryListPage /></AppLayout></PrivateRoute>
      } />
      <Route path="/monthly" element={
        <PrivateRoute><AppLayout><MonthlyPage /></AppLayout></PrivateRoute>
      } />
      <Route path="/intervention-report" element={
        <PrivateRoute><AppLayout><InterventionReportPage /></AppLayout></PrivateRoute>
      } />
      <Route path="/annual" element={
        <PrivateRoute><AppLayout><AnnualPage /></AppLayout></PrivateRoute>
      } />
      <Route path="/change-password" element={
        <PrivateRoute><AppLayout><PasswordChangePage /></AppLayout></PrivateRoute>
      } />
      <Route path="/snapshot-list" element={
        <PrivateRoute><AppLayout><DailySnapshotListPage /></AppLayout></PrivateRoute>
      } />
      <Route path="/admin/users" element={
        <AdminRoute><AppLayout><UserManagementPage /></AppLayout></AdminRoute>
      } />
      <Route path="/admin/pre-consult-settings" element={
        <AdminRoute><AppLayout><PreConsultSettingsPage /></AppLayout></AdminRoute>
      } />
      <Route path="/admin/auth-logs" element={
        <AdminRoute><AppLayout><AuthLogsPage /></AppLayout></AdminRoute>
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
