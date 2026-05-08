const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');

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
  },

  resetSensitiveData() {
    this.setData({
      participants: [],
      total: 0,
      currentPage: 0,
      totalPages: 1,
      loading: false,
      isAdmin: false,
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
      this.setData({
        participants: result.items || [],
        total: total,
        totalPages: totalPages,
        loading: false,
      });
    } catch (err) {
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      this.setData({ loading: false });
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
});
