const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');
const {
  decodeDisplayText,
  createCommunityEditorData,
  createCommunityEditorMethods,
} = require('../../utils/community-editor');

const MAX_TITLE_LENGTH = 50;

Page({
  data: {
    ...createCommunityEditorData({ titleMaxLength: MAX_TITLE_LENGTH }),
    channelId: null,
    channelName: '',
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
    if (!channelId) {
      wx.showToast({ title: '缺少频道参数', icon: 'none' });
      setTimeout(() => this.onBackTap(), 1500);
      return;
    }
    if (!this.ensurePublisherAccess()) return;
    const systemInfo = typeof wx.getSystemInfoSync === 'function' ? wx.getSystemInfoSync() : {};
    this.setData({
      channelId,
      channelName: decodeDisplayText(options.channelName),
      statusBarHeight: Number(systemInfo.statusBarHeight || 0),
    });
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
      await api.createCommunityChannelAnnouncement(this.data.channelId, {
        title,
        content: validatedContent.html,
        content_format: 'html',
        images,
      });
      wx.showToast({ title: '发布成功', icon: 'success' });
      setTimeout(() => this.onBackTap(), 1000);
    } catch (err) {
      this.setData({ error: err.message || '发布失败' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
