const api = require('../../utils/api');

function formatNotificationTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${month}月${day}日 ${hour}:${minute}`;
}

function resolveNotificationTypeLabel(item) {
  const type = String(item?.type || '').toLowerCase();
  const action = String(item?.data?.action || '').toLowerCase();
  if (type === 'channel_invite' || action === 'channel_invite') return '频道邀请';
  return '社区消息';
}

function resolveNotificationStatusLabel(item) {
  const type = String(item?.type || '').toLowerCase();
  const action = String(item?.data?.action || '').toLowerCase();
  const status = String(item?.data?.status || '').toLowerCase();
  if (status === 'accepted') return '已接受';
  if (status === 'rejected') return '已拒绝';
  if (type === 'channel_invite' || action === 'channel_invite') return '待处理';
  if (Number(item?.is_read) === 0) return '未读';
  return '已读';
}

Page({
  data: {
    items: [],
    loading: false,
    error: null,
    unreadCount: 0,
  },

  onShow() {
    this.loadNotifications();
  },

  async loadNotifications() {
    this.setData({ loading: true, error: null });
    try {
      const res = await api.getCommunityNotifications({ limit: 100 });
      const items = (res.items || []).map((item) => {
        const data = item.data || {};
        const channelId = Number(data.channel_id || 0);
        const inviteStatus = String(data.status || '').toLowerCase();
        const isInvite = String(item.type || '').toLowerCase() === 'channel_invite' || String(data.action || '').toLowerCase() === 'channel_invite';
        return {
          ...item,
          data,
          is_unread: Number(item.is_read) === 0,
          type_label: resolveNotificationTypeLabel(item),
          status_label: resolveNotificationStatusLabel(item),
          status_class: inviteStatus === 'accepted'
            ? 'success'
            : (inviteStatus === 'rejected'
              ? 'muted'
              : (isInvite ? 'warning' : '')),
          time_display: formatNotificationTime(item.create_time),
          channel_name: data.channel_name || '',
          inviter_name: data.inviter_name || '',
          channel_id: channelId,
          can_respond: isInvite && inviteStatus !== 'accepted' && inviteStatus !== 'rejected' && channelId > 0,
          has_channel: channelId > 0,
        };
      });
      this.setData({
        items,
        unreadCount: items.filter((item) => Number(item.is_read) === 0).length,
        loading: false,
      });
    } catch (err) {
      this.setData({ loading: false, error: err.message || '加载通知失败' });
    }
  },

  async onReadAll() {
    try {
      await api.markCommunityNotificationsReadAll();
      await this.loadNotifications();
      wx.showToast({ title: '已全部标记已读', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    }
  },

  async onOpenNotification(e) {
    const item = e.currentTarget.dataset.item;
    if (!item || !item.id) return;
    try {
      if (Number(item.is_read) === 0) {
        await api.markCommunityNotificationRead(item.id);
      }
    } catch (_) {}

    const channelId = Number(item?.data?.channel_id || 0);
    if (channelId > 0) {
      wx.navigateTo({
        url: `/pages/community-post-list/community-post-list?channelId=${channelId}&channelName=${encodeURIComponent(item?.data?.channel_name || '')}`,
      });
      return;
    }
    await this.loadNotifications();
  },

  async onAccept(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    try {
      await api.acceptCommunityInvite(id);
      wx.showToast({ title: '已接受邀请', icon: 'success' });
      await this.loadNotifications();
    } catch (err) {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    }
  },

  async onReject(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    try {
      await api.rejectCommunityInvite(id);
      wx.showToast({ title: '已拒绝邀请', icon: 'none' });
      await this.loadNotifications();
    } catch (err) {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    }
  },
});
