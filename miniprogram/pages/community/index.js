const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');
const { syncTabBarSelected } = require('../../utils/tab-bar');

const FALLBACK_THEMES = ['theme-ocean', 'theme-mist', 'theme-sand', 'theme-forest'];

function resolveChannelCover(avatarUrl) {
  const text = avatarUrl == null ? '' : String(avatarUrl).trim();
  if (!text) return '/assets/defaultbg.jpg';
  if (/^https?:\/\//i.test(text)) return text;
  return api.getImageUrl(text);
}

Page({
  data: {
    channels: [],
    loading: false,
    error: null,
    unreadCount: 0,
    isAdmin: false,
  },

  onShow() {
    syncTabBarSelected(this);
    this.setData({ isAdmin: auth.isAdmin() });
    this.loadUnreadCount();
    const app = getApp();
    const channelListDirty = Boolean(app.globalData?.channelListDirty);
    if (channelListDirty && app.globalData) {
      app.globalData.channelListDirty = false;
    }
    this.loadChannels({ clearCurrent: channelListDirty });
  },

  async loadChannels({ clearCurrent = false } = {}) {
    this.setData(clearCurrent
      ? { channels: [], loading: true, error: null }
      : { loading: true, error: null });
    try {
      const res = await api.getCommunityChannels({ limit: 100 });
      const channels = (res.items || []).map((item, index) => ({
        ...item,
        cover_url: resolveChannelCover(item.avatar_url),
        cover_theme: FALLBACK_THEMES[index % FALLBACK_THEMES.length],
        short_name: String(item.name || '社区').slice(0, 2),
      }));
      this.setData({ channels, loading: false });
    } catch (err) {
      this.setData({ loading: false, error: err.message || '加载社区失败' });
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

  onManageChannelMembers(e) {
    const channel = e.currentTarget.dataset.channel;
    if (!channel || !channel.id) return;
    if (channel.role !== 'admin') {
      wx.showToast({ title: '仅管理员可管理成员', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: tenant.appendTenantToUrl('/pages/community-channel-manage/community-channel-manage', {
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
      wx.showToast({ title: '仅管理员可创建社区', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/community-channel-create/community-channel-create' });
  },
});
