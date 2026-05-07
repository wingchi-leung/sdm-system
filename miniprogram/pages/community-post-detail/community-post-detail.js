const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');

Page({
  data: {
    postId: null,
    post: null,
    comments: [],
    loading: true,
    error: null,
    commentContent: '',
    commentSubmitting: false,
    canComment: false,
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    const postId = Number(options.id || 0);
    if (!postId) {
      this.setData({ loading: false, error: '缺少文章参数' });
      return;
    }
    this.setData({
      postId,
      canComment: auth.isUser(),
    });
    this.loadPageData();
  },

  onShow() {
    this.setData({ canComment: auth.isUser() });
  },

  async loadPageData() {
    this.setData({ loading: true, error: null });
    try {
      const [post, commentRes] = await Promise.all([
        api.getCommunityPostDetail(this.data.postId),
        api.getCommunityComments(this.data.postId, { limit: 200 }),
      ]);
      this.setData({
        post: {
          ...post,
          cover_url: api.getImageUrl(post.cover_url),
          create_time_display: this.formatTime(post.create_time),
        },
        comments: (commentRes.items || []).map((item) => ({
          ...item,
          create_time_display: this.formatTime(item.create_time),
        })),
        loading: false,
      });
    } catch (err) {
      this.setData({
        loading: false,
        error: err.message || '加载动态详情失败',
      });
    }
  },

  formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
  },

  onCommentInput(e) {
    this.setData({ commentContent: e.detail.value });
  },

  async onSubmitComment() {
    const content = (this.data.commentContent || '').trim();
    if (!content) {
      wx.showToast({ title: '请输入评论内容', icon: 'none' });
      return;
    }
    if (!auth.isUser()) {
      this.setData({ canComment: false });
      wx.showToast({ title: '当前账号不可发表评论', icon: 'none' });
      return;
    }
    this.setData({ commentSubmitting: true });
    try {
      const comment = await api.createCommunityComment(this.data.postId, content);
      this.setData({
        comments: [...this.data.comments, {
          ...comment,
          create_time_display: this.formatTime(comment.create_time),
        }],
        commentContent: '',
        commentSubmitting: false,
        post: this.data.post ? {
          ...this.data.post,
          comment_count: (this.data.post.comment_count || 0) + 1,
        } : this.data.post,
      });
      wx.showToast({ title: '评论成功', icon: 'success' });
    } catch (err) {
      this.setData({ commentSubmitting: false });
      wx.showToast({ title: err.message || '评论失败', icon: 'none' });
    }
  },
});
