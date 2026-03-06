import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from "../lib/utils"
import { Button } from './ui/button';
import { LogIn, LogOut, ClipboardList, BarChart, User, Calendar } from "lucide-react";
import { isAuthenticated, clearToken } from '../lib/auth';

const MainLayout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const authenticated = isAuthenticated();

  const handleLogout = () => {
    clearToken();
    navigate('/login', { replace: true });
  };

const menuItems = [
    {
      href: '/signin',
      title: '活动签到',
      icon: ClipboardList
    },
    {
      href: '/statistics',
      title: '日志统计',
      icon: BarChart
    },
    {
      href: '/activities',
      title: '活动管理',
      icon: Calendar
    },
    {
      href: '/createactivity',
      title: '创建活动',
      icon: BarChart
    },
    {
      href: '/users',
      title: '用户管理',
      icon: User
    }
  ];

  return (
    <div className="min-h-screen">
      {/* Sidebar */}
      <div className="fixed left-0 top-0 w-64 h-full border-r bg-gray-100/40 backdrop-blur-sm">
        {/* Logo */}
        <div className="flex items-center justify-center h-16 border-b">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            SDM
          </h1>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                to={item.href}
              >
                <Button
                  variant={location.pathname === item.href ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start gap-2",
                    location.pathname === item.href && "bg-gray-200"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.title}
                </Button>
              </Link>
            );
          })}
          <div className="pt-4 border-t mt-2">
            {authenticated ? (
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 text-muted-foreground"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                退出登录
              </Button>
            ) : (
              <Link to="/login">
                <Button
                  variant="ghost"
                  className={cn(
                    "w-full justify-start gap-2",
                    location.pathname === '/login' && "bg-gray-200"
                  )}
                >
                  <LogIn className="h-4 w-4" />
                  登录
                </Button>
              </Link>
            )}
          </div>
        </nav>
      </div>

      {/* Main Content */}
      <div className="pl-64">
        <main className="p-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export default MainLayout;