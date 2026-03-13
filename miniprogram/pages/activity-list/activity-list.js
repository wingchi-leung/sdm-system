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

  onEditActivity(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/edit-activity/edit-activity?id=${id}` });
  },

  onViewParticipants(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/activity-participants/activity-participants?id=${id}` });
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

  onChangeStatus(e) {
    const { id, status, name } = e.currentTarget.dataset;
    const statusMap = { 1: '未开始', 2: '进行中', 3: '已结束' };
    const statusOptions = [
      { value: 1, label: '未开始' },
      { value: 2, label: '进行中' },
      { value: 3, label: '已结束' },
    ];
    const items = statusOptions.map(s => s.label);

    wx.showActionSheet({
      itemList: items,
      success: async (res) => {
        const newStatus = statusOptions[res.tapIndex].value;
        if (newStatus === status) {
          wx.showToast({ title: '当前已是该状态', icon: 'none' });
          return;
        }
        try {
          await api.updateActivityStatus(id, newStatus);
          wx.showToast({ title: '状态更新成功', icon: 'success' });
          this.loadActivities();
        } catch (err) {
          wx.showToast({ title: err.message || '更新失败', icon: 'none' });
        }
      },
    });
  },

  onViewCheckins(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/activity-checkins/activity-checkins?id=${id}&name=${name}` });
  },

  onViewStatistics(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/activity-statistics/activity-statistics?id=${id}&name=${name}` });
  },

  getStatusText(status) {
    const statusMap = { 1: '未开始', 2: '进行中', 3: '已结束' };
    return statusMap[status] || '未知';
  },

  getStatusColor(status) {
    const colorMap = { 1: '#3b82f6', 2: '#10b981', 3: '#6b7280' };
    return colorMap[status] || '#6b7280';
  },

  formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  },
});