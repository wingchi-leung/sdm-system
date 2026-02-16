import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from "../lib/utils"
import { Button } from './ui/button';
import {
  LayoutDashboard,
  ClipboardList,
  BarChart,
  User
} from "lucide-react"

const MainLayout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  
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
      href: '/createactivity',
      title: '创建活动',
      icon: BarChart
    },
    {
      href: '/users',
      title: '用户管理',
      icon: User  // Add import from lucide-react
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