import {
  extractActivityTypeOptions,
  getParticipantPaymentStatusMeta,
  summarizeEnrollmentPayments,
  summarizeAdminAssignments,
  summarizeReports,
} from './web-admin';

describe('web-admin helpers', () => {
  test('extractActivityTypeOptions 去重并生成活动类型选项', () => {
    expect(extractActivityTypeOptions([
      { id: 1, activity_name: 'A', activity_type_id: 2, activity_type_name: '训练营' },
      { id: 2, activity_name: 'B', activity_type_id: 2, activity_type_name: '训练营' },
      { id: 3, activity_name: 'C', activity_type_id: 1, activity_type_name: '沙龙' },
      { id: 4, activity_name: 'D' },
    ])).toEqual([
      { id: 1, name: '沙龙' },
      { id: 2, name: '训练营' },
    ]);
  });

  test('summarizeAdminAssignments 统计不同 scope 的授权数量', () => {
    expect(summarizeAdminAssignments({
      1: [
        { id: 1, scope_type: null, scope_id: null },
        { id: 2, scope_type: 'activity_type', scope_id: 10 },
      ],
      2: [{ id: 3, scope_type: 'activity', scope_id: 99 }],
      3: [],
    })).toEqual({
      managerCount: 2,
      assignmentCount: 3,
      globalAssignments: 1,
      activityTypeAssignments: 1,
      activityAssignments: 1,
    });
  });

  test('summarizeReports 汇总活动、用户和签到指标与趋势', () => {
    const now = new Date('2026-04-16T10:00:00+08:00');

    const summary = summarizeReports(
      [
        { id: 1, activity_name: '春季营', status: 1, require_payment: 1 },
        { id: 2, activity_name: '读书会', status: 2, require_payment: 0 },
        { id: 3, activity_name: '闭门会', status: 3, require_payment: 1 },
      ],
      [
        { id: 1, create_time: '2026-04-16T08:00:00+08:00', isblock: 0 },
        { id: 2, create_time: '2026-04-14T08:00:00+08:00', isblock: 1 },
      ],
      [
        { id: 1, checkin_time: '2026-04-16T09:00:00+08:00' },
        { id: 2, checkin_time: '2026-04-15T09:00:00+08:00' },
      ],
      now,
    );

    expect(summary.totalActivities).toBe(3);
    expect(summary.activeActivities).toBe(1);
    expect(summary.paidActivities).toBe(2);
    expect(summary.freeActivities).toBe(1);
    expect(summary.totalUsers).toBe(2);
    expect(summary.blockedUsers).toBe(1);
    expect(summary.totalCheckins).toBe(2);
    expect(summary.todayUsers).toBe(1);
    expect(summary.todayCheckins).toBe(1);
    expect(summary.activityStatus).toEqual([
      { label: '未开始', value: 1 },
      { label: '进行中', value: 1 },
      { label: '已结束', value: 1 },
    ]);
    expect(summary.userTrend).toHaveLength(7);
    expect(summary.userTrend[summary.userTrend.length - 1].value).toBe(1);
    expect(summary.checkinTrend[summary.checkinTrend.length - 2].value).toBe(1);
    expect(summary.checkinTrend[summary.checkinTrend.length - 1].value).toBe(1);
  });

  test('getParticipantPaymentStatusMeta 根据活动收费状态和报名状态返回支付标签', () => {
    expect(getParticipantPaymentStatusMeta(0, { id: 1 })).toEqual({
      label: '无需支付',
      tone: 'slate',
    });
    expect(getParticipantPaymentStatusMeta(1, { id: 2, payment_status: 2 })).toEqual({
      label: '已支付',
      tone: 'emerald',
    });
    expect(getParticipantPaymentStatusMeta(1, { id: 3, enroll_status: 2 })).toEqual({
      label: '候补待处理',
      tone: 'amber',
    });
  });

  test('summarizeEnrollmentPayments 汇总报名、候补与支付金额', () => {
    expect(summarizeEnrollmentPayments([
      { id: 1, enroll_status: 1, payment_status: 2, paid_amount: 1999 },
      { id: 2, enroll_status: 1, payment_status: 1, paid_amount: 0 },
      { id: 3, enroll_status: 2, payment_status: 0, paid_amount: 0 },
    ], 1)).toEqual({
      enrolledCount: 2,
      waitlistCount: 1,
      paidCount: 1,
      pendingPaymentCount: 1,
      unpaidWaitlistCount: 1,
      paidAmount: 1999,
    });
  });
});
