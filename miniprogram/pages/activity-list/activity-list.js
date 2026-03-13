const api = require('../../utils/api');
const auth = require('../../utils/auth');

Page({
  data: {
    activities: [],
    loading: true,
    isAdmin: false,
  },

  onLoad() {
    this.setData({ isAdmin: auth.isAdmin() });
    this.loadActivities();
  },

  onShow() {
    this.loadActivities();
  },

  async loadActivities() {
    try {
      const result = await api.getActivities({});
      this.setData({
        activities: result.items || [],
        loading: false,
      });
    } catch (err) {
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  onViewDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/activity-detail/activity-detail?id=${id}` });
  },

  stopPropagation() {
    // 阻止事件冒泡
  },

  onEditActivity(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/edit-activity/edit-activity?id=${id}` });
  },

  onDeleteActivity(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认删除',
      content: `确定要删除活动"${name}"吗？此操作不可撤销。`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await api.deleteActivity(id);
            wx.showToast({ title: '删除成功', icon: 'success' });
            this.loadActivities();
          } catch (err) {
            wx.showToast({ title: err.message || '删除失败', icon: 'none' });
          }
        }
      },
    });
  },
});