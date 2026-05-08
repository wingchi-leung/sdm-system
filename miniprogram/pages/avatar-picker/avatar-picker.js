const api = require('../../utils/api');
const tenant = require('../../utils/tenant');
const {
  getDefaultAvatarKey,
  getDefaultAvatarPath,
  getBuiltinAvatarList,
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
    uploading: false,
    saving: false,
    error: null,
    avatarOptions: [],
    selectedAvatarKey: '',
    customAvatarUrl: '',
    customAvatarPreviewUrl: '',
    currentAvatarDisplayUrl: '',
    selectedAvatarDisplayUrl: '',
    previewAnimation: null,
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    this.loadProfile();
  },

  async loadProfile() {
    this.setData({ loading: true, error: null });
    try {
      const profile = await api.getUserProfile();
      const avatarOptions = getBuiltinAvatarList();
      const currentAvatarUrl = normalizeAvatarValue(profile.avatar_url || avatarOptions[0].key);
      const displayUrl = await resolveAvatarDisplayUrl(currentAvatarUrl);
      this.setData({
        loading: false,
        uploading: false,
        saving: false,
        avatarOptions,
        selectedAvatarKey: currentAvatarUrl,
        customAvatarUrl: avatarOptions.some((item) => item.key === currentAvatarUrl) ? '' : currentAvatarUrl,
        customAvatarPreviewUrl: avatarOptions.some((item) => item.key === currentAvatarUrl) ? '' : displayUrl,
        currentAvatarDisplayUrl: displayUrl,
        selectedAvatarDisplayUrl: displayUrl,
      });
    } catch (err) {
      this.setData({
        loading: false,
        error: err && err.message ? err.message : '加载头像资料失败',
      });
    }
  },

  onPreviewImageError() {
    const fallbackKey = getDefaultAvatarKey();
    this.setData({
      selectedAvatarKey: fallbackKey,
      customAvatarUrl: '',
      customAvatarPreviewUrl: '',
      currentAvatarDisplayUrl: getDefaultAvatarPath(),
      selectedAvatarDisplayUrl: getDefaultAvatarPath(),
      error: '旧头像地址已失效，已为你切换到默认头像',
    });
  },

  runPreviewSpin() {
    const animation = wx.createAnimation({
      duration: 820,
      timingFunction: 'ease-in-out',
    });
    animation.rotate(0).step({ duration: 0 });
    this.setData({ previewAnimation: animation.export() });
    setTimeout(() => {
      animation.rotate(1080).step();
      this.setData({ previewAnimation: animation.export() });
    }, 20);
  },

  async onSelectBuiltinAvatar(e) {
    const { key } = e.currentTarget.dataset;
    if (!key) return;
    const displayUrl = await resolveAvatarDisplayUrl(key);
    this.setData({
      selectedAvatarKey: key,
      customAvatarUrl: '',
      selectedAvatarDisplayUrl: displayUrl,
      error: null,
    });
    this.runPreviewSpin();
  },

  onChooseAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: async (res) => {
        const file = (res.tempFiles || [])[0];
        if (!file) return;
        const previousState = {
          selectedAvatarKey: this.data.selectedAvatarKey,
          customAvatarUrl: this.data.customAvatarUrl,
          customAvatarPreviewUrl: this.data.customAvatarPreviewUrl,
          selectedAvatarDisplayUrl: this.data.selectedAvatarDisplayUrl,
        };
        try {
          this.setData({
            uploading: true,
            error: null,
            selectedAvatarDisplayUrl: file.tempFilePath,
            customAvatarPreviewUrl: file.tempFilePath,
          });
          const uploadPath = await compressAvatarImage(file.tempFilePath);
          const uploadResult = await api.uploadAvatar(uploadPath);
          this.setData({
            selectedAvatarKey: uploadResult.url,
            customAvatarUrl: uploadResult.url,
            uploading: false,
          });
        } catch (err) {
          this.setData({
            uploading: false,
            selectedAvatarKey: previousState.selectedAvatarKey,
            customAvatarUrl: previousState.customAvatarUrl,
            customAvatarPreviewUrl: previousState.customAvatarPreviewUrl,
            selectedAvatarDisplayUrl: previousState.selectedAvatarDisplayUrl,
            error: err && err.message ? err.message : '上传头像失败',
          });
        }
      },
      fail: () => {},
    });
  },

  async onSave() {
    if (this.data.uploading || this.data.saving) return;
    const avatarUrl = this.data.selectedAvatarKey || this.data.customAvatarUrl;
    if (!avatarUrl) {
      this.setData({ error: '请选择一个头像' });
      return;
    }
    this.setData({ saving: true, error: null });
    try {
      await api.updateUserAvatar(avatarUrl);
      wx.showToast({ title: '头像已更新', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 800);
    } catch (err) {
      this.setData({
        saving: false,
        error: err && err.message ? err.message : '保存头像失败',
      });
      return;
    }
    this.setData({ saving: false });
  },
});
