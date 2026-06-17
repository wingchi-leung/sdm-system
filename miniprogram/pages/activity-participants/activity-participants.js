const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');

function getRefundStatusText(status) {
  if (status === 1) return '待退款';
  if (status === 2) return '退款处理中';
  if (status === 3) return '退款成功';
  if (status === 4) return '退款失败';
  if (status === 5) return '退款关闭';
  return '无退款';
}

function getRefundStatusClass(status) {
  if (status === 1) return 'is-pending';
  if (status === 2) return 'is-processing';
  if (status === 3) return 'is-success';
  if (status === 4) return 'is-failed';
  if (status === 5) return 'is-closed';
  return 'is-none';
}

function resolveRefundReason(participant) {
  const reason = participant && participant.review_reason ? String(participant.review_reason).trim() : '';
  return reason || '审核拒绝退款';
}

function canRefundParticipant(participant) {
  if (!participant) return false;
  const paymentStatus = Number(participant.payment_status || 0);
  const reviewStatus = Number(participant.review_status || 0);
  const refundStatus = Number(participant.refund_status || 0);
  const hasOrderNo = !!String(participant.payment_order_no || '').trim();
  if (paymentStatus !== 2 || !hasOrderNo) return false;
  if (refundStatus === 2 || refundStatus === 3 || refundStatus === 5) return false;
  return reviewStatus === 2 || refundStatus === 1 || refundStatus === 4 || refundStatus === 0;
}

function getRefundActionText(participant) {
  const refundStatus = Number(participant && participant.refund_status ? participant.refund_status : 0);
  if (refundStatus === 4) return '重试退款';
  if (refundStatus === 2) return '退款处理中';
  if (refundStatus === 3) return '已退款';
  if (refundStatus === 5) return '退款已关闭';
  return '执行退款';
}

Page({
  data: {
    activityId: null,
    participants: [],
    total: 0,
    currentPage: 0,
    pageSize: 10,
    totalPages: 1,
    loading: true,
    isAdmin: false,
    refundingParticipantId: null,
  },

  resetSensitiveData() {
    this.setData({
      participants: [],
      total: 0,
      currentPage: 0,
      totalPages: 1,
      loading: false,
      isAdmin: false,
      refundingParticipantId: null,
    });
  },

  ensureAdminAccess() {
    if (auth.isAdmin()) {
      this.setData({ isAdmin: true });
      return true;
    }
    this.resetSensitiveData();
    wx.showToast({ title: '请先使用管理员账号登录', icon: 'none' });
    setTimeout(() => wx.navigateBack(), 1500);
    return false;
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    if (!this.ensureAdminAccess()) return;
    if (options.id) {
      this.setData({ activityId: options.id });
      this._skipNextShow = true;
      this.loadParticipants();
    }
  },

  onShow() {
    if (this._skipNextShow) {
      this._skipNextShow = false;
      return;
    }
    if (!this.data.activityId) return;
    if (!this.ensureAdminAccess()) return;
    this.loadParticipants();
  },

  async loadParticipants() {
    const { activityId, currentPage, pageSize } = this.data;
    this.setData({ loading: true });

    try {
      const result = await api.getActivityParticipants(activityId, currentPage * pageSize, pageSize);
      const total = result.total || 0;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const participants = (result.items || []).map((item) => {
        const refundStatus = Number(item.refund_status || 0);
        return {
          ...item,
          refund_status_text: getRefundStatusText(refundStatus),
          refund_status_class: getRefundStatusClass(refundStatus),
          refund_action_text: getRefundActionText(item),
          can_refund: canRefundParticipant(item),
          refund_reason_text: item.refund_fail_reason || item.review_reason || '',
        };
      });
      this.setData({
        participants: participants,
        total: total,
        totalPages: totalPages,
        loading: false,
        refundingParticipantId: null,
      });
    } catch (err) {
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      this.setData({ loading: false, refundingParticipantId: null });
    }
  },

  onPrevPage() {
    if (this.data.currentPage > 0) {
      this.setData({ currentPage: this.data.currentPage - 1 });
      this.loadParticipants();
    }
  },

  onNextPage() {
    const { currentPage, pageSize, total } = this.data;
    const totalPages = Math.ceil(total / pageSize);
    if (currentPage < totalPages - 1) {
      this.setData({ currentPage: currentPage + 1 });
      this.loadParticipants();
    }
  },

  formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  },

  async onRefund(e) {
    const participantId = Number(e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id);
    if (!participantId) return;
    const participant = this.data.participants.find((item) => Number(item.id) === participantId);
    if (!participant) {
      wx.showToast({ title: '找不到报名记录', icon: 'none' });
      return;
    }
    if (!participant.can_refund) {
      wx.showToast({ title: '当前状态不能退款', icon: 'none' });
      return;
    }
    if (this.data.refundingParticipantId) {
      return;
    }

    const reason = resolveRefundReason(participant);
    const orderNo = String(participant.payment_order_no || '').trim();
    const content = `将对 ${participant.participant_name} 的订单发起全额退款，理由：${reason}。是否继续？`;

    wx.showModal({
      title: '确认退款',
      content: content,
      confirmText: '确认退款',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return;
        this.setData({ refundingParticipantId: participantId });
        try {
          const idempotencyKey = `refund-${participantId}-${Date.now()}`;
          await api.createPaymentRefund(orderNo, reason, idempotencyKey);
          wx.showToast({ title: '退款已提交', icon: 'success' });
          await this.loadParticipants();
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '退款失败', icon: 'none' });
          this.setData({ refundingParticipantId: null });
        }
      },
      fail: () => {
        this.setData({ refundingParticipantId: null });
      },
    });
  },
});
