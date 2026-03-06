const api = require('../../utils/api');
const auth = require('../../utils/auth');

Page({
  data: {
    activityId: null,
    participants: [],
    total: 0,
    currentPage: 0,
    pageSize: 10,
    loading: true,
    isAdmin: false,
  },

  onLoad(options) {
    if (!auth.isAdmin()) {
      wx.showToast({ title: '请先使用管理员账号登录', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    if (options.id) {
      this.setData({ activityId: options.id, isAdmin: auth.isAdmin() });
      this.loadParticipants();
    }
  },

  async loadParticipants() {
    const { activityId, currentPage, pageSize } = this.data;
    this.setData({ loading: true });

    try {
      const result = await api.getActivityParticipants(activityId, currentPage * pageSize, pageSize);
      this.setData({
        participants: result.items || [],
        total: result.total || 0,
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