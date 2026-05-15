const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');

// 微信城市服务小程序 appid（用于实名信息校验，固定值）
const WECHAT_CITY_SERVICE_APPID = 'wx308bd2aeb83d3345';
const WECHAT_CITY_SERVICE_PATH = 'subPages/city/wxpay-auth/main';
// 调试模式：true=跳过微信实名验证，直接绑定（仅开发测试用）
const DEBUG_SKIP_REALNAME = true;
const PHONE_PATTERN = /^1[3-9]\d{9}$/;

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
      if (num.length < 5 || num.length > 50) return '港澳台通行证号码长度应在5-50位之间';
      break;
    case 'foreign':
      if (num.length < 5 || num.length > 50) return '护照号码长度应在5-50位之间';
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
      { value: 'hongkong', label: '港澳台通行证' },
      { value: 'foreign', label: '护照' },
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
      this.setData({
        formData: { ...this.data.formData, phone: wechatPhone },
        phoneReadonly: true,
      });
    }
  },

  onShow() {
    // 监听从微信城市服务小程序返回时携带的授权 code
    if (DEBUG_SKIP_REALNAME) return;

    const launchOptions = wx.getLaunchOptionsSync ? wx.getLaunchOptionsSync() : {};
    const enterOptions = wx.getEnterOptionsSync ? wx.getEnterOptionsSync() : {};
    // 优先用 enterOptions（本次进入）而不是 launchOptions（首次启动）
    const referrerInfo = (enterOptions && enterOptions.referrerInfo)
      || (launchOptions && launchOptions.referrerInfo)
      || {};
    const fromAppId = referrerInfo.appId || '';
    const extraData = referrerInfo.extraData || {};

    // 只处理从微信城市服务小程序返回的情况
    if (fromAppId !== WECHAT_CITY_SERVICE_APPID) return;

    const code = extraData.code || extraData.auth_code || '';
    if (!code) return;

    this.verifyWithCode(code);
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
    if (!formData.phone) return '请输入有效的手机号';
    if (!this.data.phoneReadonly && !PHONE_PATTERN.test(formData.phone)) return '请输入有效的手机号';
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

    // 正式流程：跳转微信城市服务小程序获取授权 code
    wx.setStorageSync('pending_bind_form', formData);
    this.setData({ verifyingRealname: true, error: null });

    const that = this;
    wx.navigateToMiniProgram({
      appId: WECHAT_CITY_SERVICE_APPID,
      path: WECHAT_CITY_SERVICE_PATH,
      extraData: {},
      success: () => {},
      fail: (err) => {
        wx.showModal({
          title: '无法打开微信授权',
          content: '请使用真机调试，或在小程序后台"跳转小程序白名单"中添加 ' + WECHAT_CITY_SERVICE_APPID + '。错误：' + (err.errMsg || JSON.stringify(err)),
          showCancel: false,
        });
        that.setData({ verifyingRealname: false, error: '跳转失败，请使用真机调试' });
      },
    });
  },

  verifyWithCode(code) {
    const formData = wx.getStorageSync('pending_bind_form') || {};
    const { name, identity_number } = formData;
    if (!name || !identity_number) {
      this.setData({ verifyingRealname: false, error: '表单数据已过期，请重新填写' });
      return;
    }

    this.setData({ verifyingRealname: true, error: null });
    const that = this;

    // 调用后端 /realname-auth/verify：一步完成实名校验
    api.verifyRealname({
      code: code,
      real_name: name.trim(),
      cred_id: identity_number.trim(),
    })
      .then((verifyRes) => {
        wx.removeStorageSync('pending_bind_form');
        if (verifyRes.verify_result) {
          that.doBind(formData);
        } else {
          const msg = verifyRes.message || '姓名与证件号不匹配，请核对后重新输入';
          that.setData({ verifyingRealname: false, error: msg });
        }
      })
      .catch((err) => {
        wx.removeStorageSync('pending_bind_form');
        const msg = err && err.message ? err.message : String(err);
        that.setData({ verifyingRealname: false, error: '实名校验失败：' + msg });
      });
  },

  doBind(formData) {
    this.setData({ submitting: true });
    const shouldSendPhone = PHONE_PATTERN.test(formData.phone);
    const submitData = {
      name: formData.name.trim(),
      sex: formData.sex,
      age: parseInt(formData.age),
      occupation: formData.occupation.trim(),
      email: formData.email || null,
      industry: formData.industry.trim(),
      identity_type: formData.identity_type,
      identity_number: formData.identity_number.trim(),
    };
    if (shouldSendPhone) {
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
