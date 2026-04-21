import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, CreditCard, RefreshCw, Users } from 'lucide-react';
import { API_PATHS, apiRequest } from '../config/api';
import { formatCurrency, formatDateTime } from '../lib/admin';
import { fetchAllListItems, fetchAllPaginatedItems } from '../lib/api-pagination';
import {
  getParticipantPaymentStatusMeta,
  summarizeEnrollmentPayments,
} from '../lib/web-admin';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

interface ActivityItem {
  id: number;
  activity_name: string;
  activity_type_id?: number | null;
  activity_type_name?: string | null;
  status: number;
  start_time: string;
  require_payment?: number;
}

interface ParticipantItem {
  id: number;
  participant_name: string;
  phone: string;
  identity_number?: string | null;
  enroll_status?: number | null;
  payment_status?: number | null;
  payment_order_id?: number | null;
  paid_amount?: number | null;
  create_time: string;
}

interface CheckinRecord {
  id: number;
  activity_name?: string | null;
  name: string;
  identity_number?: string | null;
  phone?: string | null;
  checkin_time: string;
  note?: string | null;
}

interface EnrollmentInfo {
  enrolled_count: number;
  waitlist_count: number;
  remaining_quota?: number | null;
  is_full: boolean;
}

async function fetchActivities(): Promise<ActivityItem[]> {
  return fetchAllPaginatedItems<ActivityItem>(
    (skip, limit) => `${API_PATHS.activities.list}?skip=${skip}&limit=${limit}`,
    100,
  );
}

async function fetchActivityParticipants(activityId: number): Promise<ParticipantItem[]> {
  return fetchAllPaginatedItems<ParticipantItem>(
    (skip, limit) => `${API_PATHS.activities.participants(activityId)}?skip=${skip}&limit=${limit}`,
    100,
  );
}

async function fetchActivityCheckins(activityId: number): Promise<CheckinRecord[]> {
  return fetchAllListItems<CheckinRecord>(
    (skip, limit) => `${API_PATHS.checkins.list}?skip=${skip}&limit=${limit}&activity_id=${activityId}`,
    100,
  );
}

