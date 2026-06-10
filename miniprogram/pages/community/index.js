const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');

Page({
  data: {
    channels: [],
    loading: false,
    creating: false,
    error: null,
    unreadCount: 0,
    isAdmin: false,
  },

  onShow() {
    this.setData({ isAdmin: auth.isAdmin() });
    this.loadChannels();
    this.loadUnreadCount();
    // 若频道创建页通知了脏标记，刷新列表
    const app = getApp();
    if (app.globalData?.channelListDirty) {
      app.globalData.channelListDirty = false;
      this.loadChannels();
    }
  },

  async loadChannels() {
    this.setData({ loading: true, error: null });
    try {
      const res = await api.getCommunityChannels({ limit: 100 });
      this.setData({ channels: res.items || [], loading: false });
    } catch (err) {
      this.setData({ loading: false, error: err.message || '加载频道失败' });
    }
  },

  async loadUnreadCount() {
    try {
      const res = await api.getCommunityNotificationUnreadCount();
      this.setData({ unreadCount: Number(res.unread_count || 0) });
    } catch (_) {
      this.setData({ unreadCount: 0 });
    }
  },

  onOpenChannel(e) {
    const channel = e.currentTarget.dataset.channel;
    if (!channel || !channel.id) return;
    wx.navigateTo({
      url: tenant.appendTenantToUrl('/pages/community-post-list/community-post-list', {
        channelId: channel.id,
        channelName: channel.name || '',
        channelRole: channel.role || 'member',
      }),
    });
  },

  onOpenNotifications() {
    wx.navigateTo({ url: '/pages/community-notifications/community-notifications' });
  },

  onCreateChannel() {
    if (!this.data.isAdmin) {
      wx.showToast({ title: '仅管理员可创建频道', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/community-channel-create/community-channel-create' });
  },
});
