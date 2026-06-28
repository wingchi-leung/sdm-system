const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');

Page({
  data: {
    activityId: null,
    activityName: '',
    statistics: null,
    loading: true,
  },

  resetSensitiveData() {
    this.setData({
      statistics: null,
      checkinRate: '',
      loading: false,
    });
  },

  ensureAdminAccess() {
    if (!auth.isLoggedIn()) {
      this.resetSensitiveData();
      auth.redirectToLogin('请先使用管理员账号登录');
      return false;
    }
    if (auth.isAdmin()) return true;
    this.resetSensitiveData();
    wx.showToast({ title: '请先使用管理员账号登录', icon: 'none' });
    setTimeout(() => wx.navigateBack(), 1500);
    return false;
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    if (!this.ensureAdminAccess()) return;
    if (options.id) {
      this.setData({
        activityId: options.id,
        activityName: decodeURIComponent(options.name || ''),
      });
      wx.setNavigationBarTitle({ title: `${this.data.activityName} - 报名统计` });
      this._skipNextShow = true;
      this.loadStatistics();
    }
  },

  onShow() {
    if (this._skipNextShow) {
      this._skipNextShow = false;
      return;
    }
    if (!this.data.activityId) return;
    if (!this.ensureAdminAccess()) return;
    this.loadStatistics();
  },

  async loadStatistics() {
    if (!auth.isAdmin()) {
      this.resetSensitiveData();
      return;
    }
    try {
      const statistics = await api.getActivityStatistics(this.data.activityId);
      // 计算签到率
      const checkinRate = statistics.total_participants > 0
        ? (statistics.total_checkins / statistics.total_participants * 100).toFixed(1)
        : '0.0';
      this.setData({
        statistics: statistics,
        checkinRate: checkinRate,
        loading: false,
      });
    } catch (err) {
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  onRefresh() {
    this.setData({ loading: true });
    this.loadStatistics();
  },

  getStatusText(status) {
    const statusMap = { 1: '未开始', 2: '进行中', 3: '已结束' };
    return statusMap[status] || '未知';
  },

  getStatusColor(status) {
    const colorMap = { 1: '#9B9B9B', 2: '#27AE60', 3: '#355CC2' };
    return colorMap[status] || '#6b7280';
  },
});
