const api = require('../../utils/api');
const auth = require('../../utils/auth');

Page({
  data: {
    isAdminMode: false,
    account: '',
    password: '',
    submitting: false,
    error: null,
    unsafeTip: false,
  },

  // 快速点击计数
  gateTapCount: 0,
  gateTapTimer: null,

  onLoad() {
    this.setData({ unsafeTip: api.isUnsafeBaseUrl() });
  },

  /**
   * 图标点击：快速点击3次进入管理员模式
   */
  onGateIconTap() {
    this.gateTapCount++;
    // 清除之前的定时器
    if (this.gateTapTimer) {
      clearTimeout(this.gateTapTimer);
    }
    // 1秒后重置计数
    this.gateTapTimer = setTimeout(() => {
      this.gateTapCount = 0;
    }, 1000);

    // 达到3次点击
    if (this.gateTapCount === 3) {
      this.gateTapCount = 0;
      if (this.gateTapTimer) {
        clearTimeout(this.gateTapTimer);
        this.gateTapTimer = null;
      }
      wx.vibrateShort({ type: 'light' });
      this.setData({
        isAdminMode: true,
        account: '',
        password: '',
        error: null,
      });
    }
  },

  /**
   * 退出管理员模式
   */
  exitAdminMode() {
    this.setData({
      isAdminMode: false,
      account: '',
      password: '',
      error: null,
    });
  },

  toggleMode() {
    this.setData({
      isAdminMode: !this.data.isAdminMode,
      account: '',
      password: '',
      error: null,
    });
  },

  onAccountInput(e) {
    this.setData({ account: e.detail.value, error: null });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value, error: null });
  },

  submit() {
    const { isAdminMode, account, password } = this.data;
    if (!account || !account.trim()) {
      this.setData({ error: isAdminMode ? '请输入用户名' : '请输入手机号' });
      return;
    }
    if (!password) {
      this.setData({ error: '请输入密码' });
      return;
    }
    this.setData({ submitting: true, error: null });
    const promise = isAdminMode
      ? api.adminLogin(account.trim(), password)
      : api.userLogin(account.trim(), password);
    promise
      .then((res) => {
        const token = res.access_token;
        if (isAdminMode) {
          auth.saveAdminToken(token, res);
        } else {
          auth.saveUserToken({
            accessToken: token,
            userId: res.user_id,
            userName: res.user_name || '',
          });
        }
        wx.showToast({ title: '登录成功', icon: 'success' });
        setTimeout(() => {
          wx.navigateBack();
        }, 800);
      })
      .catch((err) => {
        const msg = err && err.message ? err.message : String(err);
        this.setData({ error: msg, submitting: false });
      });
  },

  /** 微信一键登录：wx.login 取 code，调后端 wechat-login */
  wechatLogin() {
    if (this.data.isAdminMode) return;
    this.setData({ submitting: true, error: null });
    wx.login({
      success: (res) => {
        const code = res.code;
        if (!code) {
          this.setData({ error: '获取微信登录态失败', submitting: false });
          return;
        }
        api
          .wechatLogin(code)
          .then((data) => {
            auth.saveUserToken({
              accessToken: data.access_token,
              userId: data.user_id,
              userName: data.user_name || '微信用户',
            });
            wx.showToast({ title: '登录成功', icon: 'success' });
            setTimeout(() => wx.navigateBack(), 800);
          })
          .catch((err) => {
            const msg = err && err.message ? err.message : String(err);
            this.setData({ error: msg, submitting: false });
          });
      },
      fail: () => {
        this.setData({ error: '微信登录失败，请重试', submitting: false });
      },
    });
  },

  goRegister() {
    wx.navigateTo({ url: '/pages/user-register/user-register' });
  },
});
