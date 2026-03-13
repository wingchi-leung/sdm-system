const api = require('../../utils/api');
const auth = require('../../utils/auth');

Page({
  data: {
    activityId: null,
    activityName: '',
    checkins: [],
    loading: true,
    isEmpty: false,
  },

  onLoad(options) {
    if (!auth.isAdmin()) {
      wx.showToast({ title: '请先使用管理员账号登录', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    if (options.id) {
      this.setData({
        activityId: options.id,
        activityName: decodeURIComponent(options.name || ''),
      });
      wx.setNavigationBarTitle({ title: `${this.data.activityName} - 签到记录` });
      this.loadCheckins();
    }
  },

  async loadCheckins() {
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
