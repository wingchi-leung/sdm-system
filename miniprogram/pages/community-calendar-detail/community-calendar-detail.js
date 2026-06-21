const api = require('../../utils/api');
const tenant = require('../../utils/tenant');

function decodeDisplayText(value) {
  const text = value == null ? '' : String(value);
  if (!text) return '';
  try {
    return decodeURIComponent(text);
  } catch (_) {
    return text;
  }
}

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}

Page({
  data: {
    channelId: null,
    channelName: '',
    channelRole: 'member',
    eventId: null,
    event: null,
    loading: true,
    error: null,
    canEdit: false,
    canDelete: false,
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    const id = Number(options.id || 0);
    const channelId = Number(options.channelId || 0);
    if (!id || !channelId) {
      this.setData({ loading: false, error: '缺少事件参数' });
      return;
    }
    this.setData({
      channelId,
      channelName: decodeDisplayText(options.channelName),
      channelRole: decodeDisplayText(options.channelRole || 'member'),
      eventId: id,
      canEdit: decodeDisplayText(options.channelRole || 'member') === 'admin',
    });
    this.loadDetail();
  },

  async loadDetail() {
    if (!this.data.eventId) return;
    this.setData({ loading: true, error: null });
    try {
      const data = await api.getCommunityChannelCalendarEventDetail(this.data.channelId, this.data.eventId);
      const info = wx.getStorageSync('userInfo') || {};
      const uid = Number(info.id || info.user_id || 0);
      const canDelete = Boolean(uid && (data.author_user_id === uid || this.data.channelRole === 'admin'));
      this.setData({
        event: {
          ...data,
          start_time_display: formatDateTime(data.start_time),
          end_time_display: formatDateTime(data.end_time),
        },
        loading: false,
        canDelete,
      });
    } catch (err) {
      this.setData({
        loading: false,
        error: err.message || '加载事件失败',
      });
    }
  },

  onEdit() {
    if (!this.data.canEdit) {
      wx.showToast({ title: '仅频道管理员可编辑事件', icon: 'none' });
      return;
    }
    const event = this.data.event;
    if (!event) return;
    wx.navigateTo({
      url: tenant.appendTenantToUrl('/pages/community-calendar-edit/community-calendar-edit', {
        channelId: this.data.channelId,
        channelName: this.data.channelName,
        channelRole: this.data.channelRole,
        id: event.id,
      }),
    });
  },

  onDelete() {
    if (!this.data.canDelete) {
      wx.showToast({ title: '你没有删除该事件的权限', icon: 'none' });
      return;
    }
    const event = this.data.event;
    if (!event) return;
    wx.showModal({
      title: '删除事件',
      content: `确定删除「${event.title}」吗？删除后无法恢复。`,
      confirmText: '删除',
      confirmColor: '#D92D20',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          wx.showLoading({ title: '删除中…', mask: true });
          await api.deleteCommunityChannelCalendarEvent(this.data.channelId, event.id);
          wx.hideLoading();
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => this.onBack(), 600);
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: err.message || '删除失败', icon: 'none' });
        }
      },
    });
  },

  onOpenActivity() {
    if (!this.data.event || !this.data.event.activity_id) return;
    wx.navigateTo({
      url: tenant.appendTenantToUrl('/pages/activity-detail/activity-detail', {
        id: this.data.event.activity_id,
      }),
    });
  },

  onBack() {
    if (typeof wx.navigateBack === 'function') {
      wx.navigateBack({
        fail: () => {
          if (typeof wx.switchTab === 'function') {
            wx.switchTab({ url: '/pages/community/index' });
          }
        },
      });
    }
  },
});
