const api = require('../../utils/api');
const auth = require('../../utils/auth');

Page({
  data: {
    activityId: null,
    activityName: '',
    statistics: null,
    loading: true,
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
      wx.setNavigationBarTitle({ title: `${this.data.activityName} - 报名统计` });
      this.loadStatistics();
    }
  },

  async loadStatistics() {
    try {
      const statistics = await api.getActivityStatistics(this.data.activityId);
      this.setData({
        statistics: statistics,
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
