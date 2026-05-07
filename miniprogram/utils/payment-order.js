const PENDING_ORDER_KEY = 'pending_payment_order';
const ORDER_HISTORY_KEY = 'payment_order_history';

function buildPendingOrderStorageKey(tenantCode) {
  return `${PENDING_ORDER_KEY}_${tenantCode || 'default'}`;
}

function buildOrderHistoryStorageKey(tenantCode) {
  return `${ORDER_HISTORY_KEY}_${tenantCode || 'default'}`;
}

function getOrderStatusText(status) {
  if (status === 1) return '支付成功';
  if (status === 2) return '支付失败';
  if (status === 3) return '订单已关闭';
  return '待支付';
}

function getOrderStatusClass(status) {
  if (status === 1) return 'is-success';
  if (status === 2) return 'is-failed';
  if (status === 3) return 'is-closed';
  return 'is-pending';
}

function normalizeOrderRecord(record = {}) {
  const actualFee = Number(record.actual_fee || record.actualFee || 0);
  const createTime = record.create_time || record.createTime || '';
  const updateTime = record.update_time || record.updateTime || createTime;

  return {
    order_no: record.order_no || record.orderNo || '',
    activity_id: record.activity_id || record.activityId || '',
    activity_name: record.activity_name || record.activityName || '活动订单',
    actual_fee: Number.isFinite(actualFee) ? actualFee : 0,
    status: typeof record.status === 'number' ? record.status : 0,
    create_time: createTime,
    update_time: updateTime,
  };
}

function upsertOrderRecord(records = [], nextRecord = {}) {
  const normalized = normalizeOrderRecord(nextRecord);
  if (!normalized.order_no) {
    return Array.isArray(records) ? records.slice() : [];
  }

  const list = Array.isArray(records) ? records.slice() : [];
  const index = list.findIndex((item) => {
    const current = normalizeOrderRecord(item);
    return current.order_no === normalized.order_no;
  });

  if (index >= 0) {
    list[index] = {
      ...normalizeOrderRecord(list[index]),
      ...normalized,
    };
  } else {
    list.unshift(normalized);
  }

  return list.sort((a, b) => {
    const timeA = new Date(a.update_time || a.create_time || 0).getTime();
    const timeB = new Date(b.update_time || b.create_time || 0).getTime();
    return timeB - timeA;
  });
}

function formatOrderList(records = []) {
  return (Array.isArray(records) ? records : []).map((record) => {
    const item = normalizeOrderRecord(record);
    return {
      ...item,
      amount_display: `¥${(item.actual_fee / 100).toFixed(2)}`,
      status_text: getOrderStatusText(item.status),
      status_class: getOrderStatusClass(item.status),
      time_display: item.update_time || item.create_time || '',
    };
  });
}

module.exports = {
  PENDING_ORDER_KEY,
  ORDER_HISTORY_KEY,
  buildPendingOrderStorageKey,
  buildOrderHistoryStorageKey,
  getOrderStatusText,
  getOrderStatusClass,
  normalizeOrderRecord,
  upsertOrderRecord,
  formatOrderList,
};