const EnrollmentsPage = () => {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState<string>('');
  const [participants, setParticipants] = useState<ParticipantItem[]>([]);
  const [checkins, setCheckins] = useState<CheckinRecord[]>([]);
  const [enrollmentInfo, setEnrollmentInfo] = useState<EnrollmentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');

  const loadActivities = useCallback(async () => {
    const items = await fetchActivities();
    setActivities(items);
    return items;
  }, []);

  const loadActivityDetail = useCallback(async (activityId: number) => {
    const [participantItems, checkinItems, enrollmentResponse] = await Promise.all([
      fetchActivityParticipants(activityId),
      fetchActivityCheckins(activityId),
      apiRequest<EnrollmentInfo>(API_PATHS.activities.enrollmentInfo(activityId)),
    ]);

    if (enrollmentResponse.error) {
      throw new Error(enrollmentResponse.error);
    }

    setParticipants(participantItems);
    setCheckins(checkinItems);
    setEnrollmentInfo(enrollmentResponse.data ?? null);
  }, []);

  const refreshPage = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const activityItems = await loadActivities();
      const nextActivityId = selectedActivityId || (activityItems[0] ? String(activityItems[0].id) : '');

      if (nextActivityId && nextActivityId !== selectedActivityId) {
        setSelectedActivityId(nextActivityId);
        setParticipants([]);
        setCheckins([]);
        setEnrollmentInfo(null);
      } else if (nextActivityId) {
        await loadActivityDetail(Number(nextActivityId));
      } else {
        setParticipants([]);
        setCheckins([]);
        setEnrollmentInfo(null);
      }
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : '报名与签到页面加载失败');
    } finally {
      setLoading(false);
    }
  }, [loadActivities, loadActivityDetail, selectedActivityId]);

  useEffect(() => {
    refreshPage();
  }, [refreshPage]);

  useEffect(() => {
    if (!selectedActivityId) {
      return;
    }

    const reloadSelectedActivity = async () => {
      setLoading(true);
      setError(null);

      try {
        await loadActivityDetail(Number(selectedActivityId));
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : '活动报名数据加载失败');
      } finally {
        setLoading(false);
      }
    };

    reloadSelectedActivity();
  }, [selectedActivityId, loadActivityDetail]);

  const selectedActivity = useMemo(
    () => activities.find((item) => String(item.id) === selectedActivityId) ?? null,
    [activities, selectedActivityId],
  );
  const paymentSummary = useMemo(
    () => summarizeEnrollmentPayments(participants, selectedActivity?.require_payment),
    [participants, selectedActivity?.require_payment],
  );

  const filteredParticipants = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return participants.filter((item) => {
      const matchKeyword = !normalizedKeyword
        || item.participant_name.toLowerCase().includes(normalizedKeyword)
        || (item.phone || '').toLowerCase().includes(normalizedKeyword)
        || (item.identity_number || '').toLowerCase().includes(normalizedKeyword);

      if (!matchKeyword) {
        return false;
      }

      if (statusFilter === 'enrolled') {
        return item.enroll_status !== 2;
      }
      if (statusFilter === 'waitlist') {
        if (item.enroll_status !== 2) {
          return false;
        }
      }

      if (statusFilter === 'enrolled' && item.enroll_status === 2) {
        return false;
      }

      if (paymentFilter === 'paid' && item.payment_status !== 2) {
        return false;
      }
      if (paymentFilter === 'pending' && !(
        selectedActivity?.require_payment === 1
        && item.payment_status !== 2
        && item.enroll_status !== 2
      )) {
        return false;
      }
      if (paymentFilter === 'waitlist_pending' && !(
        selectedActivity?.require_payment === 1
        && item.enroll_status === 2
        && item.payment_status !== 2
      )) {
        return false;
      }
      if (paymentFilter === 'no_payment' && selectedActivity?.require_payment === 1) {
        return false;
      }

      return true;
    });
  }, [keyword, participants, paymentFilter, selectedActivity?.require_payment, statusFilter]);

  const paymentNotice = selectedActivity?.require_payment === 1
    ? `当前活动为付费活动，已支付 ${paymentSummary.paidCount} 人，待处理 ${paymentSummary.pendingPaymentCount + paymentSummary.unpaidWaitlistCount} 人。`
    : '当前活动无需支付，可直接关注报名、候补与签到执行。';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">报名与签到</h1>
          <p className="mt-2 text-sm text-slate-600">
            将报名名单、候补视图和签到记录从活动详情里提炼为独立运营页面。
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={refreshPage}>
            <RefreshCw className="h-4 w-4" />
            刷新
          </Button>
          <Button asChild>
            <Link to="/signin">前往签到工具</Link>
          </Button>
        </div>
      </div>

      <Card className="bg-white/90">
        <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle className="text-xl">活动筛选</CardTitle>
            <p className="mt-1 text-sm text-slate-500">先按活动查看报名、候补和签到，后续再继续补导出和支付联动。</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-1">
              <label className="mb-1 block text-sm text-slate-600">活动</label>
              <select
                value={selectedActivityId}
                onChange={(event) => setSelectedActivityId(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">请选择活动</option>
                {activities.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activity.activity_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-1">
              <label className="mb-1 block text-sm text-slate-600">报名状态</label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">全部名单</option>
                <option value="enrolled">已报名</option>
                <option value="waitlist">候补</option>
              </select>
            </div>
            <div className="sm:col-span-1">
              <label className="mb-1 block text-sm text-slate-600">支付状态</label>
              <select
                value={paymentFilter}
                onChange={(event) => setPaymentFilter(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">全部支付状态</option>
                <option value="paid">已支付</option>
                <option value="pending">待处理支付</option>
                <option value="waitlist_pending">候补待处理</option>
                <option value="no_payment">无需支付</option>
              </select>
            </div>
            <div className="sm:col-span-1">
              <label className="mb-1 block text-sm text-slate-600">搜索</label>
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="姓名 / 手机号 / 证件号"
              />
            </div>
          </div>
        </CardHeader>
      </Card>

      {error ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 text-sm text-red-700">{error}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card><CardContent className="p-6"><p className="text-sm text-slate-500">已报名</p><p className="mt-3 text-3xl font-semibold">{loading ? '--' : enrollmentInfo?.enrolled_count ?? paymentSummary.enrolledCount}</p></CardContent></Card>
        <Card><CardContent className="p-6"><p className="text-sm text-slate-500">候补</p><p className="mt-3 text-3xl font-semibold">{loading ? '--' : enrollmentInfo?.waitlist_count ?? paymentSummary.waitlistCount}</p></CardContent></Card>
        <Card><CardContent className="p-6"><p className="text-sm text-slate-500">{selectedActivity?.require_payment === 1 ? '已支付' : '无需支付'}</p><p className="mt-3 text-3xl font-semibold">{loading ? '--' : (selectedActivity?.require_payment === 1 ? paymentSummary.paidCount : participants.length)}</p></CardContent></Card>
        <Card><CardContent className="p-6"><p className="text-sm text-slate-500">{selectedActivity?.require_payment === 1 ? '待处理支付' : '签到记录'}</p><p className="mt-3 text-3xl font-semibold">{loading ? '--' : (selectedActivity?.require_payment === 1 ? paymentSummary.pendingPaymentCount + paymentSummary.unpaidWaitlistCount : checkins.length)}</p></CardContent></Card>
        <Card><CardContent className="p-6"><p className="text-sm text-slate-500">{selectedActivity?.require_payment === 1 ? '实收金额' : '剩余名额'}</p><p className="mt-3 text-3xl font-semibold">{loading ? '--' : (selectedActivity?.require_payment === 1 ? formatCurrency(paymentSummary.paidAmount) : (enrollmentInfo?.remaining_quota ?? '不限'))}</p></CardContent></Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="text-xl">报名名单</CardTitle>
            <p className="text-sm text-slate-500">
              {selectedActivity ? `${selectedActivity.activity_name} · ${selectedActivity.activity_type_name || '未分类'}` : '请选择活动'}
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>姓名</TableHead>
                  <TableHead>手机号</TableHead>
                  <TableHead>报名状态</TableHead>
                  <TableHead>支付状态</TableHead>
                  <TableHead>支付金额</TableHead>
                  <TableHead>报名时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-slate-500">报名名单加载中...</TableCell>
                  </TableRow>
                ) : filteredParticipants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-slate-500">当前条件下暂无报名记录</TableCell>
                  </TableRow>
                ) : (
                  filteredParticipants.map((participant) => (
                    <TableRow key={participant.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-900">{participant.participant_name}</p>
                          {participant.identity_number ? (
                            <p className="mt-1 text-xs text-slate-500">{participant.identity_number}</p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{participant.phone}</TableCell>
                      <TableCell>
                        {participant.enroll_status === 2 ? (
                          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700">候补</span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700">已报名</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const paymentMeta = getParticipantPaymentStatusMeta(selectedActivity?.require_payment, participant);
                          const toneClassName = paymentMeta.tone === 'emerald'
                            ? 'bg-emerald-50 text-emerald-700'
                            : paymentMeta.tone === 'amber'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-slate-100 text-slate-700';

                          return (
                            <span className={`rounded-full px-3 py-1 text-xs ${toneClassName}`}>
                              {paymentMeta.label}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell>{formatCurrency(participant.paid_amount)}</TableCell>
                      <TableCell>{formatDateTime(participant.create_time)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="bg-white/90">
            <CardHeader>
              <CardTitle className="text-xl">签到记录</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <p className="text-sm text-slate-500">签到记录加载中...</p>
              ) : checkins.length === 0 ? (
                <p className="text-sm text-slate-500">当前活动暂无签到记录</p>
              ) : (
                checkins.slice(0, 8).map((record) => (
                  <div key={record.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-slate-900">{record.name}</p>
                        <p className="mt-1 text-sm text-slate-500">{record.phone || record.identity_number || '未留联系方式'}</p>
                      </div>
                      <span className="text-xs text-slate-400">{formatDateTime(record.checkin_time)}</span>
                    </div>
                    {record.note ? <p className="mt-3 text-sm text-slate-600">{record.note}</p> : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="bg-white/90">
            <CardHeader>
              <CardTitle className="text-xl">当前活动提示</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-2xl bg-slate-100 p-4 text-slate-700">
                <Users className="mb-2 h-4 w-4 text-slate-500" />
                {selectedActivity ? `${selectedActivity.activity_name} 将作为当前报名与签到的主视图。` : '请选择要查看的活动。'}
              </div>
              <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-800">
                <CheckCircle2 className="mb-2 h-4 w-4" />
                已签到 {checkins.length} 人，可继续结合签到工具做现场核销。
              </div>
              <div className="rounded-2xl bg-amber-50 p-4 text-amber-800">
                <CreditCard className="mb-2 h-4 w-4" />
                {paymentNotice}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default EnrollmentsPage;
