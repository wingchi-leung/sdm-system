const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_IMAGE_COUNT = 9;
const MAX_CONTENT_LENGTH = 10000;
const MAX_TITLE_LENGTH = 50;

function decodeDisplayText(value) {
  const text = value == null ? '' : String(value);
  if (!text) return '';
  try {
    return decodeURIComponent(text);
  } catch (_) {
    return text;
  }
}

function getPlainTextLength(value) {
  const text = value == null ? '' : String(value).replace(/\s+/g, '');
  return text.length;
}

function waitForNextTick() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

Page({
  data: {
    mode: '',                  // 'channel' | 'activity'
    channelId: null,
    channelName: '',
    channelRole: 'member',
    activityId: null,
    activityName: '',
    statusBarHeight: 0,
    title: '',
    titleLength: 0,
    contentLength: 0,
    editorReady: false,
    submitting: false,
    error: null,
    _editorHtml: '',
  },

  resetSensitiveData() {
    if (this._uploadedUrlMap) this._uploadedUrlMap.clear();
    this.setData({
      title: '',
      titleLength: 0,
      contentLength: 0,
      editorReady: false,
      _editorHtml: '',
      submitting: false,
      error: null,
    });
  },

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

    // 优先 channel 模式：community-post-list.js:469-477 走这条
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

    // activity 模式：activity-detail.js:455-463 走这条
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

    // 缺参数兜底：toast + 自动返回，替代原 setData error 后卡死导致 422
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

  onEditorReady() {
    this.ensureEditorContext().catch(() => {});
  },

  onTitleInput(e) {
    const title = (e.detail.value || '').slice(0, MAX_TITLE_LENGTH);
    this.setData({
      title,
      titleLength: title.length,
      error: null,
    });
  },

  onEditorInput(e) {
    const rawHtml = e && e.detail && typeof e.detail.html === 'string' ? e.detail.html : '';
    const text = e && e.detail && typeof e.detail.text === 'string' ? e.detail.text : '';
    this.data._editorHtml = this._normalizeImageSrcsToRelative(rawHtml);
    this.setData({
      contentLength: getPlainTextLength(text || rawHtml),
      error: null,
    });
  },

  onEditorBlur(e) {
    const rawHtml = e && e.detail && typeof e.detail.html === 'string' ? e.detail.html : '';
    const text = e && e.detail && typeof e.detail.text === 'string' ? e.detail.text : '';
    if (rawHtml || text) {
      this.data._editorHtml = this._normalizeImageSrcsToRelative(rawHtml);
    }
    this.setData({
      contentLength: getPlainTextLength(text || rawHtml),
    });
  },

  ensureEditorContext() {
    if (this.editorCtx) {
      return Promise.resolve(this.editorCtx);
    }
    if (this.editorCtxPromise) {
      return this.editorCtxPromise;
    }
    this.editorCtxPromise = new Promise((resolve, reject) => {
      wx.createSelectorQuery()
        .select('#richEditor')
        .context((res) => {
          const ctx = res && res.context ? res.context : null;
          if (!ctx) {
            reject(new Error('编辑器尚未准备完成'));
            return;
          }
          this.editorCtx = ctx;
          this.setData({ editorReady: true });
          resolve(ctx);
        })
        .exec();
    }).finally(() => {
      this.editorCtxPromise = null;
    });
    return this.editorCtxPromise;
  },

  async _captureEditorSnapshot(editorCtx = this.editorCtx) {
    if (!editorCtx || typeof editorCtx.getContents !== 'function') {
      return null;
    }

    const snapshot = await new Promise((resolve) => {
      try {
        editorCtx.getContents({
          success: (out) => resolve(out || null),
          fail: () => resolve(null),
        });
      } catch (_) {
        resolve(null);
      }
    });

    if (!snapshot) {
      return null;
    }

    const rawHtml = typeof snapshot.html === 'string' ? snapshot.html : '';
    const text = typeof snapshot.text === 'string' ? snapshot.text : '';
    // 编辑器返回的 HTML 中图片 src 是完整 URL（我们 insertImage 时传的 displayUrl），
    // 还原为相对路径以保证后续 _extractImageUrls 提取到的是相对路径
    const html = this._normalizeImageSrcsToRelative(rawHtml);
    this.data._editorHtml = html;
    this.setData({
      contentLength: getPlainTextLength(text || html),
    });
    return { html, text };
  },

  async _readEditorContents() {
    let editorCtx = this.editorCtx;
    if (!editorCtx) {
      try {
        editorCtx = await this.ensureEditorContext();
      } catch (_) {
        editorCtx = null;
      }
    }

    const snapshot = await this._captureEditorSnapshot(editorCtx);
    if (snapshot) {
      return snapshot;
    }

    const html = this.data._editorHtml || '';
    return {
      html,
      text: this._htmlToText(html),
    };
  },

  async onToolbarAction(e) {
    if (this.data.submitting) return;
    const action = e.currentTarget.dataset.action;
    if (!action) return;

    try {
      const editorCtx = await this.ensureEditorContext();

      if (action === 'insert-image') {
        await this.onInsertImage();
        return;
      }

      if (action === 'paragraph') {
        if (typeof editorCtx.focus === 'function') {
          editorCtx.focus();
        }
        return;
      }

      if (action === 'align-left') {
        if (typeof editorCtx.focus === 'function') {
          editorCtx.focus();
        }
        editorCtx.format('align', 'left');
        return;
      }

      if (action === 'list-bullet') {
        if (typeof editorCtx.focus === 'function') {
          editorCtx.focus();
        }
        editorCtx.format('list', 'bullet');
        return;
      }

      if (action === 'list-ordered') {
        if (typeof editorCtx.focus === 'function') {
          editorCtx.focus();
        }
        editorCtx.format('list', 'ordered');
        return;
      }

      if (action === 'blockquote') {
        if (typeof editorCtx.focus === 'function') {
          editorCtx.focus();
        }
        editorCtx.format('blockquote', true);
        return;
      }

      if (action === 'clear') {
        const confirmed = await new Promise((resolve) => {
          wx.showModal({
            title: '清空正文',
            content: '确定要清空当前正文内容吗？',
            confirmText: '清空',
            cancelText: '取消',
            success: (res) => resolve(!!res.confirm),
            fail: () => resolve(false),
          });
        });
        if (!confirmed) return;

        editorCtx.clear({
          success: () => {
            this.data._editorHtml = '';
            this.setData({
              contentLength: 0,
              error: null,
            });
          },
        });
        return;
      }

      if (typeof editorCtx.focus === 'function') {
        editorCtx.focus();
      }
      editorCtx.format(action);
    } catch (_) {
      wx.showToast({ title: '编辑器还没准备好', icon: 'none' });
    }
  },

  async onInsertImage() {
    if (this.data.submitting) return;

    const currentImages = this._extractImageUrls(this.data._editorHtml || '');
    const remain = Math.max(0, MAX_IMAGE_COUNT - currentImages.length);
    if (remain <= 0) {
      wx.showToast({ title: '最多插入 9 张图片', icon: 'none' });
      return;
    }

    let editorCtx = null;
    try {
      editorCtx = await this.ensureEditorContext();
      const chosen = await new Promise((resolve, reject) => {
        wx.chooseMedia({
          count: remain,
          mediaType: ['image'],
          sourceType: ['album', 'camera'],
          sizeType: ['compressed'],
          success: resolve,
          fail: reject,
        });
      });

      const files = (chosen.tempFiles || []).filter((item) => item && item.tempFilePath);
      if (!files.length) {
        wx.showToast({ title: '没有选到图片', icon: 'none' });
        return;
      }

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        if (file.size > MAX_IMAGE_SIZE) {
          wx.showToast({ title: '单张图片不能超过 5MB', icon: 'none' });
          continue;
        }

        wx.showLoading({ title: `上传图片 ${index + 1}/${files.length}` });
        const uploadResult = await api.uploadCommunityImage(file.tempFilePath);
        // 相对路径是后端约定的存储形式；提交与编辑器 HTML 字符串统一用相对路径
        const imageRelativeUrl = (uploadResult && uploadResult.url) || '';
        // 编辑器内显示需要完整 URL（编辑器是本地 webview 直接加载）
        const imageDisplayUrl = api.getImageUrl(imageRelativeUrl);
        if (!imageRelativeUrl) {
          throw new Error('图片地址无效');
        }
        if (!editorCtx || typeof editorCtx.insertImage !== 'function') {
          throw new Error('编辑器图片插入不可用');
        }

        // 记录本会话的"完整 → 相对"映射，供后续 _normalizeImageSrcsToRelative 反向使用
        if (!this._uploadedUrlMap) this._uploadedUrlMap = new Map();
        this._uploadedUrlMap.set(imageDisplayUrl, imageRelativeUrl);

        editorCtx.insertImage({
          src: imageDisplayUrl,
          width: '100%',
          success: () => {
            // 字符串快照用相对路径，与后端存储/列表展示链路一致
            this.data._editorHtml = `${this.data._editorHtml || ''}<img src="${imageRelativeUrl}" />`;
            // 触发编辑器快照，重新读取 text（同步字数），
            // 路径上的 HTML 会被 _normalizeImageSrcsToRelative 还原为相对路径
            setTimeout(() => {
              this._captureEditorSnapshot(editorCtx).catch(() => {});
            }, 0);
          },
        });
      }
    } catch (err) {
      const message = err && err.errMsg && /cancel/i.test(err.errMsg)
        ? ''
        : (err.message || '插入图片失败');
      if (message) {
        wx.showToast({ title: message, icon: 'none' });
      }
    } finally {
      wx.hideLoading();
    }
  },

  // 把编辑器返回的 HTML 中"完整 URL"形式的 <img src> 还原为本会话上传的"相对路径"
  // 这样不论 HTML 来源（onEditorInput / onEditorBlur / getContents），写入的 _editorHtml 都是相对路径
  // 后端存储 / 列表展示 / 详情展示链路统一以相对路径为约定
  _normalizeImageSrcsToRelative(html) {
    if (!html || !this._uploadedUrlMap || !this._uploadedUrlMap.size) return html || '';
    let normalized = html;
    this._uploadedUrlMap.forEach((relativeUrl, displayUrl) => {
      if (!displayUrl || !relativeUrl) return;
      const escaped = displayUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(<img[^>]+src=["'])${escaped}(["'])`, 'gi');
      normalized = normalized.replace(re, `$1${relativeUrl}$2`);
    });
    return normalized;
  },

  _extractImageUrls(html) {
    if (!html) return [];
    const matches = html.match(/<img[^>]+src=["']([^"']+)["']/gi) || [];
    return matches
      .map((item) => {
        const result = item.match(/src=["']([^"']+)["']/i);
        return result ? result[1] : null;
      })
      .filter(Boolean);
  },

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
      .replace(/\n{2,}/g, '\n')
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

    const editorContent = await this._readEditorContents();
    const html = (editorContent.html || this.data._editorHtml || '').trim();
    const text = this._htmlToText(editorContent.text || html);
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
      if (this.data.mode === 'channel') {
        await api.createCommunityChannelPost(this.data.channelId, {
          title,
          content: html,
          content_format: 'html',
          images,
        });
      } else if (this.data.mode === 'activity') {
        await api.createCommunityPost({
          activity_id: this.data.activityId,
          title,
          content: html,
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
