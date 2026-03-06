const api = require('../../utils/api');
const auth = require('../../utils/auth');

Page({
  data: {
    activity: null,
    name: '',
    phone: '',
    identityNumber: '',
    submitting: false,
    error: null,
  },

  onLoad(options) {
    try {
      const data = options.data ? decodeURIComponent(options.data) : '';
      const activity = data ? JSON.parse(data) : null;
      if (!activity) {
        wx.showToast({ title: '参数错误', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
        return;
      }
      this.setData({ activity });
    } catch (e) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value, error: null });
  },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value, error: null });
  },

  onIdInput(e) {
    this.setData({ identityNumber: e.detail.value, error: null });
  },

  submit() {
    const { activity, name, phone } = this.data;
    const identityNumber = (this.data.identityNumber || '').trim();
    if (!name || !name.trim()) {
      this.setData({ error: '请输入姓名' });
      return;
    }
    if (!phone || !phone.trim()) {
      this.setData({ error: '请输入手机号' });
      return;
    }
    this.setData({ submitting: true, error: null });
    api
      .registerParticipant({
        activity_id: activity.id,
        participant_name: name.trim(),
        phone: phone.trim(),
        identity_number: identityNumber || undefined,
      })
      .then(() => {
        wx.showToast({ title: '报名成功', icon: 'success' });
        setTimeout(() => {
          wx.navigateBack();
        }, 1200);
      })
      .catch((err) => {
        const msg = err && err.message ? err.message : String(err);
        this.setData({ error: msg, submitting: false });
      });
  },
});
