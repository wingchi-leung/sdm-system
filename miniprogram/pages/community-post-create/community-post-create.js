const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');
const contentUtils = require('../../utils/community-content');
const config = require('../../config/index');

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_IMAGE_COUNT = 9;
const MAX_CONTENT_LENGTH = 10000;

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
    title: '',
    submitting: false,
    error: null,
    // 编辑器 HTML 缓存(<editor> 不便双向绑定,需主动通过 EditorContext 拉取)
    _editorHtml: '',
  },

  resetSensitiveData() {
    this.setData({
      title: '',
      _editorHtml: '',
      submitting: false,
      error: null,
    });
  },

  ensurePublisherAccess() {
    if (auth.isUser() || auth.isAdmin()) return true;
    this.resetSensitiveData();
    wx.showToast({ title: '请先登录后发布', icon: 'none' });
    setTimeout(() => wx.navigateBack(), 1200);
    return false;
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    const channelId = Number(options.channelId || 0);
    if (!channelId) {
      this.setData({ error: '缺少频道参数' });
      return;
    }
    if (!this.ensurePublisherAccess()) return;
    this.setData({
      channelId,
      channelName: decodeDisplayText(options.channelName),
      channelRole: decodeDisplayText(options.channelRole || 'member'),
    });
  },

  onEditorReady() {
    // 创建 EditorContext 引用(供插入图片 + 提交时取 HTML 用)
    this.editorCtx = wx.createSelectorQuery().select('#richEditor').context();
    this.editorCtx && this.editorCtx.exec({ name: 'ready' }).catch(() => {});
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value, error: null });
  },

  // 编辑器内容变化 —— 仅在失焦/提交时主动取,避免频繁 setData
  onEditorInput(e) {
    if (e && typeof e.detail.html === 'string') {
      this.data._editorHtml = e.detail.html;
    }
  },

  onEditorBlur(e) {
    if (e && typeof e.detail.html === 'string') {
      this.data._editorHtml = e.detail.html;
    }
  },

  _readEditorHtml() {
    return new Promise((resolve) => {
      const query = wx.createSelectorQuery();
      query.select('#richEditor').context().exec((res) => {
        const ctx = (res && res[0] && res[0].context) || null;
        if (!ctx || typeof ctx.getContents !== 'function') {
          resolve(this.data._editorHtml || '');
          return;
        }
        ctx.getContents({
          success: (out) => resolve((out && out.html) || ''),
          fail: () => resolve(this.data._editorHtml || ''),
        });
      });
    });
  },

  // 在编辑器中插入图片(走 wx.chooseMedia → wx.uploadFile)
  async onInsertImage() {
    if (this.data.submitting) return;
    const token = wx.getStorageSync('access_token') || '';
    try {
      const res = await new Promise((resolve, reject) => {
        wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sourceType: ['album', 'camera'],
          sizeType: ['compressed'],
          success: (r) => resolve(r),
          fail: (e) => reject(e),
        });
      });
      const temp = res && res.tempFiles && res.tempFiles[0];
      if (!temp) return;
      if (temp.size > MAX_IMAGE_SIZE) {
        wx.showToast({ title: '单张图片不能超过 5MB', icon: 'none' });
        return;
      }
      wx.showLoading({ title: '上传中…' });
      const uploadRes = await new Promise((resolve, reject) => {
        wx.uploadFile({
          url: `${config.baseUrl}/community/image`,
          filePath: temp.tempFilePath,
          name: 'file',
          header: { Authorization: `Bearer ${token}` },
          success: (r) => {
            if (r.statusCode >= 200 && r.statusCode < 300) {
              try { resolve(JSON.parse(r.data)); } catch { resolve(r.data); }
            } else {
              let detail = '上传失败';
              try { detail = JSON.parse(r.data)?.detail || detail; } catch {}
              reject(new Error(detail));
            }
          },
          fail: (e) => reject(e),
        });
      });
      wx.hideLoading();
      // 插入到编辑器光标位置
      if (this.editorCtx && typeof this.editorCtx.insertImage === 'function') {
        this.editorCtx.insertImage({ src: uploadRes.url, width: '80%' });
      }
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '插入图片失败', icon: 'none' });
    }
  },

  // 从 HTML 中抽出所有图片 URL(用于后端审核 + 作为 images 字段冗余)
  _extractImageUrls(html) {
    if (!html) return [];
    const matches = html.match(/<img[^>]+src=["']([^"']+)["']/gi) || [];
    return matches
      .map((m) => {
        const r = m.match(/src=["']([^"']+)["']/i);
        return r ? r[1] : null;
      })
      .filter(Boolean);
  },

  // 从 HTML 中抽出纯文本(用于敏感词扫描 + 摘要)
  _htmlToText(html) {
    if (!html) return '';
    return html
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
      .trim();
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
    const html = await this._readEditorHtml();
    const text = this._htmlToText(html);
    if (!text) {
      this.setData({ error: '请输入正文' });
      return;
    }
    if (html.length > MAX_CONTENT_LENGTH) {
      this.setData({ error: '内容过长，请精简后再发布' });
      return;
    }

    const images = this._extractImageUrls(html);

    this.setData({ submitting: true, error: null });
    try {
      await api.createCommunityChannelPost(this.data.channelId, {
        title,
        content: html,
        content_format: 'html',
        images,
      });
      wx.showToast({ title: '发布成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1000);
    } catch (err) {
      this.setData({ error: err.message || '发布失败' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
