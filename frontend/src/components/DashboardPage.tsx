import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, ArrowRight, CalendarDays, CreditCard, Plus, Users } from 'lucide-react';
import { API_PATHS, apiRequest } from '../config/api';
import { getTenantName } from '../lib/auth';
import {
  countTodayActivities,
  countTodayCheckins,
  countTodayRegistrations,
  formatDateTime,
  getActivityStatusLabel,
} from '../lib/admin';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

interface ActivityItem {
  id: number;
  activity_name: string;
  start_time: string;
  end_time?: string;
  status: number;
  location?: string;
  require_payment?: number;
}

interface ActivityListResponse {
  items: ActivityItem[];
  total: number;
}

interface AdminUser {
  id: number;
  name?: string | null;
  phone?: string | null;
  create_time: string;
  isblock: number;
}

interface AdminUserListResponse {
  items: AdminUser[];
  total: number;
  skip: number;
  limit: number;
}

const DashboardPage = () => {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [activityRes, userRes] = await Promise.all([
          apiRequest<ActivityListResponse>(`${API_PATHS.activities.list}?skip=0&limit=100`),
          apiRequest<AdminUserListResponse>(`${API_PATHS.users.adminAllWeb}?skip=0&limit=100`),
        ]);

        if (activityRes.error) {
          throw new Error(activityRes.error);
        }
        if (userRes.error) {
          throw new Error(userRes.error);
        }

        setActivities(activityRes.data?.items ?? []);
        setUsers(userRes.data?.items ?? []);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : '工作台数据加载失败');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const metrics = useMemo(() => {
    return {
      activityTotal: activities.length,
      activeNow: activities.filter((item) => item.status === 2).length,
      todayRegistrations: countTodayRegistrations(users),
      todayCheckins: countTodayCheckins([]),
      pendingPayments: activities.filter((item) => item.require_payment === 1 && item.status !== 3).length,
      blockedUsers: users.filter((item) => item.isblock === 1).length,
      todayActivities: countTodayActivities(activities),
    };
  }, [activities, users]);

  const upcomingActivities = useMemo(
    () => [...activities]
      .filter((item) => new Date(item.start_time).getTime() >= Date.now())
      .sort((left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime())
      .slice(0, 5),
    [activities],
  );

  const recentUsers = useMemo(
    () => [...users]
      .sort((left, right) => new Date(right.create_time).getTime() - new Date(left.create_time).getTime())
      .slice(0, 5),
    [users],
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-display text-foreground">{getTenantName() || '当前租户'} 工作台</h1>
          <p className="mt-1 text-sm text-muted-foreground">欢迎回来，这里是您的活动管理概览</p>
        </div>
        <div className="flex gap-3">
          <Button asChild variant="outline" className="gap-2">
            <Link to="/activities/create">
              <Plus className="h-4 w-4" />
              创建活动
            </Link>
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link to="/users">
              <Users className="h-4 w-4" />
              用户管理
            </Link>
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error ? (
        <Card className="border-red-200 bg-red-50/80">
          <CardContent className="flex items-center gap-3 p-4 text-sm text-red-700">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <span>{error}</span>
          </CardContent>
        </Card>
      ) : null}

      {/* Quick Stats Row */}
      <div className="flex flex-wrap gap-6 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Activity className="h-4 w-4" />
          <span>共 {loading ? '—' : metrics.activityTotal} 个活动</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <CalendarDays className="h-4 w-4" />
          <span>进行中 {loading ? '—' : metrics.activeNow}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>今日报名 {loading ? '—' : metrics.todayRegistrations} 人</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <CreditCard className="h-4 w-4" />
          <span>今日签到 {loading ? '—' : metrics.todayCheckins} 人</span>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        {/* Activities List */}
        <Card className="border-border/60 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-lg">近期活动</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">即将开始或正在进行中的活动</p>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary/80">
              <Link to="/activities">
                查看全部 <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {upcomingActivities.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-muted-foreground">
                暂无近期活动
              </div>
            ) : (
              upcomingActivities.map((activity) => (
                <Link
                  key={activity.id}
                  to={`/activities/${activity.id}`}
                  className="flex items-center justify-between rounded-lg p-3 transition-colors hover:bg-slate-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <CalendarDays className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{activity.activity_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(activity.start_time)}
                        {activity.location ? ` · ${activity.location}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
                    {getActivityStatusLabel(activity.status)}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Recent Users */}
          <Card className="border-border/60 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">最近用户</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {recentUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">暂无用户数据</p>
              ) : (
                recentUsers.map((user) => (
                  <div key={user.id} className="flex items-center justify-between rounded-lg p-2 hover:bg-slate-50">
                    <div>
                      <p className="text-sm font-medium text-foreground">{user.name || `用户 #${user.id}`}</p>
                      <p className="text-xs text-muted-foreground">{user.phone || '未绑定手机号'}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDateTime(user.create_time)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Pending Tasks */}
          <Card className="border-border/60 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">待处理</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-lg p-3 bg-amber-50/50">
                <span className="text-amber-700">今日待开始活动</span>
                <span className="font-semibold text-amber-800">{loading ? '—' : metrics.todayActivities}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg p-3 bg-rose-50/50">
                <span className="text-rose-700">待支付活动</span>
                <span className="font-semibold text-rose-800">{loading ? '—' : metrics.pendingPayments}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg p-3 bg-slate-50">
                <span className="text-slate-600">黑名单用户</span>
                <span className="font-semibold text-slate-700">{loading ? '—' : metrics.blockedUsers}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;