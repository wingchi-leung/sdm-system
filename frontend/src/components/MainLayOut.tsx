import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  CalendarRange,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Button } from './ui/button';
import { clearToken, getAuthRole, getTenantName, isAuthenticated } from '../lib/auth';
import { cn } from '../lib/utils';

const menuGroups = [
  {
    label: '主工作流',
    items: [
      { href: '/dashboard', title: '工作台', icon: LayoutDashboard },
      { href: '/activities', title: '活动管理', icon: CalendarRange },
      { href: '/enrollments', title: '报名与签到', icon: CreditCard },
      { href: '/users', title: '用户管理', icon: Users },
    ],
  },
  {
    label: '平台能力',
    items: [
      { href: '/permissions', title: '权限与管理员', icon: ShieldCheck },
      { href: '/tenants', title: '租户管理', icon: Building2 },
      { href: '/reports', title: '数据报表', icon: BarChart3 },
      { href: '/settings', title: '系统设置', icon: Settings },
    ],
  },
  {
    label: '兼容旧页',
    items: [
      { href: '/signin', title: '签到工具页', icon: CreditCard },
      { href: '/statistics', title: '旧统计页', icon: BarChart3 },
    ],
  },
];

const MainLayout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const authenticated = isAuthenticated();
  const authRole = getAuthRole();

  if (!authenticated || location.pathname === '/login') {
    return <div className="min-h-screen bg-slate-100">{children}</div>;
  }

  const handleLogout = () => {
    clearToken();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef6f3_100%)]">
      <aside className="fixed left-0 top-0 flex h-full w-72 flex-col border-r border-slate-200 bg-slate-950 text-white shadow-2xl">
        <div className="border-b border-white/10 px-6 py-6">
          <p className="text-xs uppercase tracking-[0.35em] text-emerald-300">SDM System</p>
          <h1 className="mt-3 text-3xl font-semibold">主管理端</h1>
          <p className="mt-2 text-sm text-slate-300">{getTenantName() || '当前租户'}</p>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-6">
          {menuGroups.map((group) => (
            <div key={group.label}>
              <p className="px-3 text-xs text-slate-400">{group.label}</p>
              <div className="mt-2 space-y-1">
                {group.items
                  .filter((item) => authRole === 'admin' || item.href === '/tenants')
                  .map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname === item.href || location.pathname.startsWith(`${item.href}/`);

                  return (
                    <Link key={item.href} to={item.href}>
                      <Button
                        variant="ghost"
                        className={cn(
                          'w-full justify-start rounded-xl px-3 text-slate-200 hover:bg-white/10 hover:text-white',
                          active && 'bg-emerald-500/15 text-white ring-1 ring-emerald-400/30',
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {item.title}
                      </Button>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 p-4">
          <Button
            variant="ghost"
            className="w-full justify-start rounded-xl text-slate-300 hover:bg-white/10 hover:text-white"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            退出登录
          </Button>
        </div>
      </aside>

      <div className="pl-72">
        <main className="min-h-screen p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
};

export default MainLayout;
