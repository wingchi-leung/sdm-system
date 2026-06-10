const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');
const contentUtils = require('../../utils/community-content');
const { resolveAvatarDisplayUrl, getDefaultAvatarPath } = require('../../utils/avatar');

const PAGE_SIZE = 10;
const COMMENT_PAGE_SIZE = 20;
const HTML_TAG_PATTERN = /<\/?(p|div|span|img|br|strong|em|h[1-6]|ul|ol|li|blockquote|a)\b/i;

function decodeDisplayText(value) {
  const text = value == null ? '' : String(value);
  if (!text) return '';
  try {
    return decodeURIComponent(text);
  } catch (_) {
    return text;
  }
}

Page({
  data: {
    channelId: null,
    channelName: '',
    channelRole: 'member',
    channelMemberCount: 0,
    posts: [],
    loading: true,
    loadingMore: false,
    error: null,
    showCreateButton: true,
    showManageButton: false,
    hasMorePosts: false,
    total: 0,
    skip: 0,
  },

  resolvePageState() {
    this.setData({
      showCreateButton: auth.isUser() || auth.isAdmin(),
      showManageButton: this.data.channelRole === 'admin',
    });
  },

  async loadChannelDetail() {
    if (!this.data.channelId) return;
    try {
      const detail = await api.getCommunityChannelDetail(this.data.channelId);
      this.setData({
        channelName: detail.name || this.data.channelName,
        channelRole: detail.role || this.data.channelRole,
        channelMemberCount: Number(detail.member_count || 0),
      });
      this.resolvePageState();
    } catch (err) {
      wx.showToast({ title: err.message || '加载频道信息失败', icon: 'none' });
    }
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
    this.resolvePageState();
    this.loadChannelDetail();
    this.loadPosts({ reset: true });
  },

  onShow() {
    if (this.data.channelId) {
      this.resolvePageState();
      this.loadChannelDetail();
      this.loadPosts({ reset: true });
    }
  },

  async loadPosts({ reset = false } = {}) {
    const nextSkip = reset ? 0 : this.data.skip;
    this.setData(reset
      ? { loading: true, error: null }
      : { loadingMore: true, error: null });

    try {
      const result = await api.getCommunityChannelPosts(this.data.channelId, {
        skip: nextSkip,
        limit: PAGE_SIZE,
      });
      const normalized = await Promise.all((result.items || []).map((item) => this.normalizePostItem(item)));
      const posts = reset ? normalized : [...this.data.posts, ...normalized];
      const total = Number(result.total || 0);
      const skip = nextSkip + normalized.length;
      this.setData({
        posts,
        total,
        skip,
        hasMorePosts: skip < total,
        loading: false,
        loadingMore: false,
      });
    } catch (err) {
      this.setData({
        loading: false,
        loadingMore: false,
        error: err.message || '加载频道动态失败',
      });
    }
  },

  async normalizePostItem(item) {
    const parsed = this.parsePostContent(item.content || '', item.images || []);
    const previewComments = await Promise.all(
      (item.preview_comments || []).map((comment) => this.normalizeComment(comment)),
    );

    return {
      ...item,
      parsed,
      author_avatar_display_url: await this.resolveAvatar(item.author_avatar_url),
      cover_image: parsed.images[0] || '',
      extra_image_count: Math.max(0, parsed.images.length - 1),
      create_time_display: this.formatDate(item.create_time),
      publish_time_ago: this.formatRelativeTime(item.create_time),
      content_summary: parsed.text.slice(0, 96),
      content_expanded: false,
      comments_collapsed: false,
      comments_loading: false,
      comments: previewComments,
      comments_loaded_all: previewComments.length >= Number(item.comment_count || 0),
    };
  },

  async normalizeComment(comment) {
    return {
      ...comment,
      images: (comment.images || []).map((url) => api.getImageUrl(url)),
      user_avatar_display_url: await this.resolveAvatar(comment.user_avatar_url),
      create_time_display: this.formatRelativeTime(comment.create_time),
    };
  },

  parsePostContent(rawContent, rawImages) {
    const raw = rawContent || '';
    const imageList = (rawImages || []).map((url) => api.getImageUrl(url));
    if (HTML_TAG_PATTERN.test(raw)) {
      const htmlImages = this.extractImageUrls(raw).map((url) => api.getImageUrl(url));
      return {
        isHtml: true,
        html: raw,
        text: this.htmlToText(raw),
        blocks: [],
        images: htmlImages.length ? htmlImages : imageList,
      };
    }

    const parsed = contentUtils.parsePostContent(raw);
    const blocks = (parsed.blocks || []).map((block) => {
      if (block.type !== 'images') return block;
      return {
        ...block,
        images: (block.images || []).map((url) => api.getImageUrl(url)),
      };
    });
    const blockImages = blocks
      .filter((block) => block.type === 'images')
      .flatMap((block) => block.images || []);

    return {
      isHtml: false,
      html: '',
      text: (parsed.text || '').trim() || raw,
      blocks,
      images: blockImages.length ? blockImages : imageList,
    };
  },

  extractImageUrls(html) {
    if (!html) return [];
    const matches = html.match(/<img[^>]+src=["']([^"']+)["']/gi) || [];
    return matches
      .map((item) => {
        const result = item.match(/src=["']([^"']+)["']/i);
        return result ? result[1] : null;
      })
      .filter(Boolean);
  },

  htmlToText(html) {
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
  },

  formatDate(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
  },

  formatRelativeTime(iso) {
    if (!iso) return '';
    const now = Date.now();
    const target = new Date(iso).getTime();
    if (!target) return '';
    const diffMinutes = Math.max(1, Math.floor((now - target) / 60000));
    if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} 小时前`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} 天前`;
    return this.formatDate(iso);
  },

  async resolveAvatar(avatarUrl) {
    try {
      return await resolveAvatarDisplayUrl(avatarUrl);
    } catch (_) {
      return getDefaultAvatarPath();
    }
  },

  updatePostById(postId, updater) {
    const nextPosts = (this.data.posts || []).map((post) => (
      post.id === postId ? updater(post) : post
    ));
    this.setData({ posts: nextPosts });
  },

  onToggleContent(e) {
    const postId = Number(e.currentTarget.dataset.id);
    if (!postId) return;
    this.updatePostById(postId, (post) => ({
      ...post,
      content_expanded: !post.content_expanded,
    }));
  },

  onToggleComments(e) {
    const postId = Number(e.currentTarget.dataset.id);
    if (!postId) return;
    this.updatePostById(postId, (post) => ({
      ...post,
      comments_collapsed: !post.comments_collapsed,
    }));
  },

  async onLoadMoreComments(e) {
    const postId = Number(e.currentTarget.dataset.id);
    if (!postId) return;
    const target = (this.data.posts || []).find((post) => post.id === postId);
    if (!target || target.comments_loading || target.comments_loaded_all) return;

    this.updatePostById(postId, (post) => ({ ...post, comments_loading: true }));
    try {
      const result = await api.getCommunityChannelComments(this.data.channelId, postId, {
        skip: target.comments.length,
        limit: COMMENT_PAGE_SIZE,
      });
      const appended = await Promise.all((result.items || []).map((item) => this.normalizeComment(item)));
      this.updatePostById(postId, (post) => {
        const comments = [...post.comments, ...appended];
        return {
          ...post,
          comments,
          comments_loading: false,
          comments_loaded_all: comments.length >= Number(result.total || post.comment_count || 0),
        };
      });
    } catch (err) {
      this.updatePostById(postId, (post) => ({ ...post, comments_loading: false }));
      wx.showToast({ title: err.message || '加载评论失败', icon: 'none' });
    }
  },

  onPreviewPostImage(e) {
    const postId = Number(e.currentTarget.dataset.id);
    const current = e.currentTarget.dataset.url;
    const target = (this.data.posts || []).find((post) => post.id === postId);
    const urls = target && target.parsed ? (target.parsed.images || []) : [];
    if (!current || !urls.length) return;
    wx.previewImage({ current, urls });
  },

  onPreviewCommentImage(e) {
    const postId = Number(e.currentTarget.dataset.postId);
    const commentId = Number(e.currentTarget.dataset.commentId);
    const current = e.currentTarget.dataset.url;
    const target = (this.data.posts || []).find((post) => post.id === postId);
    if (!target) return;
    const comment = (target.comments || []).find((item) => item.id === commentId);
    const urls = comment ? (comment.images || []) : [];
    if (!current || !urls.length) return;
    wx.previewImage({ current, urls });
  },

  onLoadMorePosts() {
    if (this.data.loadingMore || !this.data.hasMorePosts) return;
    this.loadPosts({ reset: false });
  },

  onCreatePost() {
    wx.navigateTo({
      url: tenant.appendTenantToUrl('/pages/community-post-create/community-post-create', {
        channelId: this.data.channelId,
        channelName: this.data.channelName,
        channelRole: this.data.channelRole,
      }),
    });
  },

  onManageMembers() {
    if (!this.data.showManageButton) {
      wx.showToast({ title: '仅频道管理员可管理成员', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: tenant.appendTenantToUrl('/pages/community-channel-manage/community-channel-manage', {
        channelId: this.data.channelId,
        channelName: this.data.channelName,
        channelRole: this.data.channelRole,
      }),
    });
  },
});
