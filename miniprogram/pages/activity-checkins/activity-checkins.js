const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');

Page({
  data: {
    activityId: null,
    activityName: '',
    checkins: [],
    loading: true,
    isEmpty: false,
  },

  resetSensitiveData() {
    this.setData({
      checkins: [],
      loading: false,
      isEmpty: true,
    });
  },

  ensureAdminAccess() {
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
      wx.setNavigationBarTitle({ title: `${this.data.activityName} - 签到记录` });
      this._skipNextShow = true;
      this.loadCheckins();
    }
  },

  onShow() {
    if (this._skipNextShow) {
      this._skipNextShow = false;
      return;
    }
    if (!this.data.activityId) return;
    if (!this.ensureAdminAccess()) return;
    this.loadCheckins();
  },

  async loadCheckins() {
    if (!auth.isAdmin()) {
      this.resetSensitiveData();
      return;
    }
    try {
      const checkins = await api.getActivityCheckins(this.data.activityId);
      this.setData({
        checkins: checkins || [],
        loading: false,
        isEmpty: !checkins || checkins.length === 0,
      });
    } catch (err) {
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      this.setData({ loading: false, isEmpty: true });
    }
  },

  onRefresh() {
    this.setData({ loading: true });
    this.loadCheckins();
  },

  formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  },
});
