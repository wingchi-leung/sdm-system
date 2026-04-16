const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');

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

  onLoad(options) {
    tenant.applyPageOptions(options);
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

  /**
   * 拉黑用户
   */
  onBlockUser(e) {
    const user = e.currentTarget.dataset.user;
    if (!user) return;

    wx.showModal({
      title: '拉黑用户',
      content: `确定要拉黑用户 "${user.name || user.phone || '该用户'}" 吗？`,
      editable: true,
      placeholderText: '请输入拉黑原因（可选）',
      success: (res) => {
        if (res.confirm) {
          const reason = res.content || null;
          this.doBlockUser(user.id, reason);
        }
      },
    });
  },

  async doBlockUser(userId, reason) {
    try {
      wx.showLoading({ title: '处理中...', mask: true });
      await api.blockUser(userId, reason);
      wx.hideLoading();
      wx.showToast({ title: '已拉黑', icon: 'success' });
      // 刷新列表
      this.loadUsers(false);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    }
  },

  /**
   * 解除拉黑用户
   */
  onUnblockUser(e) {
    const user = e.currentTarget.dataset.user;
    if (!user) return;

    wx.showModal({
      title: '解除拉黑',
      content: `确定要解除拉黑用户 "${user.name || user.phone || '该用户'}" 吗？`,
      success: (res) => {
        if (res.confirm) {
          this.doUnblockUser(user.id);
        }
      },
    });
  },

  async doUnblockUser(userId) {
    try {
      wx.showLoading({ title: '处理中...', mask: true });
      await api.unblockUser(userId);
      wx.hideLoading();
      wx.showToast({ title: '已解除拉黑', icon: 'success' });
      // 刷新列表
      this.loadUsers(false);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    }
  },
});
