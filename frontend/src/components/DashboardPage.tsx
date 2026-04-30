import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, ArrowRight, CalendarDays, CreditCard, Users } from 'lucide-react';
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

const metricCards = [
  { key: 'activityTotal', label: '活动总数', icon: Activity },
  { key: 'activeNow', label: '进行中活动', icon: CalendarDays },
  { key: 'todayRegistrations', label: '今日报名人数', icon: Users },
  { key: 'todayCheckins', label: '今日签到人数', icon: CreditCard },
];

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
          apiRequest<AdminUserListResponse>(`${API_PATHS.users.adminAll}?skip=0&limit=100`),
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
    const waitlistCount = 0;

    return {
      activityTotal: activities.length,
      activeNow: activities.filter((item) => item.status === 2).length,
      todayRegistrations: countTodayRegistrations(users),
      todayCheckins: countTodayCheckins([]),
      waitlistCount,
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
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-800 p-6 text-white shadow-xl lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-slate-200">SDM 主管理后台</p>
          <h1 className="mt-2 text-3xl font-semibold">
            {getTenantName() || '当前租户'}
            <span className="ml-2 text-base font-normal text-slate-300">工作台</span>
          </h1>
          
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild className="bg-white text-slate-900 hover:bg-slate-100">
            <Link to="/activities/create">创建活动</Link>
          </Button>
          <Button asChild variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20">
            <Link to="/users">查看用户</Link>
          </Button>
        </div>
      </div>

      {error ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-3 p-6 text-sm text-red-700">
            <AlertTriangle className="h-5 w-5" />
            <span>{error}</span>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map(({ key, label, icon: Icon }) => (
          <Card key={key} className="border-slate-200 bg-white/90">
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <p className="text-sm text-slate-500">{label}</p>
                <p className="mt-3 text-3xl font-semibold text-slate-900">
                  {loading ? '--' : metrics[key as keyof typeof metrics]}
                </p>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                <Icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <Card className="bg-white/90">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-xl">近期活动</CardTitle>
              <p className="text-sm text-slate-500">优先关注即将开始或正在进行中的活动。</p>
            </div>
            <Button asChild variant="ghost" className="text-slate-700">
              <Link to="/activities">
                查看全部
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingActivities.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                暂无近期活动
              </div>
            ) : (
              upcomingActivities.map((activity) => (
                <Link
                  key={activity.id}
                  to={`/activities/${activity.id}`}
                  className="block rounded-2xl border border-slate-200 p-4 transition hover:border-emerald-300 hover:bg-emerald-50/40"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-slate-900">{activity.activity_name}</h3>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                          {getActivityStatusLabel(activity.status)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">
                        {formatDateTime(activity.start_time)}
                        {activity.location ? ` · ${activity.location}` : ''}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="bg-white/90">
            <CardHeader>
              <CardTitle className="text-xl">待处理事项</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-2xl bg-amber-50 p-4 text-amber-800">
                今日待开始活动 {loading ? '--' : metrics.todayActivities} 场，建议优先检查签到与现场名单。
              </div>
              <div className="rounded-2xl bg-rose-50 p-4 text-rose-800">
                待支付活动 {loading ? '--' : metrics.pendingPayments} 场，后续可继续接入支付订单明细。
              </div>
              <div className="rounded-2xl bg-slate-100 p-4 text-slate-700">
                黑名单用户 {loading ? '--' : metrics.blockedUsers} 人，已在用户管理页支持查看与解除。
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/90">
            <CardHeader>
              <CardTitle className="text-xl">最近用户</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentUsers.length === 0 ? (
                <p className="text-sm text-slate-500">暂无用户数据</p>
              ) : (
                recentUsers.map((user) => (
                  <div key={user.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium text-slate-900">{user.name || `用户 #${user.id}`}</p>
                        <p className="mt-1 text-sm text-slate-500">{user.phone || '未绑定手机号'}</p>
                      </div>
                      <span className="text-xs text-slate-400">{formatDateTime(user.create_time)}</span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
