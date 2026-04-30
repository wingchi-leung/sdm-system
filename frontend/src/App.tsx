import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import ActivityDetail from './components/ActivityDetail';
import ActivityList from './components/ActivityList';
import ActivityParticipants from './components/ActivityParticipants';
import ChangePasswordPage from './components/ChangePasswordPage';
import CreateActivity from './components/CreateActivity';
import DashboardPage from './components/DashboardPage';
import EditActivity from './components/EditActivity';
import EnrollmentsPage from './components/EnrollmentsPage';
import LoginPage from './components/LoginPage';
import MainLayout from './components/MainLayOut';
import ModulePage from './components/ModulePage';
import PermissionsPage from './components/PermissionsPage';
import ProtectedRoute from './components/ProtectedRoute';
import ReportsPage from './components/ReportsPage';
import SignInPage from './components/SignInPage';
import Statistics from './components/Statistics';
import TenantManagementPage from './components/TenantManagementPage';
import UserManagement from './components/UserManagement';

const App = () => {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <MainLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/change-password"
            element={
              <ProtectedRoute>
                <ChangePasswordPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard"
            element={(
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/activities"
            element={(
              <ProtectedRoute>
                <ActivityList />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/activities/create"
            element={(
              <ProtectedRoute>
                <CreateActivity />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/activities/:id"
            element={(
              <ProtectedRoute>
                <ActivityDetail />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/activities/edit/:id"
            element={(
              <ProtectedRoute>
                <EditActivity />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/activities/:id/participants"
            element={(
              <ProtectedRoute>
                <ActivityParticipants />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/enrollments"
            element={(
              <ProtectedRoute>
                <EnrollmentsPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/users"
            element={(
              <ProtectedRoute>
                <UserManagement />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/permissions"
            element={(
              <ProtectedRoute>
                <PermissionsPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/tenants"
            element={(
              <ProtectedRoute>
                <TenantManagementPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/reports"
            element={(
              <ProtectedRoute>
                <ReportsPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/settings"
            element={(
              <ProtectedRoute>
                <ModulePage
                  title="系统设置"
                  description="后续会逐步补充支付配置、上传配置、字典项和审计日志。"
                  highlights={[
                    '支付设置',
                    '上传与存储配置',
                    '基础字典与审计日志',
                  ]}
                />
              </ProtectedRoute>
            )}
          />

          <Route
            path="/signin"
            element={(
              <ProtectedRoute>
                <SignInPage />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/statistics"
            element={(
              <ProtectedRoute>
                <Statistics />
              </ProtectedRoute>
            )}
          />
        </Routes>
      </MainLayout>
    </BrowserRouter>
  );
};

export default App;
