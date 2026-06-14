const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');
const { resolveAvatarDisplayUrl } = require('../../utils/avatar');

const PHONE_PATTERN = /^1[3-9]\d{9}$/;
const AVATAR_UPLOAD_NOTICE_KEY = 'notice_bind_avatar_upload_ack_v1';

function normalizeAgeValue(value) {
  return String(value == null ? '' : value).replace(/[^\d]/g, '').slice(0, 3);
}

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
    avatarUrl: '',
    avatarTemp: '',
    avatarDisplayUrl: '',
    avatarUploading: false,
    formData: {
      name: '',
      sex: 'male',
      age: '',
      occupation: '',
      phone: '',
      email: '',
      industry: '',
    },
    sexOptions: [{ value: 'male', label: '男' }, { value: 'female', label: '女' }],
    sexIndex: 0,
    submitting: false,
    error: null,
    loading: false,
    phoneReadonly: false,
    focusedField: '',
  },

  redirectingToLogin: false,

  goToLogin() {
    if (this.redirectingToLogin) return;
    this.redirectingToLogin = true;
    const loginUrl = typeof tenant.appendTenantToUrl === 'function'
      ? tenant.appendTenantToUrl('/pages/login/login')
      : '/pages/login/login';
    wx.reLaunch({
      url: loginUrl,
    });
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    if (!auth.hasPendingBindInfo()) {
      this.goToLogin();
      return;
    }
    const wechatPhone = wx.getStorageSync('wechat_phone');
    if (wechatPhone) {
      this.setData({
        formData: { ...this.data.formData, phone: wechatPhone },
        phoneReadonly: true,
      });
    }
  },

  onChooseAvatar() {
    if (this.data.avatarUploading) return;

    const openAlbum = () => {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
        success: async (res) => {
          const file = (res.tempFiles || [])[0];
          if (!file || !file.tempFilePath) return;

          const previousState = {
            avatarUrl: this.data.avatarUrl,
            avatarTemp: this.data.avatarTemp,
            avatarDisplayUrl: this.data.avatarDisplayUrl,
          };

          try {
            this.setData({
              avatarUploading: true,
              avatarTemp: file.tempFilePath,
              avatarDisplayUrl: file.tempFilePath,
              error: null,
            });
            const uploadPath = await compressAvatarImage(file.tempFilePath);
            const uploadResult = await api.uploadAvatar(uploadPath);
            const avatarDisplayUrl = await resolveAvatarDisplayUrl(uploadResult.url || '');
            this.setData({
              avatarUrl: uploadResult.url || '',
              avatarTemp: uploadResult.url || '',
              avatarDisplayUrl: avatarDisplayUrl || uploadResult.url || '',
              avatarUploading: false,
            });
          } catch (err) {
            this.setData({
              avatarUploading: false,
              avatarUrl: previousState.avatarUrl,
              avatarTemp: previousState.avatarTemp,
              avatarDisplayUrl: previousState.avatarDisplayUrl,
              error: err && err.message ? err.message : '上传头像失败',
            });
          }
        },
        fail: () => {
          wx.showToast({ title: '未选择头像', icon: 'none' });
        },
      });
    };

    if (wx.getStorageSync(AVATAR_UPLOAD_NOTICE_KEY)) {
      openAlbum();
      return;
    }

    wx.showModal({
      title: '提示',
      content: '建议先上传一张头像，完善资料后会在个人中心与社区中展示。',
      confirmText: '去上传',
      success: (res) => {
        if (!res.confirm) return;
        wx.setStorageSync(AVATAR_UPLOAD_NOTICE_KEY, 1);
        openAlbum();
      },
    });
  },

  onRemoveAvatar() {
    this.setData({
      avatarUrl: '',
      avatarTemp: '',
      avatarDisplayUrl: '',
      error: null,
    });
  },

  onBack() {
    this.goToLogin();
  },

  onUnload() {
    if (auth.hasPendingBindInfo()) {
      this.goToLogin();
    }
  },

  onFieldFocus(e) {
    const field = e.currentTarget.dataset.field || '';
    if (!field) return;
    this.setData({ focusedField: field });
  },

  onFieldBlur(e) {
    const field = e.currentTarget.dataset.field || '';
    if (!field) return;
    if (this.data.focusedField !== field) return;
    this.setData({ focusedField: '' });
  },

  onNameInput(e) { this.setData({ 'formData.name': e.detail.value, error: null }); },
  onAgeInput(e) {
    this.setData({
      'formData.age': normalizeAgeValue(e.detail.value),
      error: null,
    });
  },
  onOccupationInput(e) { this.setData({ 'formData.occupation': e.detail.value, error: null }); },
  onIndustryInput(e) { this.setData({ 'formData.industry': e.detail.value, error: null }); },
  onEmailInput(e) { this.setData({ 'formData.email': e.detail.value, error: null }); },
  onPhoneInput(e) {
    if (this.data.phoneReadonly) return;
    this.setData({ 'formData.phone': e.detail.value.replace(/\D/g, '').slice(0, 11), error: null });
  },
  onSexChange(e) {
    const fromPicker = e && e.detail && typeof e.detail.value !== 'undefined' && !e.currentTarget;
    const value = fromPicker
      ? this.data.sexOptions[parseInt(e.detail.value, 10)].value
      : e.currentTarget.dataset.value;
    const index = this.data.sexOptions.findIndex((opt) => opt.value === value);
    this.setData({ sexIndex: index < 0 ? 0 : index, 'formData.sex': value, error: null });
  },

  validateForm() {
    const { formData } = this.data;
    if (!formData.name || !formData.name.trim()) return '请输入姓名';
    const age = normalizeAgeValue(formData.age);
    if (!age || Number(age) < 0 || Number(age) > 150) return '请输入有效的年龄';
    if (!formData.occupation || !formData.occupation.trim()) return '请输入职业';
    if (!formData.industry || !formData.industry.trim()) return '请输入行业';
    if (!formData.phone) return '请输入有效的手机号';
    if (!this.data.phoneReadonly && !PHONE_PATTERN.test(formData.phone)) return '请输入有效的手机号';
    if (!formData.email || !formData.email.trim()) return '请输入邮箱';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) return '邮箱格式不正确';
    return null;
  },

  submit() {
    const error = this.validateForm();
    if (error) {
      this.setData({ error });
      return;
    }
    if (this.data.avatarUploading) {
      this.setData({ error: '头像上传中，请稍候' });
      return;
    }

    this.setData({ submitting: true, error: null });
    const formData = this.data.formData;
    const submitData = {
      name: formData.name.trim(),
      sex: formData.sex,
      age: parseInt(normalizeAgeValue(formData.age), 10),
      occupation: formData.occupation.trim(),
      email: formData.email.trim(),
      industry: formData.industry.trim(),
    };
    if (this.data.avatarUrl) {
      submitData.avatar_url = this.data.avatarUrl;
    }
    if (PHONE_PATTERN.test(formData.phone)) {
      submitData.phone = formData.phone;
    }

    api.bindUserInfo(submitData)
      .then(() => {
        auth.clearRequireBindInfo();
        wx.showToast({ title: '绑定成功', icon: 'success' });
        setTimeout(() => { wx.switchTab({ url: '/pages/index/index' }); }, 1000);
      })
      .catch((err) => {
        const msg = err && err.message ? err.message : String(err);
        this.setData({ submitting: false, error: msg });
      });
  },
});
