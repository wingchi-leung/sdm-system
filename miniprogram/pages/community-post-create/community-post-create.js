const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');
const {
  decodeDisplayText,
  createCommunityEditorData,
  createCommunityEditorMethods,
} = require('../../utils/community-editor');

const MAX_TITLE_LENGTH = 120;

Page({
  data: {
    ...createCommunityEditorData({ titleMaxLength: MAX_TITLE_LENGTH }),
    mode: '',
    channelId: null,
    channelName: '',
    channelRole: 'member',
    activityId: null,
    activityName: '',
    statusBarHeight: 0,
  },

  ...createCommunityEditorMethods({
    titleMaxLength: MAX_TITLE_LENGTH,
    uploadImage: (filePath) => api.uploadCommunityImage(filePath),
    getImageUrl: (url) => api.getImageUrl(url),
  }),

  ensurePublisherAccess() {
    if (auth.isUser() || auth.isAdmin()) return true;
    this.resetSensitiveData();
    wx.showToast({ title: '请先登录后发布', icon: 'none' });
    setTimeout(() => this.onBackTap(), 1200);
    return false;
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    const channelId = Number(options.channelId || 0);
    const activityId = Number(options.activityId || 0);

    if (channelId) {
      if (!this.ensurePublisherAccess()) return;
      const systemInfo = typeof wx.getSystemInfoSync === 'function' ? wx.getSystemInfoSync() : {};
      this.setData({
        mode: 'channel',
        channelId,
        channelName: decodeDisplayText(options.channelName),
        channelRole: decodeDisplayText(options.channelRole || 'member'),
        statusBarHeight: Number(systemInfo.statusBarHeight || 0),
      });
      return;
    }

    if (activityId) {
      if (!this.ensurePublisherAccess()) return;
      const systemInfo = typeof wx.getSystemInfoSync === 'function' ? wx.getSystemInfoSync() : {};
      this.setData({
        mode: 'activity',
        activityId,
        activityName: decodeDisplayText(options.activityName),
        statusBarHeight: Number(systemInfo.statusBarHeight || 0),
      });
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
    if (!(auth.isUser() || auth.isAdmin())) {
      this.ensurePublisherAccess();
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
      if (this.data.mode === 'channel') {
        await api.createCommunityChannelPost(this.data.channelId, {
          title,
          content: validatedContent.html,
          content_format: 'html',
          images,
        });
      } else if (this.data.mode === 'activity') {
        await api.createCommunityPost({
          activity_id: this.data.activityId,
          title,
          content: validatedContent.html,
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
