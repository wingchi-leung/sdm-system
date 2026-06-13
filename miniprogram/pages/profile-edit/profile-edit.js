const api = require('../../utils/api');
const tenant = require('../../utils/tenant');

Page({
  data: {
    loading: true,
    submitting: false,
    error: '',
    sexOptions: [
      { value: 'male', label: '男' },
      { value: 'female', label: '女' },
    ],
    sexIndex: 0,
    form: {
      name: '',
      sex: 'male',
      age: '',
      occupation: '',
      industry: '',
      email: '',
    },
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    this.loadProfile();
  },

  async loadProfile() {
    this.setData({ loading: true, error: '' });
    try {
      const profile = await api.getUserProfile();
      const form = {
        name: profile?.name || '',
        sex: profile?.sex === 'F' ? 'female' : 'male',
        age: profile?.age == null ? '' : String(profile.age),
        occupation: profile?.occupation || '',
        industry: profile?.industry || '',
        email: profile?.email || '',
      };
      this.setData({
        form,
        sexIndex: form.sex === 'female' ? 1 : 0,
        loading: false,
      });
    } catch (err) {
      this.setData({
        loading: false,
        error: err && err.message ? err.message : '加载资料失败',
      });
    }
  },

  onNameInput(e) { this.setData({ 'form.name': e.detail.value, error: '' }); },
  onAgeInput(e) { this.setData({ 'form.age': e.detail.value.replace(/[^\d]/g, ''), error: '' }); },
  onOccupationInput(e) { this.setData({ 'form.occupation': e.detail.value, error: '' }); },
  onIndustryInput(e) { this.setData({ 'form.industry': e.detail.value, error: '' }); },
  onEmailInput(e) { this.setData({ 'form.email': e.detail.value, error: '' }); },
  onSexChange(e) {
    const fromPicker = e && e.detail && typeof e.detail.value !== 'undefined' && !e.currentTarget;
    const value = fromPicker
      ? (this.data.sexOptions[Number(e.detail.value)] || this.data.sexOptions[0]).value
      : e.currentTarget.dataset.value;
    const idx = this.data.sexOptions.findIndex((opt) => opt.value === value);
    this.setData({ sexIndex: idx < 0 ? 0 : idx, 'form.sex': value, error: '' });
  },

  validateForm() {
    const form = this.data.form;
    if (!form.name || !form.name.trim()) return '请输入姓名';
    if (!form.occupation || !form.occupation.trim()) return '请输入职业';
    if (!form.industry || !form.industry.trim()) return '请输入行业';
    const age = Number(form.age);
    if (!Number.isInteger(age) || age < 0 || age > 150) return '年龄需为 0-150 的整数';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return '邮箱格式不正确';
    return '';
  },

  async onSubmit() {
    const error = this.validateForm();
    if (error) {
      this.setData({ error });
      return;
    }

    this.setData({ submitting: true, error: '' });
    try {
      const payload = {
        name: this.data.form.name.trim(),
        sex: this.data.form.sex,
        age: Number(this.data.form.age),
        occupation: this.data.form.occupation.trim(),
        industry: this.data.form.industry.trim(),
        email: (this.data.form.email || '').trim(),
      };
      await api.updateMyProfile(payload);
      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 700);
    } catch (err) {
      this.setData({ error: err && err.message ? err.message : '保存失败' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});

