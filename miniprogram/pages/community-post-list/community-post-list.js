const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');
const contentUtils = require('../../utils/community-content');
const { resolveAvatarDisplayUrl, getDefaultAvatarPath } = require('../../utils/avatar');

const PAGE_SIZE = 10;
const COMMENT_PAGE_SIZE = 20;

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
    showCalendarButton: true,
    canComment: false,
    hasMorePosts: false,
    showEmptyState: false,
    total: 0,
    skip: 0,
    announcementCount: 0,
  },

  resolvePageState() {
    this.setData({
      // 公告发布按钮：仅频道管理员可见（不是 RBAC 的 isAdmin）
      showCreateButton: auth.isUser() || auth.isAdmin(),
      showManageButton: this.data.channelRole === 'admin',
      showCalendarButton: true,
      canComment: auth.isUser() || auth.isAdmin(),
      showAnnouncementEntry: this.data.announcementCount > 0,
      showAnnouncementCreate: this.data.channelRole === 'admin',
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
      wx.showToast({ title: err.message || '加载社区信息失败', icon: 'none' });
    }
  },

  async loadAnnouncementSummary() {
    if (!this.data.channelId) return;
    try {
      const summary = await api.getCommunityChannelAnnouncementSummary(this.data.channelId);
      const count = Number(summary.total || 0);
      this.setData({ announcementCount: count });
      this.resolvePageState();
    } catch (_) {
      this.setData({ announcementCount: 0 });
      this.resolvePageState();
    }
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    const channelId = Number(options.channelId || 0);
    if (!channelId) {
      this.setData({ loading: false, error: '缺少社区参数' });
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
      this.loadAnnouncementSummary();
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
        showEmptyState: posts.length === 0,
        loading: false,
        loadingMore: false,
      });
    } catch (err) {
      this.setData({
        loading: false,
        loadingMore: false,
        error: err.message || '加载社区动态失败',
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
      author_avatar_display_url: await this.resolveAvatar(item.author_avatar_url, item.author_update_time),
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
      comment_compose_open: false,
      commentContent: '',
      commentImageLocalPaths: [],
      commentSubmitting: false,
    };
  },

  async normalizeComment(comment) {
    return {
      ...comment,
      images: (comment.images || []).map((url) => api.getImageUrl(url)),
      user_avatar_display_url: await this.resolveAvatar(comment.user_avatar_url, comment.user_update_time),
      create_time_display: this.formatRelativeTime(comment.create_time),
    };
  },

  parsePostContent(rawContent, rawImages) {
    const raw = rawContent || '';
    const imageList = (rawImages || []).map((url) => api.getImageUrl(url));
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

    // 合并内容块里的图片与 rawImages，去重，避免重复渲染
    const seen = new Set();
    const merged = [];
    for (const url of [...blockImages, ...imageList]) {
      if (url && !seen.has(url)) {
        seen.add(url);
        merged.push(url);
      }
    }

    const normalizedBlocks = [...blocks];
    const hasImageBlock = normalizedBlocks.some((block) => block.type === 'images');
    if (merged.length && hasImageBlock) {
      for (let index = 0; index < normalizedBlocks.length; index += 1) {
        const block = normalizedBlocks[index];
        if (block.type === 'images') {
          normalizedBlocks[index] = { ...block, images: merged };
          break;
        }
      }
    } else if (merged.length) {
      normalizedBlocks.push({ type: 'images', images: merged });
    }
    if (!normalizedBlocks.length && (parsed.text || raw)) {
      normalizedBlocks.push({ type: 'text', text: (parsed.text || raw).trim() });
    }

    return {
      text: (parsed.text || '').trim() || raw,
      blocks: normalizedBlocks,
      images: merged,
    };
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

  async resolveAvatar(avatarUrl, cacheVersion) {
    try {
      return await resolveAvatarDisplayUrl(avatarUrl, cacheVersion);
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

  onToggleCommentComposer(e) {
    const postId = Number(e.currentTarget.dataset.id);
    if (!postId) return;
    this.updatePostById(postId, (post) => ({
      ...post,
      comment_compose_open: !post.comment_compose_open,
    }));
  },

  onCommentInput(e) {
    const postId = Number(e.currentTarget.dataset.id);
    if (!postId) return;
    this.updatePostById(postId, (post) => ({
      ...post,
      commentContent: e.detail.value,
    }));
  },

  onChooseCommentImages(e) {
    const postId = Number(e.currentTarget.dataset.id);
    if (!postId) return;
    const post = (this.data.posts || []).find((item) => item.id === postId);
    if (!post) return;

    const currentCount = (post.commentImageLocalPaths || []).length;
    const remain = 9 - currentCount;
    if (remain <= 0) {
      wx.showToast({ title: '最多上传9张图片', icon: 'none' });
      return;
    }

    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album'],
      sizeType: ['compressed'],
      success: (res) => {
        const selected = (res.tempFiles || [])
          .filter((file) => {
            if (file.size > 5 * 1024 * 1024) {
              wx.showToast({ title: '单张图片不能超过5MB', icon: 'none' });
              return false;
            }
            return true;
          })
          .map((file) => file.tempFilePath);
        if (!selected.length) return;
        this.updatePostById(postId, (item) => ({
          ...item,
          comment_compose_open: true,
          commentImageLocalPaths: [...(item.commentImageLocalPaths || []), ...selected].slice(0, 9),
        }));
      },
      fail: () => wx.showToast({ title: '选择图片失败', icon: 'none' }),
    });
  },

  onRemoveCommentImage(e) {
    const postId = Number(e.currentTarget.dataset.postId);
    const index = Number(e.currentTarget.dataset.index);
    if (!postId || Number.isNaN(index)) return;
    this.updatePostById(postId, (post) => {
      const nextPaths = [...(post.commentImageLocalPaths || [])];
      nextPaths.splice(index, 1);
      return {
        ...post,
        commentImageLocalPaths: nextPaths,
      };
    });
  },

  async onSubmitComment(e) {
    const postId = Number(e.currentTarget.dataset.id);
    if (!postId) return;
    const target = (this.data.posts || []).find((post) => post.id === postId);
    if (!target) return;

    const content = String(target.commentContent || '').trim();
    if (!content) {
      wx.showToast({ title: '请输入评论内容', icon: 'none' });
      return;
    }
    if (!(auth.isUser() || auth.isAdmin())) {
      wx.showToast({ title: '当前账号不可发表评论', icon: 'none' });
      return;
    }
    if (target.commentSubmitting) return;

    this.updatePostById(postId, (post) => ({
      ...post,
      commentSubmitting: true,
    }));

    try {
      const localPaths = target.commentImageLocalPaths || [];
      const uploadedUrls = [];
      for (let index = 0; index < localPaths.length; index += 1) {
        try {
          wx.showLoading({ title: `上传图片 ${index + 1}/${localPaths.length}`, mask: true });
          const uploadResult = await api.uploadCommunityImage(localPaths[index]);
          uploadedUrls.push(uploadResult.url);
        } catch (uploadErr) {
          wx.hideLoading();
          const retry = await new Promise((resolve) => {
            wx.showModal({
              title: '上传失败',
              content: `第 ${index + 1} 张图片上传失败，是否重试？`,
              confirmText: '重试',
              cancelText: '取消',
              success: (res) => resolve(Boolean(res.confirm)),
              fail: () => resolve(false),
            });
          });
          if (retry) {
            index -= 1;
            continue;
          }
          throw uploadErr;
        }
      }
      if (localPaths.length > 0) {
        wx.hideLoading();
      }

      const comment = await api.createCommunityChannelComment(this.data.channelId, postId, {
        content,
        images: uploadedUrls,
      });
      const normalizedComment = await this.normalizeComment(comment);
      const nextCommentCount = Number(target.comment_count || 0) + 1;
      this.updatePostById(postId, (post) => {
        const nextComments = [...(post.comments || []), normalizedComment];
        return {
          ...post,
          comments: nextComments,
          comment_count: nextCommentCount,
          comments_loaded_all: Boolean(post.comments_loaded_all),
          comment_compose_open: false,
          commentContent: '',
          commentImageLocalPaths: [],
          commentSubmitting: false,
        };
      });
      wx.showToast({ title: '评论成功', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      this.updatePostById(postId, (post) => ({
        ...post,
        commentSubmitting: false,
      }));
      wx.showToast({ title: err.message || '评论失败', icon: 'none' });
    }
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

  onCreateAnnouncement() {
    if (this.data.channelRole !== 'admin') {
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

  onOpenAnnouncementList() {
    wx.navigateTo({
      url: tenant.appendTenantToUrl('/pages/community-announcement-list/community-announcement-list', {
        channelId: this.data.channelId,
        channelName: this.data.channelName,
        channelRole: this.data.channelRole,
      }),
    });
  },

  onOpenCalendar() {
    wx.navigateTo({
      url: tenant.appendTenantToUrl('/pages/community-calendar/community-calendar', {
        channelId: this.data.channelId,
        channelName: this.data.channelName,
        channelRole: this.data.channelRole,
      }),
    });
  },

  onManageMembers() {
    if (!this.data.showManageButton) {
      wx.showToast({ title: '仅社区管理员可管理成员', icon: 'none' });
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
