const api = require('../../utils/api');
const auth = require('../../utils/auth');
const config = require('../../config/index');

Page({
  data: {
    name: '',
    description: '',
    avatarUrl: '',
    avatarTemp: '',
    nameError: '',
    submitting: false,
    uploading: false,
  },

  onLoad() {
    // 权限前置校验:非管理员直接返回
    if (!auth.isAdmin()) {
      wx.showToast({ title: '仅管理员可创建频道', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  onNameInput(e) {
    const name = e.detail.value || '';
    this.setData({
      name,
      nameError: name.length > 32 ? '频道名称不能超过 32 个字符' : '',
    });
  },

  onDescriptionInput(e) {
    this.setData({ description: e.detail.value || '' });
  },

  onChooseAvatar() {
    if (this.data.uploading) return;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempPath = res.tempFiles[0]?.tempFilePath;
        if (!tempPath) return;
        this.setData({ avatarTemp: tempPath });
        this._uploadAvatar(tempPath);
      },
    });
  },

  async _uploadAvatar(tempPath) {
    this.setData({ uploading: true });
    const token = wx.getStorageSync('access_token') || '';
    try {
      const uploadRes = await new Promise((resolve, reject) => {
        wx.uploadFile({
          url: `${config.baseUrl}/community/channels/avatar-upload`,
          filePath: tempPath,
          name: 'file',
          header: { Authorization: `Bearer ${token}` },
          success: (res) => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(JSON.parse(res.data));
              } catch {
                resolve(res.data);
              }
            } else {
              let detail = '上传失败';
              try {
                detail = JSON.parse(res.data)?.detail || detail;
              } catch {}
              reject(new Error(detail));
            }
          },
          fail: (err) => reject(err),
        });
      });
      this.setData({ avatarUrl: uploadRes.avatar_url || '' });
    } catch (err) {
      wx.showToast({ title: err.message || '头像上传失败', icon: 'none' });
      this.setData({ avatarTemp: '' });
    } finally {
      this.setData({ uploading: false });
    }
  },

  async onSubmit() {
    const { name, description, avatarUrl, submitting, uploading, nameError } = this.data;

    if (submitting || uploading) return;

    const trimName = name.trim();
    if (!trimName) {
      this.setData({ nameError: '请输入频道名称' });
      return;
    }
    if (trimName.length > 32) {
      this.setData({ nameError: '频道名称不能超过 32 个字符' });
      return;
    }
    if (nameError) return;

    this.setData({ submitting: true });
    try {
      await api.createCommunityChannel({
        name: trimName,
        description: description.trim() || undefined,
        avatar_url: avatarUrl || undefined,
      });
      // 通知社区首页刷新频道列表
      getApp().globalData = getApp().globalData || {};
      getApp().globalData.channelListDirty = true;
      wx.showToast({ title: '创建成功', icon: 'success' });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 1200);
    } catch (err) {
      wx.showToast({ title: err.message || '创建失败，请重试', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
