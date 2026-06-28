const api = require('../../utils/api');
const tenant = require('../../utils/tenant');
const { resolveAvatarDisplayUrl, getDefaultAvatarPath } = require('../../utils/avatar');

function decodeDisplayText(value) {
  const text = value == null ? '' : String(value);
  if (!text) return '';
  try {
    return decodeURIComponent(text);
  } catch (_) {
    return text;
  }
}

function htmlToText(html) {
  if (!html) return '';
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function normalizeRichTextImageUrls(html) {
  if (!html) return '';
  return String(html).replace(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi, (match, src) => {
    const resolvedSrc = api.getImageUrl(src);
    if (!resolvedSrc || resolvedSrc === src) {
      return match;
    }
    return match.replace(src, resolvedSrc);
  });
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
    announcementId: null,
    announcement: null,
    loading: true,
    error: null,
    canDelete: false,
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    const id = Number(options.id || 0);
    if (!id) {
      this.setData({ loading: false, error: '缺少公告 ID' });
      return;
    }
    this.setData({
      channelId: Number(options.channelId || 0) || null,
      channelName: decodeDisplayText(options.channelName),
      channelRole: decodeDisplayText(options.channelRole || 'member'),
      announcementId: id,
    });
    this.loadDetail();
  },

  async loadDetail() {
    if (!this.data.announcementId) return;
    this.setData({ loading: true, error: null });
    try {
      const data = await api.getCommunityChannelAnnouncementDetail(
        this.data.channelId,
        this.data.announcementId,
      );
      const avatar = await this.resolveAvatar(data.author_avatar_url, data.author_update_time);
      const content = data.content_format === 'html'
        ? normalizeRichTextImageUrls(data.content || '')
        : data.content;
      const announcement = {
        ...data,
        author_avatar_display_url: avatar,
        create_time_display: formatDateTime(data.create_time),
        content,
        plain_text: htmlToText(content || ''),
      };
      this.setData({
        announcement,
        loading: false,
        canDelete: this.computeCanDelete(announcement),
      });
    } catch (err) {
      this.setData({
        loading: false,
        error: err.message || '加载公告失败',
      });
    }
  },

  async resolveAvatar(avatarUrl, cacheVersion) {
    try {
      return await resolveAvatarDisplayUrl(avatarUrl, cacheVersion);
    } catch (_) {
      return getDefaultAvatarPath();
    }
  },

  computeCanDelete(announcement) {
    const info = wx.getStorageSync('userInfo') || {};
    const uid = Number(info.id || info.user_id || 0);
    if (!uid) return false;
    if (announcement.author_user_id === uid) return true;
    if (this.data.channelRole === 'admin') return true;
    return false;
  },

  onDelete() {
    if (!this.data.canDelete) {
      wx.showToast({ title: '你没有删除该公告的权限', icon: 'none' });
      return;
    }
    const ann = this.data.announcement;
    if (!ann) return;
    wx.showModal({
      title: '删除公告',
      content: `确定删除「${ann.title}」吗？删除后无法恢复。`,
      confirmText: '删除',
      confirmColor: '#D92D20',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          wx.showLoading({ title: '删除中…', mask: true });
          await api.deleteCommunityChannelAnnouncement(this.data.channelId, ann.id);
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
