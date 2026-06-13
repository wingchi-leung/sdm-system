const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');
const { resolveAvatarDisplayUrl, getDefaultAvatarPath } = require('../../utils/avatar');

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

function formatSex(value) {
  if (value === 'M' || value === 'male') return '男';
  if (value === 'F' || value === 'female') return '女';
  return value || '-';
}

function getInitial(value) {
  const text = String(value || '').trim();
  if (!text) return '用';
  return text.slice(0, 1);
}

Page({
  data: {
    userId: null,
    user: null,
    loading: true,
    error: null,
    statusBarHeight: 0,
    actionLoading: false,
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    const userId = Number(options.id || 0);
    if (!userId) {
      this.setData({
        loading: false,
        error: '缺少用户参数',
      });
      return;
    }

    let statusBarHeight = 0;
    try {
      const systemInfo = typeof wx.getSystemInfoSync === 'function' ? wx.getSystemInfoSync() : null;
      statusBarHeight = Number(systemInfo && systemInfo.statusBarHeight) || 0;
    } catch (error) {
      statusBarHeight = 0;
    }

    this.setData({
      userId,
      statusBarHeight,
    });
    if (!auth.hasAdminPermission('user.view')) {
      this.setData({
        loading: false,
        error: '当前账号无用户查看权限',
      });
      wx.showToast({ title: '当前账号无用户查看权限', icon: 'none' });
      return;
    }
    this.loadUser();
  },

  onShow() {
    if (!this.data.userId || this.data.loading) return;
    if (!auth.hasAdminPermission('user.view')) return;
    this.loadUser();
  },

  onPullDownRefresh() {
    this.loadUser().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  onBack() {
    wx.navigateBack();
  },

  normalizeUser(user) {
    const name = String(user && user.name ? user.name : '').trim();
    const phone = String(user && user.phone ? user.phone : '').trim();
    const email = String(user && user.email ? user.email : '').trim();
    const displayName = name || phone || email || `用户 #${user.id}`;
    const isBlocked = Number(user && user.isblock) === 1;

    return {
      ...user,
      displayName,
      shortName: getInitial(displayName),
      avatarDisplayUrl: user && user.avatarDisplayUrl ? user.avatarDisplayUrl : getDefaultAvatarPath(),
      phoneText: phone || '-',
      emailText: email || '-',
      statusText: isBlocked ? '已拉黑' : '正常',
      statusClass: isBlocked ? 'is-blocked' : 'is-normal',
      sexText: formatSex(user && user.sex),
      ageText: user && user.age != null ? String(user.age) : '-',
      occupationText: user && user.occupation ? user.occupation : '-',
      industryText: user && user.industry ? user.industry : '-',
      createTimeText: formatDateTime(user && user.create_time),
      updateTimeText: formatDateTime(user && user.update_time),
      blockReasonText: user && user.block_reason ? user.block_reason : '未填写',
      identityNumberText: user && user.identity_number ? String(user.identity_number) : '未填写',
      identityTypeText: user && user.identity_type ? String(user.identity_type) : '未填写',
      isBlocked,
    };
  },

  async resolveAvatar(avatarUrl) {
    try {
      return await resolveAvatarDisplayUrl(avatarUrl);
    } catch (_) {
      return getDefaultAvatarPath();
    }
  },

  buildInfoRows(user) {
    return [
      { label: '手机号', value: user.phoneText },
      { label: '邮箱', value: user.emailText },
      { label: '性别', value: user.sexText },
      { label: '年龄', value: user.ageText },
    ];
  },

  buildProfileRows(user) {
    return [
      { label: '职业', value: user.occupationText },
      { label: '行业', value: user.industryText },
      { label: '证件类型', value: user.identityTypeText },
      { label: '证件号码', value: user.identityNumberText },
    ];
  },

  buildAuditRows(user) {
    return [
      { label: '注册时间', value: user.createTimeText },
      { label: '更新时间', value: user.updateTimeText },
      { label: '账号状态', value: user.statusText },
      { label: '拉黑原因', value: user.blockReasonText },
    ];
  },

  async loadUser() {
    const userId = this.data.userId;
    if (!userId) return Promise.resolve();

    this.setData({ loading: true, error: null });
    try {
      const user = await api.getUserDetail(userId);
      const normalized = this.normalizeUser({
        ...user,
        avatarDisplayUrl: await this.resolveAvatar(user.avatar_url),
      });
      this.setData({
        user: {
          ...normalized,
          infoRows: this.buildInfoRows(normalized),
          profileRows: this.buildProfileRows(normalized),
          auditRows: this.buildAuditRows(normalized),
        },
        loading: false,
        error: null,
      });
    } catch (err) {
      const message = err && err.message ? err.message : '加载失败';
      this.setData({
        loading: false,
        error: message,
      });
      wx.showToast({ title: message, icon: 'none' });
    }
    return Promise.resolve();
  },

  onMore() {
    const user = this.data.user;
    if (!user) return;

    const actions = [];
    if (user.phoneText && user.phoneText !== '-') {
      actions.push({ label: '复制手机号', type: 'copy_phone' });
    }
    if (user.emailText && user.emailText !== '-') {
      actions.push({ label: '复制邮箱', type: 'copy_email' });
    }
    actions.push({ label: user.isBlocked ? '解除拉黑' : '拉黑用户', type: user.isBlocked ? 'unblock' : 'block' });

    wx.showActionSheet({
      itemList: actions.map((item) => item.label),
      success: (res) => {
        const action = actions[res.tapIndex];
        if (!action) return;

        if (action.type === 'copy_phone') {
          wx.setClipboardData({
            data: user.phoneText || '',
            success: () => wx.showToast({ title: '手机号已复制', icon: 'none' }),
          });
          return;
        }
        if (action.type === 'copy_email') {
          wx.setClipboardData({
            data: user.emailText || '',
            success: () => wx.showToast({ title: '邮箱已复制', icon: 'none' }),
          });
          return;
        }
        if (action.type === 'block') {
          this.toggleBlockStatus(true);
        } else if (action.type === 'unblock') {
          this.toggleBlockStatus(false);
        }
      },
    });
  },

  toggleBlockStatus(input) {
    const user = this.data.user;
    if (!user || !user.id) return;
    const shouldBlock = typeof input === 'boolean'
      ? input
      : String(input && input.currentTarget && input.currentTarget.dataset && input.currentTarget.dataset.shouldBlock) === 'true';

    if (shouldBlock && user.isBlocked) {
      wx.showToast({ title: '当前已是拉黑状态', icon: 'none' });
      return;
    }
    if (!shouldBlock && !user.isBlocked) {
      wx.showToast({ title: '当前已是正常状态', icon: 'none' });
      return;
    }

    const title = shouldBlock ? '拉黑用户' : '解除拉黑';
    const content = shouldBlock
      ? `确定要拉黑用户「${user.displayName}」吗？`
      : `确定要解除拉黑用户「${user.displayName}」吗？`;

    wx.showModal({
      title,
      content,
      editable: shouldBlock,
      placeholderText: shouldBlock ? '请输入拉黑原因（可选）' : '',
      success: async (res) => {
        if (!res.confirm) return;
        this.setData({ actionLoading: true });
        try {
          wx.showLoading({ title: '处理中…', mask: true });
          if (shouldBlock) {
            await api.blockUser(user.id, res.content || null);
          } else {
            await api.unblockUser(user.id);
          }
          wx.hideLoading();
          wx.showToast({ title: shouldBlock ? '已拉黑' : '已解除拉黑', icon: 'success' });
          await this.loadUser();
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: err.message || '操作失败', icon: 'none' });
        } finally {
          this.setData({ actionLoading: false });
        }
      },
    });
  },
});
