const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');
const {
  decodeDisplayText,
  createCommunityEditorData,
  createCommunityEditorMethods,
} = require('../../utils/community-editor');

const DEFAULT_TITLE_MAX_LENGTH = 120;

const MODE_CONFIG = {
  channel_post: {
    pageTitle: '发布动态',
    titlePlaceholder: '输入动态标题',
    titleMaxLength: 120,
  },
  activity_post: {
    pageTitle: '发布动态',
    titlePlaceholder: '输入动态标题',
    titleMaxLength: 120,
  },
  channel_announcement: {
    pageTitle: '发布公告',
    titlePlaceholder: '输入公告标题',
    titleMaxLength: 50,
  },
};

Page({
  data: {
    ...createCommunityEditorData({ titleMaxLength: DEFAULT_TITLE_MAX_LENGTH }),
    mode: '',
    pageTitle: '发布动态',
    titlePlaceholder: '输入动态标题',
    contextName: '',
    channelId: null,
    channelName: '',
    channelRole: 'member',
    activityId: null,
    activityName: '',
    statusBarHeight: 0,
  },

  ...createCommunityEditorMethods({
    titleMaxLength: DEFAULT_TITLE_MAX_LENGTH,
    uploadImage: (filePath) => api.uploadCommunityImage(filePath),
    getImageUrl: (url) => api.getImageUrl(url),
  }),

  onTitleInput(e) {
    const titleMaxLength = Number(this.data.titleMaxLength || DEFAULT_TITLE_MAX_LENGTH);
    const title = (e.detail.value || '').slice(0, titleMaxLength);
    this.setData({
      title,
      titleLength: title.length,
      error: null,
    });
  },

  getModeConfig(mode) {
    return MODE_CONFIG[mode] || MODE_CONFIG.channel_post;
  },

  resolveMode(options = {}) {
    if (options.mode === 'channel_announcement') {
      return 'channel_announcement';
    }
    if (Number(options.activityId || 0)) {
      return 'activity_post';
    }
    if (Number(options.channelId || 0)) {
      return 'channel_post';
    }
    return '';
  },

  applyModeConfig(mode, extraData = {}) {
    const config = this.getModeConfig(mode);
    this.setData({
      mode,
      pageTitle: config.pageTitle,
      titlePlaceholder: config.titlePlaceholder,
      titleMaxLength: config.titleMaxLength,
      ...extraData,
    });
  },

  ensurePublisherAccess(mode) {
    if (auth.isUser() || auth.isAdmin()) return true;
    this.resetSensitiveData();
    wx.showToast({ title: '请先登录后发布', icon: 'none' });
    setTimeout(() => this.onBackTap(), 1200);
    return false;
  },

  ensureModeAccess(mode) {
    if (!this.ensurePublisherAccess(mode)) {
      return false;
    }
    if (mode === 'channel_announcement' && this.data.channelRole !== 'admin' && !auth.isAdmin()) {
      this.resetSensitiveData();
      wx.showToast({ title: '仅频道管理员可发布公告', icon: 'none' });
      setTimeout(() => this.onBackTap(), 1200);
      return false;
    }
    return true;
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    const mode = this.resolveMode(options);
    const channelId = Number(options.channelId || 0);
    const activityId = Number(options.activityId || 0);
    const channelName = decodeDisplayText(options.channelName);
    const activityName = decodeDisplayText(options.activityName);
    const channelRole = decodeDisplayText(options.channelRole || 'member');
    const systemInfo = typeof wx.getSystemInfoSync === 'function' ? wx.getSystemInfoSync() : {};
    const statusBarHeight = Number(systemInfo.statusBarHeight || 0);

    if (mode === 'channel_post' && channelId) {
      this.applyModeConfig(mode, {
        channelId,
        channelName,
        channelRole,
        contextName: channelName,
        activityId: null,
        activityName: '',
        statusBarHeight,
      });
      if (!this.ensureModeAccess(mode)) return;
      return;
    }

    if (mode === 'activity_post' && activityId) {
      this.applyModeConfig(mode, {
        channelId: null,
        channelName: '',
        channelRole: 'member',
        activityId,
        activityName,
        contextName: activityName,
        statusBarHeight,
      });
      if (!this.ensureModeAccess(mode)) return;
      return;
    }

    if (mode === 'channel_announcement' && channelId) {
      this.applyModeConfig(mode, {
        channelId,
        channelName,
        channelRole,
        contextName: channelName,
        activityId: null,
        activityName: '',
        statusBarHeight,
      });
      if (!this.ensureModeAccess(mode)) return;
      return;
    }

    wx.showToast({ title: '缺少发布上下文', icon: 'none' });
    setTimeout(() => this.onBackTap(), 1500);
  },

  onBackTap() {
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

  async onSubmit() {
    if (this.data.submitting) return;
    if (!this.ensureModeAccess(this.data.mode)) {
      return;
    }

    const title = (this.data.title || '').trim();
    if (!title) {
      this.setData({ error: '请输入标题' });
      return;
    }

    const editorContent = await this._readEditorContents();
    let validatedContent;
    try {
      validatedContent = this._validateEditorContent(
        editorContent.html || this.data._editorHtml || '',
        editorContent.text || '',
      );
    } catch (err) {
      this.setData({ error: err.message || '请输入正文' });
      return;
    }

    const images = this._extractImageUrls(validatedContent.html);
    this.setData({ submitting: true, error: null });
    try {
      if (this.data.mode === 'channel_post') {
        await api.createCommunityChannelPost(this.data.channelId, {
          title,
          content: validatedContent.html,
          content_format: 'html',
          images,
        });
      } else if (this.data.mode === 'activity_post') {
        await api.createCommunityPost({
          activity_id: this.data.activityId,
          title,
          content: validatedContent.html,
          images,
        });
      } else if (this.data.mode === 'channel_announcement') {
        await api.createCommunityChannelAnnouncement(this.data.channelId, {
          title,
          content: validatedContent.html,
          content_format: 'html',
          images,
        });
      } else {
        throw new Error('发布模式无效');
      }
      wx.showToast({ title: '发布成功', icon: 'success' });
      setTimeout(() => this.onBackTap(), 1000);
    } catch (err) {
      this.setData({ error: err.message || '发布失败' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
