const api = require('../../utils/api');
const tenant = require('../../utils/tenant');
const {
  buildPendingOrderStorageKey,
  buildOrderHistoryStorageKey,
  normalizeOrderRecord,
  upsertOrderRecord,
  formatOrderList,
} = require('../../utils/payment-order');

Page({
  data: {
    loading: true,
    error: null,
    orders: [],
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
  },

  onShow() {
    this.loadOrders();
  },

  async loadOrders() {
    this.setData({ loading: true, error: null });
    try {
      const tenantCode = tenant.getTenantCode();
      const historyKey = buildOrderHistoryStorageKey(tenantCode);
      const pendingKey = buildPendingOrderStorageKey(tenantCode);
      let records = wx.getStorageSync(historyKey) || [];
      const pendingOrder = wx.getStorageSync(pendingKey);

      if (pendingOrder && pendingOrder.orderNo) {
        records = upsertOrderRecord(records, {
          order_no: pendingOrder.orderNo,
          activity_id: pendingOrder.activityId,
          activity_name: pendingOrder.activityName || '待支付活动',
          actual_fee: pendingOrder.actualFee || 0,
          status: 0,
          create_time: pendingOrder.createTime || '',
          update_time: pendingOrder.updateTime || '',
        });
      }

      const refreshedRecords = await this.refreshPendingOrders(records);
      wx.setStorageSync(historyKey, refreshedRecords);

      this.setData({
        orders: formatOrderList(refreshedRecords),
        loading: false,
      });
    } catch (err) {
      this.setData({
        loading: false,
        orders: [],
        error: err && err.message ? err.message : '加载订单失败',
      });
    }
  },

  async refreshPendingOrders(records) {
    let nextRecords = Array.isArray(records) ? records.slice() : [];
    const pendingOrders = nextRecords.filter((item) => normalizeOrderRecord(item).status === 0);

    for (const item of pendingOrders) {
      if (!item.order_no) continue;
      try {
        const detail = await api.queryPaymentOrder(item.order_no);
        nextRecords = upsertOrderRecord(nextRecords, {
          ...item,
          status: typeof detail.status === 'number' ? detail.status : 0,
          actual_fee: detail.actual_fee != null ? detail.actual_fee : item.actual_fee,
          update_time: detail.update_time || new Date().toISOString(),
        });
      } catch (_) {
        // 单条订单刷新失败时保留原状态，避免阻断整个页面
      }
    }

    return nextRecords;
  },
});
