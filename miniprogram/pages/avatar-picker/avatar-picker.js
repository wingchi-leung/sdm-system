const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');
const {
  getDefaultAvatarPath,
  normalizeAvatarValue,
  resolveAvatarDisplayUrl,
} = require('../../utils/avatar');

function compressAvatarImage(filePath) {
  if (!filePath || typeof wx.compressImage !== 'function') {
    return Promise.resolve(filePath);
  }

  return new Promise((resolve) => {
    wx.compressImage({
      src: filePath,
      quality: 72,
      success: (res) => resolve(res.tempFilePath || filePath),
      fail: () => resolve(filePath),
    });
  });
}

Page({
  data: {
    loading: true,
    choosing: false,
    saving: false,
    uploading: false,
    error: null,
    currentAvatarUrl: '',
    currentAvatarDisplayUrl: '',
    selectedAvatarDisplayUrl: '',
    selectedAvatarTempPath: '',
    hasChanged: false,
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    this.loadProfile();
  },

  async loadProfile() {
    this.setData({ loading: true, error: null });
    try {
      const profile = await api.getUserProfile();
      const currentAvatarUrl = normalizeAvatarValue(profile.avatar_url || getDefaultAvatarPath());
      const currentAvatarDisplayUrl = await resolveAvatarDisplayUrl(
        currentAvatarUrl,
        profile.update_time,
      );
      this.setData({
        loading: false,
        currentAvatarUrl,
        currentAvatarDisplayUrl,
        selectedAvatarDisplayUrl: currentAvatarDisplayUrl,
        selectedAvatarTempPath: '',
        hasChanged: false,
      });
    } catch (err) {
      if (auth.handleSessionExpired(err)) return;
      this.setData({
        loading: false,
        error: err && err.message ? err.message : '加载头像资料失败',
      });
    }
  },

  getPreviewUrl() {
    return this.data.selectedAvatarDisplayUrl || this.data.currentAvatarDisplayUrl || getDefaultAvatarPath();
  },

  onPreviewTap() {
    const current = this.getPreviewUrl();
    if (!current) return;
    wx.previewImage({
      current,
      urls: [current],
    });
  },

  onChooseAvatar() {
    if (this.data.choosing || this.data.saving) return;

    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: async (res) => {
        const file = (res.tempFiles || [])[0];
        if (!file || !file.tempFilePath) return;
        const previewPath = await compressAvatarImage(file.tempFilePath);
        this.setData({
          choosing: true,
          uploading: true,
          error: null,
          selectedAvatarTempPath: file.tempFilePath,
          selectedAvatarDisplayUrl: previewPath || file.tempFilePath,
          hasChanged: true,
        });
        this.setData({ choosing: false, uploading: false });
      },
      fail: () => {
        wx.showToast({ title: '未选择头像', icon: 'none' });
      },
    });
  },

  onCancel() {
    wx.navigateBack();
  },

  async onSave() {
    if (this.data.choosing || this.data.saving) return;

    const nextPreview = this.data.selectedAvatarDisplayUrl || this.data.currentAvatarDisplayUrl;
    if (!this.data.hasChanged && nextPreview === this.data.currentAvatarDisplayUrl) {
      wx.navigateBack();
      return;
    }

    this.setData({ saving: true, error: null });

    try {
      let avatarUrl = this.data.currentAvatarUrl;
      if (this.data.selectedAvatarTempPath) {
        const uploadPath = await compressAvatarImage(this.data.selectedAvatarTempPath);
        const uploadResult = await api.uploadAvatar(uploadPath);
        avatarUrl = uploadResult.url || avatarUrl;
      }

      await api.updateUserAvatar(avatarUrl);
      const resolvedDisplayUrl = await resolveAvatarDisplayUrl(avatarUrl);
      this.setData({
        currentAvatarUrl: avatarUrl,
        currentAvatarDisplayUrl: resolvedDisplayUrl || this.data.currentAvatarDisplayUrl,
        selectedAvatarDisplayUrl: resolvedDisplayUrl || this.data.selectedAvatarDisplayUrl,
        selectedAvatarTempPath: '',
        hasChanged: false,
      });
      wx.showToast({ title: '头像已更新', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 800);
      return true;
    } catch (err) {
      if (auth.handleSessionExpired(err)) return;
      this.setData({
        error: err && err.message ? err.message : '保存头像失败',
      });
      return false;
    } finally {
      this.setData({ saving: false });
    }
  },
});
