const DEFAULT_MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const DEFAULT_MAX_IMAGE_COUNT = 9;
const DEFAULT_MAX_CONTENT_LENGTH = 10000;
const DEFAULT_INSERT_IMAGE_WIDTH = '68%';
const DEFAULT_INSERT_IMAGE_EXT_CLASS = 'editor--community-thumb-image';

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

function createCommunityEditorData({ titleMaxLength = 120 } = {}) {
  return {
    title: '',
    titleLength: 0,
    titleMaxLength,
    contentLength: 0,
    editorReady: false,
    submitting: false,
    error: null,
    _editorHtml: '',
  };
}

function createCommunityEditorMethods({
  titleMaxLength = 120,
  maxImageSize = DEFAULT_MAX_IMAGE_SIZE,
  maxImageCount = DEFAULT_MAX_IMAGE_COUNT,
  maxContentLength = DEFAULT_MAX_CONTENT_LENGTH,
  uploadImage = null,
  getImageUrl = null,
} = {}) {
  return {
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

    onTitleInput(e) {
      const title = (e.detail.value || '').slice(0, titleMaxLength);
      this.setData({
        title,
        titleLength: title.length,
        error: null,
      });
    },

    onEditorReady() {
      this.ensureEditorContext().catch(() => {});
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
      const remain = Math.max(0, maxImageCount - currentImages.length);
      if (remain <= 0) {
        wx.showToast({ title: `最多插入 ${maxImageCount} 张图片`, icon: 'none' });
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
          if (file.size > maxImageSize) {
            wx.showToast({ title: '单张图片不能超过 5MB', icon: 'none' });
            continue;
          }

          wx.showLoading({ title: `上传图片 ${index + 1}/${files.length}` });
          if (typeof uploadImage !== 'function') {
            throw new Error('图片上传方法不可用');
          }
          if (typeof getImageUrl !== 'function') {
            throw new Error('图片地址方法不可用');
          }

          const uploadResult = await uploadImage(file.tempFilePath);
          const imageRelativeUrl = (uploadResult && uploadResult.url) || '';
          const imageDisplayUrl = getImageUrl(imageRelativeUrl);
          if (!imageRelativeUrl) {
            throw new Error('图片地址无效');
          }
          if (!editorCtx || typeof editorCtx.insertImage !== 'function') {
            throw new Error('编辑器图片插入不可用');
          }

          if (!this._uploadedUrlMap) this._uploadedUrlMap = new Map();
          this._uploadedUrlMap.set(imageDisplayUrl, imageRelativeUrl);

          editorCtx.insertImage({
            src: imageDisplayUrl,
            width: DEFAULT_INSERT_IMAGE_WIDTH,
            extClass: DEFAULT_INSERT_IMAGE_EXT_CLASS,
            success: () => {
              this.data._editorHtml = `${this.data._editorHtml || ''}<img src="${imageRelativeUrl}" />`;
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

    _validateEditorContent(html, text) {
      const normalizedHtml = (html || '').trim();
      const normalizedText = this._htmlToText(text || normalizedHtml);
      if (!normalizedText) {
        throw new Error('请输入正文');
      }
      if (normalizedHtml.length > maxContentLength) {
        throw new Error('内容过长，请精简后再发布');
      }
      return {
        html: normalizedHtml,
        text: normalizedText,
      };
    },
  };
}

module.exports = {
  DEFAULT_MAX_IMAGE_SIZE,
  DEFAULT_MAX_IMAGE_COUNT,
  DEFAULT_MAX_CONTENT_LENGTH,
  DEFAULT_INSERT_IMAGE_WIDTH,
  DEFAULT_INSERT_IMAGE_EXT_CLASS,
  decodeDisplayText,
  getPlainTextLength,
  createCommunityEditorData,
  createCommunityEditorMethods,
};
