const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');
const contentUtils = require('../../utils/community-content');
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_IMAGE_COUNT = 9;

Page({
  data: {
    mode: 'channel',          // 'channel' | 'activity'
    channelId: null,
    postId: null,
    post: null,
    comments: [],
    loading: true,
    error: null,
    commentContent: '',
    commentImageLocalPaths: [],
    commentSubmitting: false,
    canComment: false,
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    const channelId = Number(options.channelId || 0);
    const postId = Number(options.id || 0);
    if (!postId) {
      this.setData({ loading: false, error: '缺少文章 ID' });
      return;
    }
    // 双模式：有 channelId 走 channel 版 API；否则走 activity 版 API（活动文章）
    const mode = channelId ? 'channel' : 'activity';
    this.setData({
      mode,
      channelId: channelId || null,
      postId,
      canComment: auth.isUser() || auth.isAdmin(),
    });
    this.loadPageData();
  },

  onShow() {
    this.setData({ canComment: auth.isUser() || auth.isAdmin() });
  },

  async loadPageData() {
    this.setData({ loading: true, error: null });
    const { mode, channelId, postId } = this.data;
    try {
      let post;
      let commentRes;
      if (mode === 'channel') {
        [post, commentRes] = await Promise.all([
          api.getCommunityChannelPostDetail(channelId, postId),
          api.getCommunityChannelComments(channelId, postId, { limit: 200 }),
        ]);
      } else {
        // activity 模式（活动文章）：channelId 为 null
        [post, commentRes] = await Promise.all([
          api.getCommunityPostDetail(postId),
          api.getCommunityComments(postId, { limit: 200 }),
        ]);
      }
      const parsed = this.parsePostContent(post.content || '', post.images || []);
      this.setData({
        post: {
          ...post,
          parsed,
          create_time_display: this.formatTime(post.create_time),
        },
        comments: (commentRes.items || []).map((item) => ({
          ...item,
          images: (item.images || []).map((url) => api.getImageUrl(url)),
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
    const parsedText = (parsed.text || '').trim();
    if (!normalizedBlocks.length && parsedText) {
      normalizedBlocks.push({ type: 'text', text: parsedText });
    }

    return {
      text: parsedText,
      blocks: normalizedBlocks,
      images: merged,
    };
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

  onChooseCommentImages() {
    const remain = MAX_IMAGE_COUNT - (this.data.commentImageLocalPaths || []).length;
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
            if (file.size > MAX_IMAGE_SIZE) {
              wx.showToast({ title: '单张图片不能超过5MB', icon: 'none' });
              return false;
            }
            return true;
          })
          .map((file) => file.tempFilePath);
        if (!selected.length) return;
        this.setData({
          commentImageLocalPaths: [...(this.data.commentImageLocalPaths || []), ...selected].slice(0, MAX_IMAGE_COUNT),
        });
      },
      fail: () => wx.showToast({ title: '选择图片失败', icon: 'none' }),
    });
  },

  onRemoveCommentImage(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (Number.isNaN(index)) return;
    const next = [...(this.data.commentImageLocalPaths || [])];
    next.splice(index, 1);
    this.setData({ commentImageLocalPaths: next });
  },

  onPreviewPostImage(e) {
    const current = e.currentTarget.dataset.url;
    const blocks = (this.data.post && this.data.post.parsed && this.data.post.parsed.blocks) || [];
    const urls = blocks
      .filter((block) => block.type === 'images')
      .flatMap((block) => block.images || []);
    if (!current || !urls.length) return;
    wx.previewImage({ current, urls });
  },

  onPreviewCommentImage(e) {
    const current = e.currentTarget.dataset.url;
    const commentIndex = Number(e.currentTarget.dataset.commentIndex);
    const imageIndex = Number(e.currentTarget.dataset.imageIndex);
    const comments = this.data.comments || [];
    const urls = Number.isNaN(commentIndex) ? [] : ((comments[commentIndex] && comments[commentIndex].images) || []);
    const safeCurrent = Number.isNaN(imageIndex) ? current : (urls[imageIndex] || current);
    if (!safeCurrent || !urls.length) return;
    wx.previewImage({ current: safeCurrent, urls });
  },

  async onSubmitComment() {
    const content = (this.data.commentContent || '').trim();
    if (!content) {
      wx.showToast({ title: '请输入评论内容', icon: 'none' });
      return;
    }
    if (!(auth.isUser() || auth.isAdmin())) {
      this.setData({ canComment: false });
      wx.showToast({ title: '当前账号不可发表评论', icon: 'none' });
      return;
    }
    this.setData({ commentSubmitting: true });
    try {
      const localPaths = this.data.commentImageLocalPaths || [];
      const uploadedUrls = [];
      for (let i = 0; i < localPaths.length; i += 1) {
        try {
          wx.showLoading({ title: `上传图片 ${i + 1}/${localPaths.length}` });
          const uploadResult = await api.uploadCommunityImage(localPaths[i]);
          uploadedUrls.push(uploadResult.url);
        } catch (uploadErr) {
          wx.hideLoading();
          const retry = await new Promise((resolve) => {
            wx.showModal({
              title: '上传失败',
              content: `第 ${i + 1} 张图片上传失败，是否重试？`,
              confirmText: '重试',
              cancelText: '取消',
              success: (res) => resolve(!!res.confirm),
              fail: () => resolve(false),
            });
          });
          if (retry) {
            i -= 1;
            continue;
          }
          throw uploadErr;
        }
      }
      wx.hideLoading();
      const { mode, channelId, postId } = this.data;
      let comment;
      if (mode === 'channel') {
        comment = await api.createCommunityChannelComment(channelId, postId, {
          content,
          images: uploadedUrls,
        });
      } else {
        // activity 模式（活动文章）：channelId 为 null
        comment = await api.createCommunityComment(postId, {
          content,
          images: uploadedUrls,
        });
      }
      this.setData({
        comments: [...this.data.comments, {
          ...comment,
          images: (comment.images || []).map((url) => api.getImageUrl(url)),
          create_time_display: this.formatTime(comment.create_time),
        }],
        commentContent: '',
        commentImageLocalPaths: [],
        commentSubmitting: false,
        post: this.data.post ? {
          ...this.data.post,
          comment_count: (this.data.post.comment_count || 0) + 1,
        } : this.data.post,
      });
      wx.showToast({ title: '评论成功', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      this.setData({ commentSubmitting: false });
      wx.showToast({ title: err.message || '评论失败', icon: 'none' });
    }
  },
});
