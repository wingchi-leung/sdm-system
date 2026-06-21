const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');
const contentUtils = require('../../utils/community-content');
const { resolveAvatarDisplayUrl, getDefaultAvatarPath } = require('../../utils/avatar');

const PAGE_SIZE = 20;
const PREVIEW_TEXT_LIMIT = 140;
const PREVIEW_IMAGE_LIMIT = 4;

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

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

function formatRelativeTime(iso) {
  if (!iso) return '';
  const target = new Date(iso).getTime();
  if (!target) return '';
  const diff = Math.max(1, Math.floor((Date.now() - target) / 60000));
  if (diff < 60) return `${diff} 分钟前`;
  const hours = Math.floor(diff / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return formatDate(iso);
}

Page({
  data: {
    channelId: null,
    channelName: '',
    channelRole: 'member',
    announcements: [],
    loading: true,
    loadingMore: false,
    error: null,
    total: 0,
    skip: 0,
    hasMore: false,
    showCreateButton: false,
  },

  resolvePermissions() {
    // 频道管理员判定走 channelRole（来自 URL 参数 + 详情回拉），不依赖 RBAC 的 isAdmin
    this.setData({
      showCreateButton: this.data.channelRole === 'admin',
    });
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    const channelId = Number(options.channelId || 0);
    if (!channelId) {
      this.setData({ loading: false, error: '缺少频道参数' });
      return;
    }
    this.setData({
      channelId,
      channelName: decodeDisplayText(options.channelName),
      channelRole: decodeDisplayText(options.channelRole || 'member'),
    });
    this.resolvePermissions();
    this.loadList({ reset: true });
  },

  onShow() {
    // 不强制重拉（用户可能只是看公告详情回来）；如需重拉可在 onShow 检测 dirty 标志
  },

  async loadList({ reset = false } = {}) {
    const nextSkip = reset ? 0 : this.data.skip;
    this.setData(reset
      ? { loading: true, error: null }
      : { loadingMore: true, error: null });
    try {
      const result = await api.getCommunityChannelAnnouncements(this.data.channelId, {
        skip: nextSkip,
        limit: PAGE_SIZE,
      });
      const normalized = await Promise.all((result.items || []).map((item) => this.normalizeItem(item)));
      const list = reset ? normalized : [...this.data.announcements, ...normalized];
      const total = Number(result.total || 0);
      const skip = nextSkip + normalized.length;
      this.setData({
        announcements: list,
        total,
        skip,
        hasMore: skip < total,
        loading: false,
        loadingMore: false,
      });
    } catch (err) {
      this.setData({
        loading: false,
        loadingMore: false,
        error: err.message || '加载公告失败',
      });
    }
  },

  async normalizeItem(item) {
    const parsedText = htmlToText(item.content || '');
    const previewImages = (item.images || [])
      .slice(0, PREVIEW_IMAGE_LIMIT)
      .map((url) => api.getImageUrl(url));
    const previewBlocks = [];
    if (parsedText) {
      previewBlocks.push({
        type: 'text',
        text: parsedText.length > PREVIEW_TEXT_LIMIT
          ? `${parsedText.slice(0, PREVIEW_TEXT_LIMIT)}…`
          : parsedText,
      });
    }
    if (previewImages.length) {
      previewBlocks.push({ type: 'images', images: previewImages });
    }
    let authorAvatar;
    try {
      authorAvatar = await resolveAvatarDisplayUrl(item.author_avatar_url, item.author_update_time);
    } catch (_) {
      authorAvatar = getDefaultAvatarPath();
    }
    return {
      ...item,
      preview_blocks: previewBlocks,
      preview_images: previewImages,
      author_avatar_display_url: authorAvatar,
      create_time_display: formatRelativeTime(item.create_time),
    };
  },

  canDelete(item) {
    if (!item) return false;
    // 这里不传 user_id，简单用 channelRole + author_user_id 在 list 渲染时取数；
    // 但页面没有 user_id 上下文，借助 wx.getStorageSync('userInfo') 解析
    const info = wx.getStorageSync('userInfo') || {};
    const uid = Number(info.id || info.user_id || 0);
    if (!uid) return false;
    if (item.author_user_id === uid) return true;
    if (this.data.channelRole === 'admin') return true;
    return false;
  },

  onOpenDetail(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (!id) return;
    wx.navigateTo({
      url: tenant.appendTenantToUrl('/pages/community-announcement-detail/community-announcement-detail', {
        channelId: this.data.channelId,
        channelName: this.data.channelName,
        channelRole: this.data.channelRole,
        id,
      }),
    });
  },

  onMoreTap(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (!id) return;
    wx.showActionSheet({
      itemList: ['删除'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.confirmDelete(id);
        }
      },
      fail: () => {},
    });
  },

  async confirmDelete(id) {
    const target = (this.data.announcements || []).find((item) => item.id === id);
    if (!target) return;
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '删除公告',
        content: `确定删除「${target.title}」吗？删除后无法恢复。`,
        confirmText: '删除',
        confirmColor: '#D92D20',
        cancelText: '取消',
        success: (res) => resolve(Boolean(res.confirm)),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;
    try {
      wx.showLoading({ title: '删除中…', mask: true });
      await api.deleteCommunityChannelAnnouncement(this.data.channelId, id);
      wx.hideLoading();
      wx.showToast({ title: '已删除', icon: 'success' });
      // 局部移除
      const next = (this.data.announcements || []).filter((item) => item.id !== id);
      this.setData({
        announcements: next,
        total: Math.max(0, this.data.total - 1),
      });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '删除失败', icon: 'none' });
    }
  },

  onLoadMore() {
    if (this.data.loadingMore || !this.data.hasMore) return;
    this.loadList({ reset: false });
  },

  onCreateAnnouncement() {
    if (!this.data.showCreateButton) {
      wx.showToast({ title: '仅频道管理员可发布公告', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: tenant.appendTenantToUrl('/pages/community-announcement-create/community-announcement-create', {
        channelId: this.data.channelId,
        channelName: this.data.channelName,
      }),
    });
  },

  onPreviewImage(e) {
    const id = Number(e.currentTarget.dataset.id);
    const current = e.currentTarget.dataset.url;
    const target = (this.data.announcements || []).find((item) => item.id === id);
    if (!target) return;
    const allImages = (target.images || []).map((url) => api.getImageUrl(url));
    if (!current || !allImages.length) return;
    wx.previewImage({ current, urls: allImages });
  },
});
