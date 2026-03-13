const api = require('../../utils/api');
const auth = require('../../utils/auth');

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
      identity_number: '',
      identity_type: '',
    },
    sexOptions: [
      { value: 'male', label: '男' },
      { value: 'female', label: '女' },
      { value: 'other', label: '其他' },
    ],
    sexIndex: 0,
    identityTypeOptions: [
      { value: '', label: '不填写证件' },
      { value: 'mainland', label: '大陆身份证' },
      { value: 'hongkong', label: '香港身份证' },
      { value: 'taiwan', label: '台湾身份证' },
      { value: 'foreign', label: '其他证件' },
    ],
    identityTypeIndex: 0,
    submitting: false,
    error: null,
  },

  onLoad() {
    // 记录进入绑定页面的时间
    this._enterTime = Date.now();
  },

  onUnload() {
    // 如果用户没有完成绑定就退出，清除登录状态
    if (!this._hasSubmitted) {
      auth.logout();
      wx.removeStorageSync('require_bind_info');

      // 延迟显示提示（因为页面正在卸载）
      setTimeout(() => {
        wx.showToast({
          title: '请完成信息绑定',
          icon: 'none',
          duration: 2000
        });
      }, 100);
    }
  },

  // 表单输入处理
  onNameInput(e) { this.setData({ 'formData.name': e.detail.value, error: null }); },
  onAgeInput(e) { this.setData({ 'formData.age': e.detail.value, error: null }); },
  onOccupationInput(e) { this.setData({ 'formData.occupation': e.detail.value, error: null }); },
  onIndustryInput(e) { this.setData({ 'formData.industry': e.detail.value, error: null }); },
  onPhoneInput(e) { this.setData({ 'formData.phone': e.detail.value, error: null }); },
  onEmailInput(e) { this.setData({ 'formData.email': e.detail.value, error: null }); },
  onIdentityNumberInput(e) { this.setData({ 'formData.identity_number': e.detail.value, error: null }); },

  onSexChange(e) {
    const index = parseInt(e.detail.value);
    this.setData({
      sexIndex: index,
      'formData.sex': this.data.sexOptions[index].value,
      error: null
    });
  },

  onIdentityTypeChange(e) {
    const index = parseInt(e.detail.value);
    this.setData({
      identityTypeIndex: index,
      'formData.identity_type': this.data.identityTypeOptions[index].value,
      error: null
    });
  },

  validateForm() {
    const { formData } = this.data;

    if (!formData.name || !formData.name.trim()) {
      return '请输入姓名';
    }
    if (!formData.age || formData.age < 0 || formData.age > 150) {
      return '请输入有效的年龄';
    }
    if (!formData.occupation || !formData.occupation.trim()) {
      return '请输入职业';
    }
    if (!formData.industry || !formData.industry.trim()) {
      return '请输入行业';
    }
    if (!formData.phone || !/^1[3-9]\d{9}$/.test(formData.phone)) {
      return '请输入有效的手机号';
    }
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      return '邮箱格式不正确';
    }

    return null;
  },

  submit() {
    const error = this.validateForm();
    if (error) {
      this.setData({ error });
      return;
    }

    this.setData({ submitting: true, error: null });

    const submitData = {
      name: this.data.formData.name.trim(),
      sex: this.data.formData.sex,
      age: parseInt(this.data.formData.age),
      occupation: this.data.formData.occupation.trim(),
      phone: this.data.formData.phone,
      email: this.data.formData.email || null,
      industry: this.data.formData.industry.trim(),
      identity_number: this.data.formData.identity_number || null,
      identity_type: this.data.formData.identity_type || null,
    };

    // 如果没有选择证件类型，清空证件号
    if (!submitData.identity_type) {
      submitData.identity_number = null;
    }

    api.bindUserInfo(submitData)
      .then(() => {
        this._hasSubmitted = true;
        wx.removeStorageSync('require_bind_info');
        wx.showToast({ title: '绑定成功', icon: 'success' });
        setTimeout(() => {
          wx.switchTab({
            url: '/pages/index/index'
          });
        }, 1000);
      })
      .catch((err) => {
        const msg = err && err.message ? err.message : String(err);
        this.setData({ error: msg, submitting: false });
      });
  },
});
