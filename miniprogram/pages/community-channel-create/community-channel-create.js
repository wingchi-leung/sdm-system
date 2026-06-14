const api = require('../../utils/api');
const auth = require('../../utils/auth');
const config = require('../../config/index');

Page({
  data: {
    pageTitle: '创建社区',
    heroTitle: '创建社区',
    submitText: '创建社区',
    editMode: false,
    channelId: 0,
    name: '',
    description: '',
    avatarUrl: '',
    avatarTemp: '',
    nameError: '',
    submitting: false,
    uploading: false,
    loadingDetail: false,
  },

  async loadChannelDetail(channelId) {
    if (!channelId) return;
    this.setData({ loadingDetail: true });
    try {
      const detail = await api.getCommunityChannelDetail(channelId);
      if (String(detail.role || '') !== 'admin') {
        wx.showToast({ title: '仅社区管理员可编辑社区', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
        return;
      }
      this.setData({
        name: detail.name || '',
        description: detail.description || '',
        avatarUrl: detail.avatar_url || '',
        avatarTemp: detail.avatar_url || '',
      });
    } catch (err) {
      wx.showToast({ title: err.message || '加载社区信息失败', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    } finally {
      this.setData({ loadingDetail: false });
    }
  },

  onLoad(options = {}) {
    const channelId = Number(options.channelId || 0);
    const editMode = channelId > 0;
    this.setData({
      editMode,
      channelId,
      pageTitle: editMode ? '编辑社区' : '创建社区',
      heroTitle: editMode ? '编辑社区' : '创建社区',
      submitText: editMode ? '保存修改' : '创建社区',
    });
    if (typeof wx.setNavigationBarTitle === 'function') {
      wx.setNavigationBarTitle({ title: editMode ? '编辑社区' : '创建社区' });
    }

    // 权限前置校验:非管理员直接返回
    if (!auth.isAdmin()) {
      wx.showToast({ title: editMode ? '仅管理员可编辑社区' : '仅管理员可创建社区', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    if (editMode) {
      this.loadChannelDetail(channelId);
    }
  },

  onNameInput(e) {
    const name = e.detail.value || '';
    this.setData({
      name,
      nameError: name.length > 32 ? '社区名称不能超过 32 个字符' : '',
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
    const { name, description, avatarUrl, submitting, uploading, nameError, editMode, channelId } = this.data;

    if (submitting || uploading) return;

    const trimName = name.trim();
    if (!trimName) {
      this.setData({ nameError: '请输入社区名称' });
      return;
    }
    if (trimName.length > 32) {
      this.setData({ nameError: '社区名称不能超过 32 个字符' });
      return;
    }
    if (nameError) return;

    this.setData({ submitting: true });
    try {
      const payload = {
        name: trimName,
        description: description.trim() || undefined,
        avatar_url: avatarUrl || undefined,
      };
      if (editMode) {
        await api.updateCommunityChannel(channelId, payload);
      } else {
        await api.createCommunityChannel(payload);
      }
      // 通知社区首页刷新社区列表
      getApp().globalData = getApp().globalData || {};
      getApp().globalData.channelListDirty = true;
      wx.showToast({ title: editMode ? '保存成功' : '创建成功', icon: 'success' });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 1200);
    } catch (err) {
      wx.showToast({ title: err.message || (editMode ? '保存失败，请重试' : '创建失败，请重试'), icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
