const test = require('node:test');
const assert = require('node:assert/strict');

const { formatParticipantActivities } = require('../utils/mine-data');
const {
  getOrderStatusText,
  buildPendingOrderStorageKey,
  buildOrderHistoryStorageKey,
  upsertOrderRecord,
  removeOrderRecord,
  formatOrderList,
} = require('../utils/payment-order');

test('报名活动列表补充展示字段', () => {
  const items = formatParticipantActivities(
    [
      { id: 1, start_time: '2026-05-07T08:00:00.000Z', enroll_status: 1 },
      { id: 2, start_time: '2026-05-08T08:00:00.000Z', enroll_status: 2 },
      { id: 3, start_time: '2026-05-09T08:00:00.000Z', enroll_status: 1, payment_status: 1 },
    ],
    (value) => `格式化:${value}`
  );

  assert.equal(items[0].start_time_display, '格式化:2026-05-07T08:00:00.000Z');
  assert.equal(items[0].enroll_status_text, '已报名');
  assert.equal(items[0].enroll_status_class, 'is-registered');
  assert.equal(items[1].enroll_status_text, '候补中');
  assert.equal(items[1].enroll_status_class, 'is-waiting');
  assert.equal(items[2].enroll_status_text, '报名处理中');
  assert.equal(items[2].enroll_status_class, 'is-pending');
});

test('订单状态文案映射正确', () => {
  assert.equal(getOrderStatusText(0), '待支付');
  assert.equal(getOrderStatusText(1), '支付成功');
  assert.equal(getOrderStatusText(2), '支付失败');
  assert.equal(getOrderStatusText(3), '订单已关闭');
});

test('订单记录更新时按订单号合并并保留最新状态', () => {
  const records = upsertOrderRecord(
    [
      {
        order_no: 'A001',
        activity_name: '测试活动',
        actual_fee: 1999,
        status: 0,
        update_time: '2026-05-07T08:00:00.000Z',
      },
    ],
    {
      order_no: 'A001',
      activity_name: '测试活动',
      actual_fee: 1999,
      status: 1,
      update_time: '2026-05-07T09:00:00.000Z',
    }
  );

  assert.equal(records.length, 1);
  assert.equal(records[0].status, 1);
});

test('订单记录可按订单号删除', () => {
  const records = removeOrderRecord(
    [
      { order_no: 'A001', status: 0 },
      { order_no: 'A002', status: 1 },
    ],
    'A001'
  );

  assert.equal(records.length, 1);
  assert.equal(records[0].order_no, 'A002');
});

test('订单展示列表补充金额和状态文案', () => {
  const list = formatOrderList([
    {
      order_no: 'A002',
      activity_name: '支付活动',
      actual_fee: 8800,
      status: 1,
      update_time: '2026-05-07T10:00:00.000Z',
    },
  ]);

  assert.equal(list[0].amount_display, '¥88.00');
  assert.equal(list[0].status_text, '支付成功');
  assert.equal(list[0].status_class, 'is-success');
});

test('订单缓存 key 按租户和用户隔离', () => {
  assert.equal(
    buildPendingOrderStorageKey('tenant-a', 101),
    'pending_payment_order_tenant-a_101'
  );
  assert.equal(
    buildOrderHistoryStorageKey('tenant-a', 101),
    'payment_order_history_tenant-a_101'
  );
  assert.notEqual(
    buildOrderHistoryStorageKey('tenant-a', 101),
    buildOrderHistoryStorageKey('tenant-a', 202)
  );
});
