import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import ActivityDetail from './components/ActivityDetail';
import ActivityList from './components/ActivityList';
import ActivityParticipants from './components/ActivityParticipants';
import CreateActivity from './components/CreateActivity';
import DashboardPage from './components/DashboardPage';
import EditActivity from './components/EditActivity';
import LoginPage from './components/LoginPage';
import MainLayout from './components/MainLayOut';
import ModulePage from './components/ModulePage';
import PermissionsPage from './components/PermissionsPage';
import ProtectedRoute from './components/ProtectedRoute';
import SignInPage from './components/SignInPage';
import Statistics from './components/Statistics';
import UserManagement from './components/UserManagement';

const App = () => {
  return (
    <BrowserRouter>
      <MainLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<LoginPage />} />

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
                <ModulePage
                  title="报名与签到"
                  description="本轮先通过活动详情和报名名单页承接核心流程，后续会继续抽成独立运营模块。"
                  highlights={[
                    '按活动查看报名名单与候补名单',
                    '签到记录与现场核销',
                    '导出能力与异常提示',
                  ]}
                />
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
                <ModulePage
                  title="租户管理"
                  description="该模块将用于平台管理员的跨租户治理，本轮先预留导航与页面容器。"
                  highlights={[
                    '租户列表与状态管理',
                    '租户管理员配置',
                    '套餐、到期时间与容量信息',
                  ]}
                />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/reports"
            element={(
              <ProtectedRoute>
                <ModulePage
                  title="数据报表"
                  description="报表中心将放在后续阶段建设，当前先通过工作台和活动详情承接核心统计。"
                  highlights={[
                    '活动报表',
                    '报名转化与签到统计',
                    '支付与用户增长分析',
                  ]}
                />
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
