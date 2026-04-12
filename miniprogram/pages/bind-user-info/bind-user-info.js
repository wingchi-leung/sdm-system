const api = require('../../utils/api');
const auth = require('../../utils/auth');

// 身份证号格式校验函数
function validateIdentityNumber(identityType, identityNumber) {
  if (!identityNumber || !identityNumber.trim()) {
    return '请输入证件号码';
  }
  const num = identityNumber.trim();

  switch (identityType) {
    case 'mainland':
      // 中国大陆身份证：18位，最后一位可以是X
      if (!/^[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/.test(num)) {
        return '身份证号格式不正确，请输入有效的18位中国大陆身份证号';
      }
      break;
    case 'hongkong':
      // 香港身份证：格式如 A123456(7)
      if (!/^[A-Z]\d{6}\(\d\)$/.test(num)) {
        return '香港身份证号格式不正确，正确格式如：A123456(7)';
      }
      break;
    case 'taiwan':
      // 台湾身份证：10位，首位字母+9位数字
      if (!/^[A-Z]\d{9}$/.test(num)) {
        return '台湾身份证号格式不正确，应为10位（1位字母+9位数字）';
      }
      break;
    case 'foreign':
      // 其他证件：只做基本长度验证
      if (num.length < 5 || num.length > 50) {
        return '证件号码长度应在5-50位之间';
      }
      break;
    default:
      return '请选择证件类型';
  }
  return null;
}

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
      identity_type: '',   // 初始未选择证件类型
    },
    sexOptions: [
      { value: 'male', label: '男' },
      { value: 'female', label: '女' },
      { value: 'other', label: '其他' },
    ],
    sexIndex: 0,
    identityTypeOptions: [
      { value: 'mainland', label: '大陆身份证' },
      { value: 'hongkong', label: '香港身份证' },
      { value: 'taiwan', label: '台湾身份证' },
      { value: 'foreign', label: '其他证件' },
    ],
    identityTypeIndex: -1,  // -1 表示未选择，选择后才显示证件号输入框
    submitting: false,
    error: null,
    identityError: null, // 身份证格式错误提示
  },

  onLoad() {
    // 记录进入绑定页面的时间
    this._enterTime = Date.now();

    // 获取微信授权的手机号
    const wechatPhone = wx.getStorageSync('wechat_phone');
    if (wechatPhone) {
      this.setData({
        'formData.phone': wechatPhone,
      });
    }
  },

  onUnload() {
    // 如果用户没有完成绑定就退出，清除登录状态
    if (!this._hasSubmitted) {
      auth.logout();
      wx.removeStorageSync('require_bind_info');
      wx.removeStorageSync('wechat_phone');

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
  onEmailInput(e) { this.setData({ 'formData.email': e.detail.value, error: null }); },
  onIdentityNumberInput(e) {
    this.setData({
      'formData.identity_number': e.detail.value,
      error: null,
      identityError: null,
    });
  },

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
      'formData.identity_number': '', // 切换类型时清空证件号
      error: null,
      identityError: null,
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

    // 身份证必填校验
    if (!formData.identity_type) {
      return '请选择证件类型';
    }
    if (!formData.identity_number || !formData.identity_number.trim()) {
      return '请输入证件号码';
    }

    // 身份证格式校验
    const identityError = validateIdentityNumber(formData.identity_type, formData.identity_number);
    if (identityError) {
      return identityError; // 统一通过返回值传递错误
    }

    return null;
  },

  submit() {
    // 先清空旧的身份证错误
    this.setData({ identityError: null });

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
      identity_type: this.data.formData.identity_type,
      identity_number: this.data.formData.identity_number.trim(),
    };

    api.bindUserInfo(submitData)
      .then(() => {
        this._hasSubmitted = true;
        wx.removeStorageSync('require_bind_info');
        wx.removeStorageSync('wechat_phone');
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
