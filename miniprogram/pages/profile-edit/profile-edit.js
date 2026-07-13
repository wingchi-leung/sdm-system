const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');
const { getDefaultAvatarPath, normalizeAvatarValue, resolveAvatarDisplayUrl } = require('../../utils/avatar');

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
    choosingAvatar: false,
    avatarMenuVisible: false,
    avatarChanged: false,
    avatarUrl: '',
    avatarDisplayUrl: '',
    avatarTempPath: '',
    form: {
      name: '',
    },
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    this.loadProfile();
  },

  async loadProfile() {
    this.setData({ loading: true });
    try {
      const profile = await api.getUserProfile();
      const avatarUrl = normalizeAvatarValue(profile?.avatar_url || getDefaultAvatarPath());
      const avatarDisplayUrl = await resolveAvatarDisplayUrl(avatarUrl, profile?.update_time);
      const form = {
        name: profile?.name || '',
      };
      this.setData({
        form,
        avatarUrl,
        avatarDisplayUrl,
        avatarTempPath: '',
        avatarChanged: false,
        loading: false,
      });
    } catch (err) {
      if (auth.handleSessionExpired(err)) return;
      this.setData({
        loading: false,
      });
      wx.showToast({ title: err && err.message ? err.message : '加载资料失败', icon: 'none' });
    }
  },

  showAvatarMenu() {
    if (this.data.loading || this.data.choosingAvatar) {
      return;
    }
    this.setData({ avatarMenuVisible: true });
  },

  hideAvatarMenu() {
    if (!this.data.avatarMenuVisible) return;
    this.setData({ avatarMenuVisible: false });
  },

  noop() {},

  onWechatAvatarTap() {
    this._waitingWechatAvatar = true;
    if (this._wechatAvatarTimer) {
      clearTimeout(this._wechatAvatarTimer);
    }
    this._wechatAvatarTimer = setTimeout(() => {
      if (!this._waitingWechatAvatar) return;
      this._waitingWechatAvatar = false;
      wx.showToast({ title: '请在真机点击“微信头像”授权', icon: 'none' });
    }, 1200);
  },

  onChooseWechatAvatar(e) {
    this._waitingWechatAvatar = false;
    if (this._wechatAvatarTimer) {
      clearTimeout(this._wechatAvatarTimer);
      this._wechatAvatarTimer = null;
    }
    const nextAvatarUrl = e && e.detail && e.detail.avatarUrl ? e.detail.avatarUrl : '';
    if (!nextAvatarUrl) {
      wx.showToast({ title: '未获取到微信头像', icon: 'none' });
      this.hideAvatarMenu();
      return;
    }

    this.setData({
      avatarMenuVisible: false,
      avatarUrl: nextAvatarUrl,
      avatarDisplayUrl: nextAvatarUrl,
      avatarTempPath: nextAvatarUrl,
      avatarChanged: true,
    });
    return this.persistAvatarChange(nextAvatarUrl);
  },

  async persistAvatarChange(previewPath) {
    if (this.data.choosingAvatar) return;
    this.setData({ choosingAvatar: true });
    try {
      const uploadPath = await compressAvatarImage(previewPath || this.data.avatarTempPath);
      const uploadResult = await api.uploadAvatar(uploadPath);
      const avatarUrl = uploadResult.url || this.data.avatarUrl;
      const avatarDisplayUrl = await resolveAvatarDisplayUrl(avatarUrl);
      await api.updateUserAvatar(avatarUrl);
      this.setData({
        avatarUrl,
        avatarDisplayUrl: previewPath || avatarDisplayUrl || avatarUrl || this.data.avatarDisplayUrl,
        avatarTempPath: '',
        avatarChanged: false,
      });
      wx.showToast({ title: '头像已更新', icon: 'success' });
    } catch (err) {
      if (auth.handleSessionExpired(err)) return;
      this.setData({
        avatarChanged: false,
        avatarTempPath: '',
      });
      wx.showToast({ title: err && err.message ? err.message : '头像保存失败', icon: 'none' });
    } finally {
      this.setData({ choosingAvatar: false });
    }
  },

  chooseAvatarFromLibrary(sourceType) {
    if (this.data.choosingAvatar) return;
    this.setData({ choosingAvatar: true });
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: [sourceType],
      sizeType: ['compressed'],
      success: async (res) => {
        const file = (res.tempFiles || [])[0];
        if (!file || !file.tempFilePath) {
          wx.showToast({ title: '未选择头像', icon: 'none' });
          return;
        }
        const previewPath = await compressAvatarImage(file.tempFilePath);
        this.setData({
          avatarMenuVisible: false,
          avatarUrl: file.tempFilePath,
          avatarTempPath: file.tempFilePath,
          avatarDisplayUrl: previewPath || file.tempFilePath,
          avatarChanged: true,
          choosingAvatar: false,
        });
        await this.persistAvatarChange(file.tempFilePath);
      },
      fail: () => {
        wx.showToast({ title: '未选择头像', icon: 'none' });
        this.setData({ choosingAvatar: false });
      },
      complete: () => {
        if (this.data.choosingAvatar) {
          this.setData({ choosingAvatar: false });
        }
      },
    });
  },

  chooseAvatarFromAlbum() {
    this.hideAvatarMenu();
    this.chooseAvatarFromLibrary('album');
  },

  chooseAvatarFromCamera() {
    this.hideAvatarMenu();
    this.chooseAvatarFromLibrary('camera');
  },
});
