import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, RefreshCw, ShieldAlert, TrendingUp, Users } from 'lucide-react';
import { API_PATHS } from '../config/api';
import { formatCurrency, formatDateTime } from '../lib/admin';
import { fetchAllListItems, fetchAllPaginatedItems, mapWithConcurrency } from '../lib/api-pagination';
import {
  ParticipantPaymentSource,
  summarizeEnrollmentPayments,
  summarizeReports,
} from '../lib/web-admin';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

interface ActivityItem {
  id: number;
  activity_name: string;
  status: number;
  require_payment: number;
  create_time?: string;
  start_time: string;
}

interface CheckinRecord {
  id: number;
  activity_name?: string | null;
  name: string;
  checkin_time: string;
}

interface UserItem {
  id: number;
  name?: string | null;
  phone?: string | null;
  create_time: string;
  isblock: number;
}

interface ParticipantItem extends ParticipantPaymentSource {
  activity_id: number;
}

async function fetchActivitiesForReports(): Promise<ActivityItem[]> {
  return fetchAllPaginatedItems<ActivityItem>(
    (skip, limit) => `${API_PATHS.activities.list}?skip=${skip}&limit=${limit}`,
    100,
  );
}

async function fetchUsersForReports(): Promise<UserItem[]> {
  return fetchAllPaginatedItems<UserItem>(
    (skip, limit) => `${API_PATHS.users.adminAll}?skip=${skip}&limit=${limit}`,
    100,
  );
}

async function fetchCheckinsForActivities(activities: ActivityItem[]): Promise<CheckinRecord[]> {
  const allCheckins = await mapWithConcurrency(
    activities,
    5,
    async (activity) => {
      const items = await fetchAllListItems<CheckinRecord>(
        (skip, limit) => `${API_PATHS.checkins.list}?skip=${skip}&limit=${limit}&activity_id=${activity.id}`,
        100,
      );

      return items.map((item) => ({
        ...item,
        activity_name: item.activity_name || activity.activity_name,
      }));
    },
  );

  return allCheckins.flat();
}

async function fetchParticipantsForActivities(activities: ActivityItem[]): Promise<{
  participants: ParticipantItem[];
  failedCount: number;
}> {
  const results = await mapWithConcurrency(activities, 5, async (activity) => {
    try {
      const response = await fetchAllPaginatedItems<ParticipantItem>(
        (skip, limit) => `${API_PATHS.activities.participants(activity.id)}?skip=${skip}&limit=${limit}`,
        100,
      );

      return {
        status: 'fulfilled' as const,
        value: response.map((participant) => ({
          ...participant,
          activity_id: participant.activity_id || activity.id,
        })),
      };
    } catch (error) {
      return {
        status: 'rejected' as const,
        reason: error,
      };
    }
  });

  const participants: ParticipantItem[] = [];
  let failedCount = 0;

  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      participants.push(...result.value);
    } else {
      failedCount += 1;
    }
  });

  return { participants, failedCount };
}

