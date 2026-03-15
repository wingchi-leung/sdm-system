const api = require('../../utils/api');
const auth = require('../../utils/auth');

Page({
  data: {
    users: [],
    loading: true,
    total: 0,
    skip: 0,
    limit: 20,
    keyword: '',
    hasMore: true,
  },

  onLoad() {
    // 检查是否为超级管理员
    if (!auth.isSuperAdmin()) {
      wx.showToast({ title: '仅超级管理员可访问', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    this.loadUsers();
  },

  async loadUsers(append = false) {
    if (this.data.loading && append) return;

    this.setData({ loading: true });

    try {
      const { skip, limit, keyword } = append ? this.data : { skip: 0, limit: this.data.limit, keyword: this.data.keyword };
      const result = await api.getAllUsersForAdmin({
        skip: append ? this.data.users.length : 0,
        limit,
        keyword: keyword || undefined,
      });

      const users = append ? [...this.data.users, ...result.items] : result.items;
      const hasMore = users.length < result.total;

      this.setData({
        users,
        total: result.total,
        skip: result.skip,
        hasMore,
        loading: false,
      });
    } catch (err) {
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearch() {
    this.loadUsers(false);
  },

  onClearSearch() {
    this.setData({ keyword: '' });
    this.loadUsers(false);
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadUsers(true);
    }
  },

  onPullDownRefresh() {
    this.loadUsers(false).then(() => {
      wx.stopPullDownRefresh();
    });
  },

  formatTime(timeStr) {
    if (!timeStr) return '-';
    return timeStr.replace('T', ' ').substring(0, 16);
  },

  getSexText(sex) {
    if (sex === 'M' || sex === 'male') return '男';
    if (sex === 'F' || sex === 'female') return '女';
    return sex || '-';
  },

  getStatusText(isblock) {
    return isblock === 1 ? '已拉黑' : '正常';
  },
});