const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');

// 微信支付实名认证小程序 appid（固定）
const WECHAT_REALNAME_APPID = 'wxb369391ce8a1a1c8';

Page({
  data: {
    name: '',
    idNumber: '',
    phone: '',
    password: '',
    email: '',
    submitting: false,
    error: null,
    // 实名认证相关
    verifyingRealname: false,
    realnameVerified: false,
    realnamePass: false, // 实名认证通过后才能提交
    realnameAccessToken: '', // 保存 access_token 用于验证
    realnameRefreshToken: '',
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value, error: null });
  },

  onIdNumberInput(e) {
    this.setData({ idNumber: e.detail.value, error: null });
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

  /**
   * 步骤1：引导用户跳转微信支付实名授权页
   * 用户同意后，微信会通过 redirect 回调返回 auth_code
   * 此处直接使用小程序跳转方式，由微信侧回调处理
   */
  startRealnameVerify() {
    const { name, idNumber } = this.data;
    if (!name || !name.trim()) {
      this.setData({ error: '请输入姓名' });
      return;
    }
    if (!idNumber || !idNumber.trim()) {
      this.setData({ error: '请输入身份证号' });
      return;
    }

    // 保存姓名和证件号，用于后续验证
    this.setData({ verifyingRealname: true, error: null });

    // 方式1：使用微信开放能力跳转实名授权页（获取 auth_code）
    // 微信支付实名授权的 scheme 会通过 redirect 返回 auth_code 到小程序
    // 此处我们使用小程序跳转方式，引导用户授权
    const that = this;

    // 通过微信开放标签或 API 跳转到实名授权页面
    // 微信支付实名认证 H5 页面 URL
    // 注意：实际需要使用微信支付提供的实名认证跳转 scheme
    wx.navigateToMiniProgram({
      appId: WECHAT_REALNAME_APPID,
      path: 'pages/auth/index',
      extraData: {
        auth_type: 'realname',
      },
      success(res) {
        // 用户跳转成功，等待回调
        console.log('跳转微信支付实名授权页成功', res);
      },
      fail(err) {
        console.error('跳转失败', err);
        // 如果跳转失败，尝试使用 web-view 或其他方式
        // 这里可以改为使用微信开放标签 <wx-open-launch-weapp>
        that.setData({
          verifyingRealname: false,
          error: '无法跳转到微信实名授权页，请确认微信版本支持此功能',
        });
      },
    });
  },

  /**
   * 处理从微信支付实名授权页返回的 auth_code
   * 在 onShow 中监听 redirect 回调参数
   */
  onShow() {
    // 监听 redirect 回调，auth_code 在参数中
    const pages = getCurrentPages();
    const currentPage = pages[pages.length - 1];
    if (currentPage) {
      const options = currentPage.options || {};
      const authCode = options.auth_code;
      if (authCode) {
        this.exchangeTokenAndVerify(authCode);
      }
    }
  },

  /**
   * 步骤2：用 auth_code 换取 access_token
   * 步骤3：用 access_token + 姓名 + 证件号 请求实名验证
   */
  exchangeTokenAndVerify(authCode) {
    const { name, idNumber } = this.data;
    const that = this;

    api.exchangeRealnameToken({ auth_code: authCode })
      .then((res) => {
        // 步骤2成功，获得 access_token
        that.setData({
          realnameAccessToken: res.access_token,
          realnameRefreshToken: res.refresh_token,
        });

        // 步骤3：请求实名验证
        return api.verifyRealname({
          access_token: res.access_token,
          name: name.trim(),
          id_number: idNumber.trim(),
        });
      })
      .then((verifyRes) => {
        if (verifyRes.verify_result) {
          // 实名认证通过
          that.setData({
            realnameVerified: true,
            realnamePass: true,
            verifyingRealname: false,
          });
          wx.showToast({ title: '实名认证通过', icon: 'success' });
        } else {
          // 实名认证未通过，显示详细原因
          const msg = verifyRes.message || '实名认证未通过，请核对信息后重试';
          that.setData({
            realnameVerified: false,
            realnamePass: false,
            verifyingRealname: false,
            error: msg,
          });
        }
      })
      .catch((err) => {
        console.error('实名认证失败', err);
        const msg = err && err.message ? err.message : String(err);
        that.setData({
          verifyingRealname: false,
          error: '实名认证失败：' + msg,
        });
      });
  },

  submit() {
    const { name, phone, password, realnamePass, idNumber } = this.data;
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
    // 必须先通过实名认证
    if (!realnamePass) {
      this.setData({ error: '请先完成实名认证' });
      return;
    }

    this.setData({ submitting: true, error: null });
    api
      .registerUser({
        name: name.trim(),
        phone: phone.trim(),
        password,
        email: email || undefined,
        identity_type: 'mainland',
        identity_number: idNumber.trim(),
      })
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