const ReportsPage = () => {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [checkins, setCheckins] = useState<CheckinRecord[]>([]);
  const [participants, setParticipants] = useState<ParticipantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotices([]);

    try {
      const fetchedActivities = await fetchActivitiesForReports();
      setActivities(fetchedActivities);

      const nextNotices: string[] = [];

      const [usersResult, checkinsResult, participantsResult] = await Promise.allSettled([
        fetchUsersForReports(),
        fetchCheckinsForActivities(fetchedActivities),
        fetchParticipantsForActivities(fetchedActivities),
      ]);

      if (usersResult.status === 'fulfilled') {
        setUsers(usersResult.value);
      } else {
        setUsers([]);
        nextNotices.push('当前账号暂无完整用户报表权限，用户指标已降级为不可用。');
      }

      if (checkinsResult.status === 'fulfilled') {
        setCheckins(checkinsResult.value);
      } else {
        setCheckins([]);
        nextNotices.push('部分签到报表加载失败，已暂时隐藏签到趋势与最近签到列表。');
      }

      if (participantsResult.status === 'fulfilled') {
        setParticipants(participantsResult.value.participants);
        if (participantsResult.value.failedCount > 0) {
          nextNotices.push(`有 ${participantsResult.value.failedCount} 个活动的报名明细加载失败，支付统计按已成功活动汇总。`);
        }
      } else {
        setParticipants([]);
        nextNotices.push('支付与报名明细暂未完整加载，金额与支付转化指标已降级为不可用。');
      }

      setNotices(nextNotices);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : '数据报表加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const summary = useMemo(() => summarizeReports(activities, users, checkins), [activities, users, checkins]);
  const paymentSummary = useMemo(() => {
    const paidActivities = activities.filter((activity) => activity.require_payment === 1);
    const paidActivityIds = new Set(paidActivities.map((activity) => activity.id));
    const paidParticipants = participants.filter((participant) => paidActivityIds.has(participant.activity_id));

    return {
      paidActivityCount: paidActivities.length,
      ...summarizeEnrollmentPayments(paidParticipants, 1),
    };
  }, [activities, participants]);
  const recentCheckins = useMemo(
    () => [...checkins]
      .sort((left, right) => new Date(right.checkin_time).getTime() - new Date(left.checkin_time).getTime())
      .slice(0, 6),
    [checkins],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">数据报表</h1>
          <p className="mt-2 text-sm text-slate-600">
            基于当前账号可见的活动范围汇总活动、用户和签到数据，优先保证口径一致与权限边界正确。
          </p>
        </div>
        <Button variant="outline" onClick={fetchReports}>
          <RefreshCw className="h-4 w-4" />
          刷新报表
        </Button>
      </div>

      {error ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 text-sm text-red-700">{error}</CardContent>
        </Card>
      ) : null}

      {notices.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="space-y-2 p-4 text-sm text-amber-800">
            {notices.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="p-6"><p className="text-sm text-slate-500">活动总数</p><p className="mt-3 text-3xl font-semibold">{loading ? '--' : summary.totalActivities}</p></CardContent></Card>
        <Card><CardContent className="p-6"><p className="text-sm text-slate-500">进行中活动</p><p className="mt-3 text-3xl font-semibold">{loading ? '--' : summary.activeActivities}</p></CardContent></Card>
        <Card><CardContent className="p-6"><p className="text-sm text-slate-500">用户总数</p><p className="mt-3 text-3xl font-semibold">{loading ? '--' : summary.totalUsers}</p></CardContent></Card>
        <Card><CardContent className="p-6"><p className="text-sm text-slate-500">累计签到</p><p className="mt-3 text-3xl font-semibold">{loading ? '--' : summary.totalCheckins}</p></CardContent></Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Card className="bg-white/90">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <BarChart3 className="h-5 w-5 text-emerald-600" />
                活动状态分布
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              {summary.activityStatus.map((item) => (
                <div key={item.label} className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">{item.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{loading ? '--' : item.value}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-white/90">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <TrendingUp className="h-5 w-5 text-sky-600" />
                最近 7 天趋势
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700">新增用户</p>
                {summary.userTrend.map((point) => (
                  <div key={point.date} className="flex items-center gap-3">
                    <div className="w-14 text-sm text-slate-500">{point.label}</div>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-sky-500"
                        style={{ width: `${Math.min(100, point.value * 20)}%` }}
                      />
                    </div>
                    <div className="w-8 text-right text-sm text-slate-700">{point.value}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700">签到记录</p>
                {summary.checkinTrend.map((point) => (
                  <div key={point.date} className="flex items-center gap-3">
                    <div className="w-14 text-sm text-slate-500">{point.label}</div>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${Math.min(100, point.value * 20)}%` }}
                      />
                    </div>
                    <div className="w-8 text-right text-sm text-slate-700">{point.value}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-white/90">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Users className="h-5 w-5 text-violet-600" />
                用户与收费概览
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-2xl bg-slate-100 p-4 text-slate-700">
                今日新增用户 {loading ? '--' : summary.todayUsers} 人，黑名单用户 {loading ? '--' : summary.blockedUsers} 人。
              </div>
              <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-800">
                付费活动 {loading ? '--' : paymentSummary.paidActivityCount} 场，免费活动 {loading ? '--' : summary.freeActivities} 场。
              </div>
              <div className="rounded-2xl bg-amber-50 p-4 text-amber-800">
                已支付 {loading ? '--' : paymentSummary.paidCount} 人，待处理支付 {loading ? '--' : paymentSummary.pendingPaymentCount + paymentSummary.unpaidWaitlistCount} 人，实收 {loading ? '--' : formatCurrency(paymentSummary.paidAmount)}。
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/90">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <ShieldAlert className="h-5 w-5 text-amber-600" />
                最近签到
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <p className="text-sm text-slate-500">签到记录加载中...</p>
              ) : recentCheckins.length === 0 ? (
                <p className="text-sm text-slate-500">暂无签到数据</p>
              ) : (
                recentCheckins.map((record) => (
                  <div key={`${record.id}-${record.checkin_time}`} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-slate-900">{record.name}</p>
                        <p className="mt-1 text-sm text-slate-500">{record.activity_name || '未识别活动'}</p>
                      </div>
                      <span className="text-xs text-slate-400">{formatDateTime(record.checkin_time)}</span>
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

export default ReportsPage;
