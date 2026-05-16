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
import { logoutApi } from '../config/api';
import { clearToken, getIsSuperAdmin, getPermissions, getTenantName, isAuthenticated, isPlatformAdmin } from '../lib/auth';
import { cn } from '../lib/utils';

interface MenuItem {
  href: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  requiredPermission?: string;
  requiredSuperAdmin?: boolean;
}

const menuGroups: { label: string; items: MenuItem[] }[] = [
  {
    label: '主工作流',
    items: [
      { href: '/dashboard', title: '工作台', icon: LayoutDashboard, requiredSuperAdmin: true },
      { href: '/activities', title: '活动管理', icon: CalendarRange },
      { href: '/enrollments', title: '报名与签到', icon: CreditCard },
      { href: '/users', title: '用户管理', icon: Users, requiredSuperAdmin: true },
      { href: '/user-activity-types', title: '活动类型分配', icon: Users, requiredSuperAdmin: true },
    ],
  },
  {
    label: '平台能力',
    items: [
      { href: '/permissions', title: '权限与管理员', icon: ShieldCheck, requiredPermission: 'role.manage' },
      { href: '/tenants', title: '租户管理', icon: Building2 },
      { href: '/reports', title: '数据报表', icon: BarChart3, requiredSuperAdmin: true },
      { href: '/settings', title: '系统设置', icon: Settings },
    ],
  },
];

const MainLayout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const authenticated = isAuthenticated();
  const platformAdmin = isPlatformAdmin();
  const isSuperAdmin = getIsSuperAdmin();
  const permissions = getPermissions();

  if (!authenticated || location.pathname === '/login') {
    return <div className="min-h-screen bg-background">{children}</div>;
  }

  const handleLogout = async () => {
    try {
      await logoutApi();
    } finally {
      clearToken();
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 flex h-full w-64 flex-col border-r border-border/60 bg-card shadow-lg">
        {/* Logo Area */}
        <div className="border-b border-border/60 px-6 py-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">SDM System</p>
          <h1 className="mt-3 text-xl font-bold tracking-tight font-display text-foreground">主管理端</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{getTenantName() || '当前租户'}</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
          {menuGroups.map((group) => (
            <div key={group.label}>
              <p className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">{group.label}</p>
              <div className="space-y-0.5">
                {group.items
                  .filter((item) => {
                    if (platformAdmin) return true;
                    if (item.href === '/tenants') return false;
                    if (item.requiredSuperAdmin && !isSuperAdmin) return false;
                    if (!item.requiredPermission) return true;
                    return permissions.includes(item.requiredPermission);
                  })
                  .map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname === item.href || location.pathname.startsWith(`${item.href}/`);

                  return (
                    <Link key={item.href} to={item.href}>
                      <Button
                        variant="ghost"
                        className={cn(
                          'w-full justify-start gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-150 hover:text-foreground hover:bg-primary/5',
                          active && 'bg-primary/10 text-primary shadow-sm',
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

        {/* Logout */}
        <div className="border-t border-border/60 p-4">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 rounded-lg text-muted-foreground hover:text-foreground hover:bg-destructive/5"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            退出登录
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="pl-64">
        <main className="min-h-screen p-8">{children}</main>
      </div>
    </div>
  );
};

export default MainLayout;