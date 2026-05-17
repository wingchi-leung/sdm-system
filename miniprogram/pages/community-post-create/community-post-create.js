const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');

const MAX_POSTER_SIZE = 5 * 1024 * 1024;
const COVER_UPLOAD_NOTICE_KEY = 'notice_cover_upload_ack_v1';

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
    activityId: null,
    activityName: '',
    activity: null,
    title: '',
    content: '',
    coverLocalPath: '',
    submitting: false,
    error: null,
  },

  resetSensitiveData() {
    this.setData({
      activity: null,
      title: '',
      content: '',
      coverLocalPath: '',
      submitting: false,
      error: null,
    });
  },

  ensureAdminAccess() {
    if (auth.isAdmin()) return true;
    this.resetSensitiveData();
    wx.showToast({ title: '请先使用管理员账号登录', icon: 'none' });
    setTimeout(() => wx.navigateBack(), 1200);
    return false;
  },

  async onLoad(options) {
    tenant.applyPageOptions(options);
    const activityId = Number(options.activityId || 0);
    if (!activityId) {
      this.setData({ error: '缺少活动参数' });
      return;
    }
    if (!this.ensureAdminAccess()) return;
    this.setData({
      activityId,
      activityName: decodeDisplayText(options.activityName),
    });
    try {
      const activity = await api.getActivity(activityId);
      if (!auth.canManageActivityType({
        id: activity.activity_type_id,
        name: activity.activity_type_name,
        code: activity.activity_type_code,
      })) {
        this.setData({ error: '当前账号无该活动的动态发布权限' });
        return;
      }
      this.setData({ activity });
    } catch (err) {
      this.setData({ error: err.message || '加载活动信息失败' });
    }
  },

  onShow() {
    if (!this.data.activityId) return;
    this.ensureAdminAccess();
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value, error: null });
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value, error: null });
  },

  onChooseCover() {
    const openAlbum = () => {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album'],
        sizeType: ['compressed'],
        success: (res) => {
          const file = (res.tempFiles || [])[0];
          if (!file) return;
          if (file.size > MAX_POSTER_SIZE) {
            wx.showToast({ title: '图片不能超过5MB', icon: 'none' });
            return;
          }
          this.setData({ coverLocalPath: file.tempFilePath, error: null });
        },
      });
    };

    if (wx.getStorageSync(COVER_UPLOAD_NOTICE_KEY)) {
      openAlbum();
      return;
    }

    wx.showModal({
      title: '提示',
      content: '将从相册选择图片，用于动态封面上传。',
      confirmText: '确认',
      success: (res) => {
        if (!res.confirm) return;
        wx.setStorageSync(COVER_UPLOAD_NOTICE_KEY, 1);
        openAlbum();
      },
    });
  },

  onRemoveCover() {
    this.setData({ coverLocalPath: '' });
  },

  async onSubmit() {
    if (!auth.isAdmin()) {
      this.ensureAdminAccess();
      return;
    }
    const title = (this.data.title || '').trim();
    const content = (this.data.content || '').trim();
    if (!title) {
      this.setData({ error: '请输入标题' });
      return;
    }
    if (!content) {
      this.setData({ error: '请输入正文' });
      return;
    }

    this.setData({ submitting: true, error: null });
    try {
      let coverUrl = null;
      if (this.data.coverLocalPath) {
        wx.showLoading({ title: '上传封面中' });
        const uploadResult = await api.uploadPoster(this.data.coverLocalPath);
        coverUrl = uploadResult.url;
      }
      await api.createCommunityPost({
        activity_id: this.data.activityId,
        title,
        content,
        cover_url: coverUrl,
      });
      wx.showToast({ title: '发布成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1000);
    } catch (err) {
      this.setData({ error: err.message || '发布失败' });
      return;
    } finally {
      wx.hideLoading();
      this.setData({ submitting: false });
    }
  },
});
