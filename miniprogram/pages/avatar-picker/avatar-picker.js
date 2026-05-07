const api = require('../../utils/api');
const tenant = require('../../utils/tenant');
const {
  getBuiltinAvatarList,
  resolveAvatarDisplayUrl,
} = require('../../utils/avatar');

Page({
  data: {
    loading: true,
    submitting: false,
    error: null,
    avatarOptions: [],
    selectedAvatarKey: '',
    customAvatarUrl: '',
    currentAvatarDisplayUrl: '',
    selectedAvatarDisplayUrl: '',
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
      const currentAvatarUrl = profile.avatar_url || avatarOptions[0].key;
      const displayUrl = await resolveAvatarDisplayUrl(currentAvatarUrl);
      this.setData({
        loading: false,
        avatarOptions,
        selectedAvatarKey: currentAvatarUrl,
        customAvatarUrl: avatarOptions.some((item) => item.key === currentAvatarUrl) ? '' : currentAvatarUrl,
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
        try {
          this.setData({ submitting: true, error: null });
          const uploadResult = await api.uploadAvatar(file.tempFilePath);
          const displayUrl = await resolveAvatarDisplayUrl(uploadResult.url);
          this.setData({
            selectedAvatarKey: uploadResult.url,
            customAvatarUrl: uploadResult.url,
            selectedAvatarDisplayUrl: displayUrl,
            submitting: false,
          });
        } catch (err) {
          this.setData({
            submitting: false,
            error: err && err.message ? err.message : '上传头像失败',
          });
        }
      },
      fail: () => {},
    });
  },

  async onSave() {
    if (this.data.submitting) return;
    const avatarUrl = this.data.selectedAvatarKey || this.data.customAvatarUrl;
    if (!avatarUrl) {
      this.setData({ error: '请选择一个头像' });
      return;
    }
    this.setData({ submitting: true, error: null });
    try {
      await api.updateUserAvatar(avatarUrl);
      wx.showToast({ title: '头像已更新', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 800);
    } catch (err) {
      this.setData({
        submitting: false,
        error: err && err.message ? err.message : '保存头像失败',
      });
      return;
    }
    this.setData({ submitting: false });
  },
});
