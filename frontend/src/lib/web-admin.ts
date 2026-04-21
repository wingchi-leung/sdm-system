interface ActivityOptionSource {
  id: number;
  activity_name: string;
  activity_type_id?: number | null;
  activity_type_name?: string | null;
  status?: number;
  require_payment?: number;
  create_time?: string;
  start_time?: string;
}

interface UserRoleScopeItem {
  id: number;
  scope_type?: string | null;
  scope_id?: number | null;
}

interface UserSource {
  id: number;
  create_time?: string;
  isblock?: number;
}

interface CheckinSource {
  id: number;
  checkin_time?: string;
}

export interface ParticipantPaymentSource {
  id: number;
  activity_id?: number;
  enroll_status?: number | null;
  payment_status?: number | null;
  paid_amount?: number | null;
}

interface DailyTrendPoint {
  date: string;
  label: string;
  value: number;
}

interface ReportSummary {
  totalActivities: number;
  activeActivities: number;
  paidActivities: number;
  freeActivities: number;
  totalUsers: number;
  blockedUsers: number;
  totalCheckins: number;
  todayUsers: number;
  todayCheckins: number;
  activityStatus: Array<{ label: string; value: number }>;
  userTrend: DailyTrendPoint[];
  checkinTrend: DailyTrendPoint[];
}

interface AdminAssignmentSummary {
  managerCount: number;
  assignmentCount: number;
  globalAssignments: number;
  activityTypeAssignments: number;
  activityAssignments: number;
}

export interface EnrollmentPaymentSummary {
  enrolledCount: number;
  waitlistCount: number;
  paidCount: number;
  pendingPaymentCount: number;
  unpaidWaitlistCount: number;
  paidAmount: number;
}

export interface PaymentStatusMeta {
  label: string;
  tone: 'slate' | 'amber' | 'emerald';
}

export interface ActivityTypeOption {
  id: number;
  name: string;
}

const ACTIVITY_STATUS_LABELS: Record<number, string> = {
  1: '未开始',
  2: '进行中',
  3: '已结束',
};

function isSameDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function formatTrendLabel(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function buildDailyTrend(values: Array<string | undefined>, now: Date, days: number = 7): DailyTrendPoint[] {
  const points = Array.from({ length: days }, (_, index) => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(now.getDate() - (days - index - 1));
    return {
      date: date.toISOString().slice(0, 10),
      label: formatTrendLabel(date),
      value: 0,
    };
  });

  values.forEach((item) => {
    if (!item) {
      return;
    }

    const current = new Date(item);
    if (Number.isNaN(current.getTime())) {
      return;
    }

    const dayKey = new Date(current);
    dayKey.setHours(0, 0, 0, 0);
    const matched = points.find((point) => point.date === dayKey.toISOString().slice(0, 10));
    if (matched) {
      matched.value += 1;
    }
  });

  return points;
}

export function extractActivityTypeOptions(activities: ActivityOptionSource[]): ActivityTypeOption[] {
  const uniqueTypes = new Map<number, string>();

  activities.forEach((activity) => {
    if (!activity.activity_type_id) {
      return;
    }

    const currentName = activity.activity_type_name?.trim();
    uniqueTypes.set(activity.activity_type_id, currentName || `活动类型 #${activity.activity_type_id}`);
  });

  return Array.from(uniqueTypes.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
}

export function getParticipantPaymentStatusMeta(
  requirePayment: number | undefined,
  participant: ParticipantPaymentSource,
): PaymentStatusMeta {
  if (requirePayment !== 1) {
    return { label: '无需支付', tone: 'slate' };
  }

  if (participant.payment_status === 2) {
    return { label: '已支付', tone: 'emerald' };
  }

  if (participant.enroll_status === 2) {
    return { label: '候补待处理', tone: 'amber' };
  }

  if (participant.payment_status === 1) {
    return { label: '待支付', tone: 'amber' };
  }

  return { label: '未完成支付', tone: 'amber' };
}

export function summarizeEnrollmentPayments(
  participants: ParticipantPaymentSource[],
  requirePayment: number | undefined,
): EnrollmentPaymentSummary {
  return participants.reduce<EnrollmentPaymentSummary>((summary, participant) => {
    if (participant.enroll_status === 2) {
      summary.waitlistCount += 1;
    } else {
      summary.enrolledCount += 1;
    }

    if (requirePayment !== 1) {
      return summary;
    }

    if (participant.payment_status === 2) {
      summary.paidCount += 1;
      summary.paidAmount += participant.paid_amount ?? 0;
      return summary;
    }

    if (participant.enroll_status === 2) {
      summary.unpaidWaitlistCount += 1;
      return summary;
    }

    summary.pendingPaymentCount += 1;
    return summary;
  }, {
    enrolledCount: 0,
    waitlistCount: 0,
    paidCount: 0,
    pendingPaymentCount: 0,
    unpaidWaitlistCount: 0,
    paidAmount: 0,
  });
}

export function summarizeAdminAssignments(userRoles: Record<number, UserRoleScopeItem[]>): AdminAssignmentSummary {
  const values = Object.values(userRoles);
  const assignmentCount = values.reduce((total, items) => total + items.length, 0);

  return {
    managerCount: values.filter((items) => items.length > 0).length,
    assignmentCount,
    globalAssignments: values.flat().filter((item) => !item.scope_type).length,
    activityTypeAssignments: values.flat().filter((item) => item.scope_type === 'activity_type').length,
    activityAssignments: values.flat().filter((item) => item.scope_type === 'activity').length,
  };
}

export function summarizeReports(
  activities: ActivityOptionSource[],
  users: UserSource[],
  checkins: CheckinSource[],
  now: Date = new Date(),
): ReportSummary {
  const todayUsers = users.filter((item) => item.create_time && isSameDay(new Date(item.create_time), now)).length;
  const todayCheckins = checkins.filter((item) => item.checkin_time && isSameDay(new Date(item.checkin_time), now)).length;

  const activityStatus = Object.entries(ACTIVITY_STATUS_LABELS).map(([status, label]) => ({
    label,
    value: activities.filter((item) => item.status === Number(status)).length,
  }));

  return {
    totalActivities: activities.length,
    activeActivities: activities.filter((item) => item.status === 2).length,
    paidActivities: activities.filter((item) => item.require_payment === 1).length,
    freeActivities: activities.filter((item) => item.require_payment !== 1).length,
    totalUsers: users.length,
    blockedUsers: users.filter((item) => item.isblock === 1).length,
    totalCheckins: checkins.length,
    todayUsers,
    todayCheckins,
    activityStatus,
    userTrend: buildDailyTrend(users.map((item) => item.create_time), now),
    checkinTrend: buildDailyTrend(checkins.map((item) => item.checkin_time), now),
  };
}
