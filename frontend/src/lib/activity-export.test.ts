import { buildActivityExportSheetRows, sanitizeSheetName } from './activity-export';

describe('activity-export helpers', () => {
  test('sanitizeSheetName 会移除非法字符并限制长度', () => {
    expect(sanitizeSheetName('活动:上海/杭州*测试?', 2)).toBe('活动 上海 杭州 测试');
    expect(sanitizeSheetName('a'.repeat(40), 1)).toHaveLength(31);
    expect(sanitizeSheetName('', 3)).toBe('活动3');
  });

  test('buildActivityExportSheetRows 会展开报名与支付字段', () => {
    const rows = buildActivityExportSheetRows({
      tenant_id: 1,
      tenant_name: '华东租户',
      tenant_code: 'east',
      activity_id: 12,
      activity_name: '觉察营',
      activity_type_name: '线下课',
      start_time: '2026-05-09T10:00:00+08:00',
      end_time: '2026-05-09T18:00:00+08:00',
      status: 2,
      tag: '高级班',
      suggested_fee: 19900,
      require_payment: 1,
      location: '上海中心',
      max_participants: 60,
      participants: [
        {
          id: 8,
          user_id: 66,
          participant_name: '李四',
          phone: '13800138000',
          identity_type: 'mainland',
          identity_number: '110101199001011234',
          sex: 'F',
          age: 30,
          occupation: '设计师',
          industry: '教育',
          email: 'lisi@example.com',
          enroll_status: 1,
          payment_status: 2,
          payment_order_id: 99,
          payment_suggested_fee: 19900,
          paid_amount: 19900,
          why_join: '提升自己',
          channel: '朋友推荐',
          expectation: '学习方法',
          activity_understanding: '知道活动安排',
          has_questions: '无',
          payment_order_no: 'PO001',
          payment_paid_at: '2026-05-08T10:00:00+08:00',
          create_time: '2026-05-01T10:00:00+08:00',
          update_time: '2026-05-02T10:00:00+08:00',
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      租户名称: '华东租户',
      活动名称: '觉察营',
      报名状态: '已报名',
      支付状态: '已支付',
      支付订单号: 'PO001',
      报名费: '¥199.00',
      姓名: '李四',
      手机号脱敏: '13800138000',
      证件类型: '中国大陆身份证',
    });
  });

  test('buildActivityExportSheetRows 在空报名时保留活动基础信息', () => {
    const rows = buildActivityExportSheetRows({
      tenant_id: 1,
      tenant_name: '默认租户',
      tenant_code: 'default',
      activity_id: 20,
      activity_name: '空活动',
      activity_type_name: null,
      start_time: null,
      end_time: null,
      status: 1,
      tag: null,
      suggested_fee: 0,
      require_payment: 0,
      location: null,
      max_participants: null,
      participants: [],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].活动名称).toBe('空活动');
    expect(rows[0].姓名).toBe('');
    expect(rows[0].活动建议报名费).toBe('免费');
  });
});
