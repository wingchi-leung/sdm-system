import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, MapPin, Users } from 'lucide-react';
import { API_PATHS, apiRequest } from '../config/api';
import { formatCurrency, formatDateTime, getActivityStatusLabel } from '../lib/admin';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

interface ActivityDetailItem {
  id: number;
  activity_name: string;
  activity_type_name?: string | null;
  start_time: string;
  end_time?: string | null;
  status: number;
  tag?: string | null;
  suggested_fee: number;
  require_payment: number;
  poster_url?: string | null;
  location?: string | null;
  max_participants?: number | null;
  create_time: string;
  update_time: string;
}

interface EnrollmentInfo {
  max_participants?: number | null;
  enrolled_count: number;
  waitlist_count: number;
  remaining_quota?: number | null;
  is_full: boolean;
}

interface ActivityStats {
  total: number;
  checked_in: number;
  checked_in_rate: number;
  waitlist_count?: number;
}

const ActivityDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activity, setActivity] = useState<ActivityDetailItem | null>(null);
  const [enrollmentInfo, setEnrollmentInfo] = useState<EnrollmentInfo | null>(null);
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const activityId = Number(id);
    if (!activityId) {
      setError('活动编号无效');
      setLoading(false);
      return;
    }

    const fetchDetail = async () => {
      setLoading(true);
      setError(null);

      try {
        const [detailRes, enrollmentRes, statsRes] = await Promise.all([
          apiRequest<ActivityDetailItem>(API_PATHS.activities.detail(activityId)),
          apiRequest<EnrollmentInfo>(API_PATHS.activities.enrollmentInfo(activityId)),
          apiRequest<ActivityStats>(API_PATHS.activities.statistics(activityId)),
        ]);

        if (detailRes.error) {
          throw new Error(detailRes.error);
        }

        setActivity(detailRes.data ?? null);
        setEnrollmentInfo(enrollmentRes.data ?? null);
        setStats(statsRes.data ?? null);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : '活动详情加载失败');
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [id]);

  if (loading) {
    return <div className="py-12 text-center text-sm text-slate-500">活动详情加载中...</div>;
  }

  if (error || !activity) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="space-y-4 p-6">
          <p className="text-sm text-red-700">{error || '活动不存在'}</p>
          <Button variant="outline" onClick={() => navigate('/activities')}>
            返回活动列表
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/activities')} aria-label="返回活动列表">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold text-slate-900">{activity.activity_name}</h1>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-700">
                {getActivityStatusLabel(activity.status)}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              {activity.activity_type_name || '未分类'}
              {activity.tag ? ` · ${activity.tag}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link to={`/activities/${activity.id}/participants`}>查看报名名单</Link>
          </Button>
          <Button asChild>
            <Link to={`/activities/edit/${activity.id}`}>编辑活动</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="p-6"><p className="text-sm text-slate-500">报名人数</p><p className="mt-3 text-3xl font-semibold">{enrollmentInfo?.enrolled_count ?? '--'}</p></CardContent></Card>
        <Card><CardContent className="p-6"><p className="text-sm text-slate-500">候补人数</p><p className="mt-3 text-3xl font-semibold">{enrollmentInfo?.waitlist_count ?? '--'}</p></CardContent></Card>
        <Card><CardContent className="p-6"><p className="text-sm text-slate-500">签到人数</p><p className="mt-3 text-3xl font-semibold">{stats?.checked_in ?? '--'}</p></CardContent></Card>
        <Card><CardContent className="p-6"><p className="text-sm text-slate-500">剩余名额</p><p className="mt-3 text-3xl font-semibold">{enrollmentInfo?.remaining_quota ?? '不限'}</p></CardContent></Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="text-xl">活动信息</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">开始时间</p>
              <div className="mt-2 flex items-center gap-2 text-slate-900">
                <CalendarDays className="h-4 w-4 text-slate-400" />
                <span>{formatDateTime(activity.start_time)}</span>
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">结束时间</p>
              <div className="mt-2 text-slate-900">
                {activity.end_time ? formatDateTime(activity.end_time) : '未设置'}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">活动地点</p>
              <div className="mt-2 flex items-center gap-2 text-slate-900">
                <MapPin className="h-4 w-4 text-slate-400" />
                <span>{activity.location || '线上活动 / 待补充'}</span>
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">费用设置</p>
              <div className="mt-2 text-slate-900">
                {activity.require_payment === 1 ? `收费 · ${formatCurrency(activity.suggested_fee)}` : '免费活动'}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">人数上限</p>
              <div className="mt-2 flex items-center gap-2 text-slate-900">
                <Users className="h-4 w-4 text-slate-400" />
                <span>{activity.max_participants ?? '不限'}</span>
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">更新时间</p>
              <div className="mt-2 text-slate-900">{formatDateTime(activity.update_time)}</div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="text-xl">运营概览</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-800">
              当前报名 {enrollmentInfo?.enrolled_count ?? 0} 人，
              {enrollmentInfo?.is_full ? ' 已达到人数上限。' : ` 剩余名额 ${enrollmentInfo?.remaining_quota ?? '不限'}。`}
            </div>
            <div className="rounded-2xl bg-slate-100 p-4 text-slate-700">
              签到率 {typeof stats?.checked_in_rate === 'number' ? `${Math.round(stats.checked_in_rate * 100)}%` : '--'}
            </div>
            <div className="rounded-2xl bg-amber-50 p-4 text-amber-800">
              后续可继续在这里承接支付统计、签到异常提醒与操作日志。
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ActivityDetail;
