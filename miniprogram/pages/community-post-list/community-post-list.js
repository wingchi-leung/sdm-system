const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');

Page({
  data: {
    activityId: null,
    activityName: '',
    posts: [],
    loading: true,
    error: null,
    showCreateButton: false,
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    const activityId = Number(options.activityId || 0);
    if (!activityId) {
      this.setData({ loading: false, error: '缺少活动参数' });
      return;
    }
    this.setData({
      activityId,
      activityName: options.activityName || '',
      showCreateButton: auth.isAdmin(),
    });
    this.loadPosts();
  },

  onShow() {
    if (this.data.activityId) {
      this.loadPosts();
    }
  },

  async loadPosts() {
    this.setData({ loading: true, error: null });
    try {
      const result = await api.getCommunityPosts(this.data.activityId, { limit: 100 });
      const posts = (result.items || []).map((item) => ({
        ...item,
        cover_url: api.getImageUrl(item.cover_url),
        create_time_display: this.formatTime(item.create_time),
      }));
      this.setData({ posts, loading: false });
    } catch (err) {
      this.setData({
        loading: false,
        error: err.message || '加载活动动态失败',
        posts: [],
      });
    }
  },

  formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}.${m}.${day}`;
  },

  onOpenPost(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: tenant.appendTenantToUrl('/pages/community-post-detail/community-post-detail', { id }),
    });
  },

  onCreatePost() {
    wx.navigateTo({
      url: tenant.appendTenantToUrl('/pages/community-post-create/community-post-create', {
        activityId: this.data.activityId,
        activityName: this.data.activityName,
      }),
    });
  },
});
