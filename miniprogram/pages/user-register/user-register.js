const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');

Page({
  data: {
    name: '',
    phone: '',
    password: '',
    email: '',
    submitting: false,
    error: null,
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value, error: null });
  },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value, error: null });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value, error: null });
  },

  onEmailInput(e) {
    this.setData({ email: e.detail.value, error: null });
  },

  submit() {
    const { name, phone, password } = this.data;
    const email = (this.data.email || '').trim();
    if (!name || !name.trim()) {
      this.setData({ error: '请输入姓名' });
      return;
    }
    if (!phone || !phone.trim()) {
      this.setData({ error: '请输入手机号' });
      return;
    }
    if (!password) {
      this.setData({ error: '请输入密码' });
      return;
    }
    this.setData({ submitting: true, error: null });
    api
      .registerUser({ name: name.trim(), phone: phone.trim(), password, email: email || undefined })
      .then(() => {
        return api.userLogin(phone.trim(), password);
      })
      .then((res) => {
        auth.saveUserToken({
          accessToken: res.access_token,
          userId: res.user_id,
          userName: res.user_name || name.trim(),
        });
        wx.showToast({ title: '注册成功', icon: 'success' });
        setTimeout(() => {
          wx.navigateBack();
        }, 1000);
      })
      .catch((err) => {
        const msg = err && err.message ? err.message : String(err);
        this.setData({ error: msg, submitting: false });
      });
  },
});
