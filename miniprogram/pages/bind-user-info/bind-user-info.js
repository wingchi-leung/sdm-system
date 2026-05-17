const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');

const PHONE_PATTERN = /^1[3-9]\d{9}$/;

Page({
  data: {
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
    phoneReadonly: false,
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    const wechatPhone = wx.getStorageSync('wechat_phone');
    if (wechatPhone) {
      this.setData({
        formData: { ...this.data.formData, phone: wechatPhone },
        phoneReadonly: true,
      });
    }
  },

  onNameInput(e) { this.setData({ 'formData.name': e.detail.value, error: null }); },
  onAgeInput(e) { this.setData({ 'formData.age': e.detail.value.replace(/\D/g, ''), error: null }); },
  onOccupationInput(e) { this.setData({ 'formData.occupation': e.detail.value, error: null }); },
  onIndustryInput(e) { this.setData({ 'formData.industry': e.detail.value, error: null }); },
  onEmailInput(e) { this.setData({ 'formData.email': e.detail.value, error: null }); },
  onPhoneInput(e) {
    if (this.data.phoneReadonly) return;
    this.setData({ 'formData.phone': e.detail.value.replace(/\D/g, '').slice(0, 11), error: null });
  },
  onSexChange(e) {
    const index = parseInt(e.detail.value, 10);
    this.setData({ sexIndex: index, 'formData.sex': this.data.sexOptions[index].value, error: null });
  },

  validateForm() {
    const { formData } = this.data;
    if (!formData.name || !formData.name.trim()) return '请输入姓名';
    if (!formData.age || Number(formData.age) < 0 || Number(formData.age) > 150) return '请输入有效的年龄';
    if (!formData.occupation || !formData.occupation.trim()) return '请输入职业';
    if (!formData.industry || !formData.industry.trim()) return '请输入行业';
    if (!formData.phone) return '请输入有效的手机号';
    if (!this.data.phoneReadonly && !PHONE_PATTERN.test(formData.phone)) return '请输入有效的手机号';
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) return '邮箱格式不正确';
    return null;
  },

  submit() {
    const error = this.validateForm();
    if (error) {
      this.setData({ error });
      return;
    }

    this.setData({ submitting: true, error: null });
    const formData = this.data.formData;
    const submitData = {
      name: formData.name.trim(),
      sex: formData.sex,
      age: parseInt(formData.age, 10),
      occupation: formData.occupation.trim(),
      email: formData.email || null,
      industry: formData.industry.trim(),
    };
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


