const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');

// AES-GCM 密文经 base64 编码后的特征：仅含字母数字和 +/=_-，长度 >= 20
// 正常的中文姓名、手机号不会匹配此模式
const CIPHER_PATTERN = /^[A-Za-z0-9+/=_-]{20,}$/;

function _looksLikeCipher(text) {
  if (!text) return false;
  return CIPHER_PATTERN.test(text);
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

Page({
  data: {
    users: [],
    loading: true,
    refreshing: false,
    total: 0,
    skip: 0,
    limit: 20,
    keyword: '',
    hasMore: true,
    statusBarHeight: 0,
    emptyTitle: '暂无成员',
    emptyDescription: '还没有可展示的成员数据。',
    error: null,
    inviting: false,
    selectionMode: false,
    pageTitle: '用户管理',
    confirmText: '完成',
    selectionHint: '',
    selectedUserIds: [],
    selectedCount: 0,
  },

  resetSensitiveData() {
    this.setData({
      users: [],
      loading: false,
      refreshing: false,
      total: 0,
      skip: 0,
      hasMore: true,
      emptyTitle: '暂无成员',
      emptyDescription: '还没有可展示的成员数据。',
    });
  },

  isPickerMode() {
    return this.data.selectionMode === true;
  },

  getSelectedUsers() {
    const selectedIds = new Set((this.data.selectedUserIds || []).map((item) => Number(item)));
    return (this.data.users || []).filter((user) => selectedIds.has(Number(user.id)));
  },

  setUserSelection(users) {
    const selectedIds = new Set((this.data.selectedUserIds || []).map((item) => Number(item)));
    return (users || []).map((user) => ({
      ...user,
      isSelected: selectedIds.has(Number(user.id)),
    }));
  },

  updateSelectionCount(selectedIds) {
    this.setData({
      selectedUserIds: selectedIds,
      selectedCount: selectedIds.length,
    });
  },

  ensureUserViewAccess() {
    if (auth.hasAdminPermission('user.view')) return true;
    this.resetSensitiveData();
    wx.showToast({ title: '当前账号无用户查看权限', icon: 'none' });
    setTimeout(() => wx.navigateBack(), 1500);
    return false;
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    if (!this.ensureUserViewAccess()) return;

    const selectionMode = String(options && (options.mode || options.select_mode) || '').toLowerCase() === 'picker';
    const selectedIds = String(options && (options.selected_ids || options.selectedIds) || '')
      .split(/[,\s]+/)
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0)
      .filter((item, index, array) => array.indexOf(item) === index);

    let statusBarHeight = 0;
    try {
      const systemInfo = typeof wx.getSystemInfoSync === 'function' ? wx.getSystemInfoSync() : null;
      statusBarHeight = Number(systemInfo && systemInfo.statusBarHeight) || 0;
    } catch (error) {
      statusBarHeight = 0;
    }

    this.setData({
      statusBarHeight,
      selectionMode,
      pageTitle: selectionMode ? (options.title || '选择成员') : '用户管理',
      confirmText: selectionMode ? (options.confirm_text || '确认选择') : '完成',
      selectionHint: selectionMode ? (options.hint || '请选择要邀请到频道的用户。') : '',
      selectedUserIds: selectedIds,
      selectedCount: selectedIds.length,
    });
    this.eventChannel = typeof this.getOpenerEventChannel === 'function'
      ? this.getOpenerEventChannel()
      : null;
    this._skipNextShow = true;
    this.loadUsers(false);
  },

  onShow() {
    if (this._skipNextShow) {
      this._skipNextShow = false;
      return;
    }
    if (!this.ensureUserViewAccess()) return;
    this.loadUsers(false);
  },

  onBack() {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.switchTab({ url: '/pages/mine/mine' });
  },

  onPageMenu() {
    wx.showActionSheet({
      itemList: ['刷新列表', '清空搜索'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.loadUsers(false);
          return;
        }
        if (res.tapIndex === 1) {
          this.onClearSearch();
        }
      },
    });
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearch() {
    this.loadUsers(false);
  },

  onClearSearch() {
    if (!this.data.keyword) return;
    this.setData({ keyword: '' });
    this.loadUsers(false);
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadUsers(true);
    }
  },

  onPullDownRefresh() {
    this.loadUsers(false).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  normalizeUserItem(item) {
    const rawName = String(item && item.name ? item.name : '').trim();
    const rawPhone = String(item && item.phone ? item.phone : '').trim();
    const rawEmail = String(item && item.email ? item.email : '').trim();
    // 过滤可能的密文字符串（base64 编码），解密失败时后端可能返回 None，
    // 但防御性过滤以防万一
    const name = _looksLikeCipher(rawName) ? '' : rawName;
    const phone = _looksLikeCipher(rawPhone) ? '' : rawPhone;
    const email = _looksLikeCipher(rawEmail) ? '' : rawEmail;
    const displayName = name || phone || email || `用户 #${item.id}`;
    const contactText = phone || email || '未填写联系方式';
    const isBlocked = Number(item && item.isblock) === 1;

    return {
      ...item,
      displayName,
      contactText,
      badgeText: isBlocked ? '黑名单' : '成员',
      badgeClass: isBlocked ? 'is-blocked' : '',
      statusText: isBlocked ? '已拉黑' : '正常',
      createdAtText: formatDateTime(item && item.create_time),
      normalizedContact: phone || email || '',
      isBlocked,
    };
  },

  buildUserMenuItems(user) {
    const items = ['查看详情'];
    if (user && user.normalizedContact) {
      items.push('复制联系方式');
    }
    items.push(user && user.isBlocked ? '解除拉黑' : '拉黑用户');
    return items;
  },

  resolveUserMenuAction(user, tapIndex) {
    let cursor = 0;
    if (tapIndex === cursor) return 'detail';
    cursor += 1;
    if (user && user.normalizedContact) {
      if (tapIndex === cursor) return 'copy';
      cursor += 1;
    }
    if (tapIndex === cursor) return user && user.isBlocked ? 'unblock' : 'block';
    return null;
  },

  showUserDetail(user) {
    if (!user) return;
    if (this.isPickerMode()) return;
    wx.navigateTo({
      url: tenant.appendTenantToUrl('/pages/user-detail/user-detail', {
        id: user.id,
      }),
    });
  },

  onUserTap(e) {
    const user = e.currentTarget.dataset.user;
    if (this.isPickerMode()) {
      this.toggleUserSelection(user);
      return;
    }
    this.showUserDetail(user);
  },

  onUserMore(e) {
    const user = e.currentTarget.dataset.user;
    if (!user) return;
    if (this.isPickerMode()) return;

    const itemList = this.buildUserMenuItems(user);
    wx.showActionSheet({
      itemList,
      success: (res) => {
        const action = this.resolveUserMenuAction(user, res.tapIndex);
        if (action === 'detail') {
          this.showUserDetail(user);
          return;
        }
        if (action === 'copy') {
          wx.setClipboardData({
            data: user.normalizedContact,
            success: () => wx.showToast({ title: '联系方式已复制', icon: 'none' }),
          });
          return;
        }
        if (action === 'block') {
          this.onBlockUser({ currentTarget: { dataset: { user } } });
          return;
        }
        if (action === 'unblock') {
          this.onUnblockUser({ currentTarget: { dataset: { user } } });
        }
      },
    });
  },

  async loadUsers(append = false) {
    if (!auth.hasAdminPermission('user.view')) {
      this.resetSensitiveData();
      return Promise.resolve();
    }
    if (this.data.loading && append) return Promise.resolve();

    if (append) {
      this.setData({ refreshing: true });
    } else {
      this.setData({
        loading: true,
        refreshing: false,
        error: null,
      });
    }

    try {
      const keyword = String(this.data.keyword || '').trim();
      const result = await api.getAllUsersForAdmin({
        skip: append ? this.data.users.length : 0,
        limit: this.data.limit,
        keyword: keyword || undefined,
      });

      const incomingUsers = this.setUserSelection((result.items || []).map((item) => this.normalizeUserItem(item)));
      const users = append ? [...this.data.users, ...incomingUsers] : incomingUsers;
      const total = Number(result.total || 0);
      const hasMore = users.length < total;
      const isEmpty = users.length === 0;

      this.setData({
        users,
        total,
        skip: Number(result.skip || 0),
        hasMore,
        loading: false,
        refreshing: false,
        error: null,
        emptyTitle: isEmpty ? (keyword ? '未找到匹配成员' : '暂无成员') : '暂无成员',
        emptyDescription: isEmpty
          ? (keyword ? '换个关键词再试试。' : '还没有可展示的成员数据。')
          : '还没有可展示的成员数据。',
      });
    } catch (err) {
      const message = err && err.message ? err.message : '加载失败';
      this.setData({
        loading: false,
        refreshing: false,
        error: message,
        emptyTitle: '暂时无法查看成员',
        emptyDescription: '请稍后重试。',
      });
      wx.showToast({ title: message, icon: 'none' });
    }
    return Promise.resolve();
  },

  /**
   * 拉黑用户
   */
  onBlockUser(e) {
    const user = e.currentTarget.dataset.user;
    if (!user) return;

    wx.showModal({
      title: '拉黑用户',
      content: `确定要拉黑用户「${user.displayName || user.name || user.phone || '该用户'}」吗？`,
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
      wx.showLoading({ title: '处理中…', mask: true });
      await api.blockUser(userId, reason);
      wx.hideLoading();
      wx.showToast({ title: '已拉黑', icon: 'success' });
      await this.loadUsers(false);
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
      content: `确定要解除拉黑用户「${user.displayName || user.name || user.phone || '该用户'}」吗？`,
      success: (res) => {
        if (res.confirm) {
          this.doUnblockUser(user.id);
        }
      },
    });
  },

  async doUnblockUser(userId) {
    try {
      wx.showLoading({ title: '处理中…', mask: true });
      await api.unblockUser(userId);
      wx.hideLoading();
      wx.showToast({ title: '已解除拉黑', icon: 'success' });
      await this.loadUsers(false);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    }
  },

  onInviteMembers() {
    if (this.isPickerMode()) {
      this.confirmSelection();
      return;
    }
    this.setData({ inviting: true });
    wx.showModal({
      title: '邀请成员',
      content: '当前小程序版本暂未接入邀请入口，请先前往 Web 管理端完成邀请。',
      showCancel: false,
      success: () => {
        this.setData({ inviting: false });
      },
      fail: () => {
        this.setData({ inviting: false });
      },
    });
  },

  toggleUserSelection(user) {
    if (!user || !user.id) return;
    const userId = Number(user.id);
    const selectedIds = new Set((this.data.selectedUserIds || []).map((item) => Number(item)));
    if (selectedIds.has(userId)) {
      selectedIds.delete(userId);
    } else {
      selectedIds.add(userId);
    }
    const nextSelectedIds = Array.from(selectedIds);
    this.updateSelectionCount(nextSelectedIds);
    this.setData({
      users: this.setUserSelection(this.data.users || []),
    });
  },

  confirmSelection() {
    if (!this.isPickerMode()) return;
    const selectedUsers = this.getSelectedUsers();
    if (!selectedUsers.length) {
      wx.showToast({ title: '请先选择成员', icon: 'none' });
      return;
    }
    if (this.eventChannel && typeof this.eventChannel.emit === 'function') {
      this.eventChannel.emit('selected-users', {
        users: selectedUsers,
        user_ids: selectedUsers.map((item) => Number(item.id)),
      });
    }
    wx.navigateBack();
  },
});
