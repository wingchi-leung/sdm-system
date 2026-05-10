const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');

// 微信支付实名认证小程序 appid（固定）
const WECHAT_REALNAME_APPID = 'wxb369391ce8a1a1c8';
// 调试模式：true=跳过微信实名验证，直接绑定（仅开发测试用）
const DEBUG_SKIP_REALNAME = true;

function validateIdentityNumber(identityType, identityNumber) {
  if (!identityNumber || !identityNumber.trim()) return '请输入证件号码';
  const num = identityNumber.trim();
  switch (identityType) {
    case 'mainland':
      if (!/^[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/.test(num)) {
        return '身份证号格式不正确，请输入有效的18位中国大陆身份证号';
      }
      break;
    case 'hongkong':
      if (!/^[A-Z]\d{6}\(\d\)$/.test(num)) return '香港身份证号格式不正确，正确格式如：A123456(7)';
      break;
    case 'taiwan':
      if (!/^[A-Z]\d{9}$/.test(num)) return '台湾身份证号格式不正确，应为10位（1位字母+9位数字）';
      break;
    case 'foreign':
      if (num.length < 5 || num.length > 50) return '证件号码长度应在5-50位之间';
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
      identity_type: '',
    },
    sexOptions: [{ value: 'male', label: '男' }, { value: 'female', label: '女' }],
    sexIndex: 0,
    identityTypeOptions: [
      { value: 'mainland', label: '大陆身份证' },
      { value: 'hongkong', label: '香港身份证' },
      { value: 'taiwan', label: '台湾身份证' },
      { value: 'foreign', label: '其他证件' },
    ],
    identityTypeIndex: -1,
    submitting: false,
    error: null,
    identityError: null,
    phoneReadonly: false,
    verifyingRealname: false,
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    this._enterTime = Date.now();
    const wechatPhone = wx.getStorageSync('wechat_phone');
    if (wechatPhone) {
      this.setData({ 'formData.phone': wechatPhone, phoneReadonly: true });
    }
  },

  onShow() {
    // 监听微信授权回调，带 auth_code 则进入静默验证流程
    if (DEBUG_SKIP_REALNAME) return; // 调试模式跳过

    const pages = getCurrentPages();
    const currentPage = pages[pages.length - 1];
    if (!currentPage) return;
    const options = currentPage.options || {};
    const authCode = options.auth_code;
    if (!authCode) return;
    this.exchangeTokenAndVerify(authCode);
  },

  onNameInput(e) { this.setData({ 'formData.name': e.detail.value, error: null }); },
  onAgeInput(e) {
    const val = e.detail.value.replace(/\D/g, '');
    this.setData({ 'formData.age': val, error: null });
  },
  onOccupationInput(e) { this.setData({ 'formData.occupation': e.detail.value, error: null }); },
  onIndustryInput(e) { this.setData({ 'formData.industry': e.detail.value, error: null }); },
  onEmailInput(e) { this.setData({ 'formData.email': e.detail.value, error: null }); },
  onPhoneInput(e) {
    if (this.data.phoneReadonly) return;
    const val = e.detail.value.replace(/\D/g, '').slice(0, 11);
    this.setData({ 'formData.phone': val, error: null });
  },
  onIdentityNumberInput(e) {
    this.setData({ 'formData.identity_number': e.detail.value, error: null, identityError: null });
  },
  onSexChange(e) {
    const index = parseInt(e.detail.value);
    this.setData({ sexIndex: index, 'formData.sex': this.data.sexOptions[index].value, error: null });
  },
  onIdentityTypeChange(e) {
    const index = parseInt(e.detail.value);
    this.setData({
      identityTypeIndex: index,
      'formData.identity_type': this.data.identityTypeOptions[index].value,
      'formData.identity_number': '',
      error: null,
      identityError: null,
    });
  },

  validateForm() {
    const { formData } = this.data;
    if (!formData.name || !formData.name.trim()) return '请输入姓名';
    if (!formData.age || formData.age < 0 || formData.age > 150) return '请输入有效的年龄';
    if (!formData.occupation || !formData.occupation.trim()) return '请输入职业';
    if (!formData.industry || !formData.industry.trim()) return '请输入行业';
    if (!formData.phone || !/^1[3-9]\d{9}$/.test(formData.phone)) return '请输入有效的手机号';
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) return '邮箱格式不正确';
    if (!formData.identity_type) return '请选择证件类型';
    if (!formData.identity_number || !formData.identity_number.trim()) return '请输入证件号码';
    const identityError = validateIdentityNumber(formData.identity_type, formData.identity_number);
    if (identityError) return identityError;
    return null;
  },

  submit() {
    this.setData({ identityError: null });
    const error = this.validateForm();
    if (error) { this.setData({ error }); return; }

    const formData = { ...this.data.formData };

    // 调试模式跳过微信实名验证，直接绑定
    if (DEBUG_SKIP_REALNAME) {
      wx.setStorageSync('pending_bind_form', formData);
      this.setData({ verifyingRealname: true, error: null });
      // 直接用假 auth_code 走验证流程（会失败但绑定仍成功）
      // 改为直接绑定，跳过验证
      this.setData({ verifyingRealname: false });
      this.doBind(formData);
      return;
    }

    // 正式流程：跳转微信授权获取 auth_code
    wx.setStorageSync('pending_bind_form', formData);
    this.setData({ verifyingRealname: true, error: null });

    wx.navigateToMiniProgram({
      appId: WECHAT_REALNAME_APPID,
      path: 'pages/auth/index',
      extraData: { auth_type: 'realname' },
      success: () => { console.log('跳转微信授权页成功'); },
      fail: (err) => {
        console.error('跳转失败', err);
        this.setData({ verifyingRealname: false, error: '无法打开微信授权，请确认微信版本支持此功能' });
      },
    });
  },

  exchangeTokenAndVerify(authCode) {
    const formData = wx.getStorageSync('pending_bind_form') || {};
    const { name, identity_number } = formData;
    if (!name || !identity_number) {
      this.setData({ verifyingRealname: false, error: '表单数据已过期，请重新填写' });
      return;
    }

    this.setData({ verifyingRealname: true, error: null });
    const that = this;

    // 步骤1：auth_code 换 access_token
    api.exchangeRealnameToken({ auth_code: authCode })
      .then((res) => {
        // 步骤2：实名验证（姓名+证件号加密传输）
        return api.verifyRealname({
          access_token: res.access_token,
          name: name.trim(),
          id_number: identity_number.trim(),
        });
      })
      .then((verifyRes) => {
        wx.removeStorageSync('pending_bind_form');
        if (verifyRes.verify_result) {
          // 实名验证通过，正式绑定信息
          that.doBind(formData);
        } else {
          const msg = verifyRes.message || '姓名与证件号不匹配，请核对后重新输入';
          that.setData({ verifyingRealname: false, error: msg });
        }
      })
      .catch((err) => {
        wx.removeStorageSync('pending_bind_form');
        const msg = err && err.message ? err.message : String(err);
        that.setData({ verifyingRealname: false, error: '实名验证失败：' + msg });
      });
  },

  doBind(formData) {
    this.setData({ submitting: true });
    const submitData = {
      name: formData.name.trim(),
      sex: formData.sex,
      age: parseInt(formData.age),
      occupation: formData.occupation.trim(),
      phone: formData.phone,
      email: formData.email || null,
      industry: formData.industry.trim(),
      identity_type: formData.identity_type,
      identity_number: formData.identity_number.trim(),
    };

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