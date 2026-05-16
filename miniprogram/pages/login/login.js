const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');

const TAB_PAGES = ['/pages/index/index', '/pages/mine/mine'];
const SAFE_REDIRECT_PAGES = [
  '/pages/index/index',
  '/pages/mine/mine',
  '/pages/activity-detail/activity-detail',
  '/pages/register/register',
  '/pages/bind-user-info/bind-user-info',
  '/pages/activity-list/activity-list',
  '/pages/create-activity/create-activity',
  '/pages/edit-activity/edit-activity',
  '/pages/activity-participants/activity-participants',
  '/pages/activity-checkins/activity-checkins',
  '/pages/activity-statistics/activity-statistics',
  '/pages/user-list/user-list',
];

Page({
  data: {
    isAdminMode: false,
    account: '',
    password: '',
    submitting: false,
    error: null,
    unsafeTip: false,
  },

  // 快速点击计数：连续点击 5 次进入管理员模式。
  gateTapCount: 0,
  gateTapTimer: null,

  onLoad(options) {
    tenant.applyPageOptions(options);
    this.setData({ unsafeTip: api.isUnsafeBaseUrl() });
  },

  getRedirectUrl() {
    const pages = getCurrentPages();
    const currentPage = pages[pages.length - 1];
    if (!currentPage || !currentPage.options || !currentPage.options.redirect) {
      return '';
    }
    const redirectUrl = decodeURIComponent(currentPage.options.redirect);
    const path = redirectUrl.split('?')[0];
    return SAFE_REDIRECT_PAGES.includes(path) ? redirectUrl : '';
  },

  navigateAfterLogin(role = 'user') {
    const redirectUrl = this.getRedirectUrl();
    if (redirectUrl) {
      const path = redirectUrl.split('?')[0];
      if (role === 'admin' && path === '/pages/register/register') {
        wx.switchTab({ url: '/pages/index/index' });
        return;
      }
      if (TAB_PAGES.includes(path)) {
        wx.switchTab({ url: path });
        return;
      }
      wx.redirectTo({ url: redirectUrl });
      return;
    }
    wx.switchTab({
      url: '/pages/index/index',
    });
  },

  onGateIconTap() {
    this.gateTapCount += 1;
    if (this.gateTapTimer) {
      clearTimeout(this.gateTapTimer);
    }
    this.gateTapTimer = setTimeout(() => {
      this.gateTapCount = 0;
    }, 1000);

    if (this.gateTapCount === 5) {
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

  exitAdminMode() {
    this.setData({
      isAdminMode: false,
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
    if (this.data.submitting) {
      return;
    }

    const { isAdminMode, account, password } = this.data;
    if (!account || !account.trim()) {
      this.setData({ error: isAdminMode ? '请输入用户名' : '请输入手机号' });
      return;
    }
    if (!password) {
      this.setData({ error: '请输入密码' });
      return;
    }

    if (!isAdminMode) {
      this.wechatLogin();
      return;
    }

    this.setData({ submitting: true, error: null });
    api
      .adminLogin(account.trim(), password)
      .then((res) => {
        const authInfo = res && res.auth ? res.auth : {};
        if (!authInfo.is_admin && !authInfo.is_platform_admin) {
          this.setData({
            error: '该账号没有管理员权限',
            submitting: false,
          });
          return;
        }
        auth.saveAdminToken(res.access_token, res);
        console.log('[Login] saveAdminToken called with:', {
          access_token: res.access_token ? '(set)' : '(empty)',
          auth: res.auth,
        });
        wx.showToast({ title: '登录成功', icon: 'success' });
        setTimeout(() => {
          this.navigateAfterLogin('admin');
        }, 800);
      })
      .catch((err) => {
        this.handleLoginError(err);
      });
  },

  handleUserLoginSuccess(data) {
    auth.saveUserToken({
      accessToken: data.access_token,
      userId: data.user?.id || data.user_id,
      userName: data.user?.name || data.user_name || '微信用户',
    });

    if (data.is_first_login || data.require_bind_info) {
      auth.markRequireBindInfo(data.phone);
    } else if (data.phone) {
      wx.setStorageSync('wechat_phone', data.phone);
    }

    if (data.require_bind_info) {
      wx.showToast({ title: '请先完成信息绑定', icon: 'none' });
      setTimeout(() => {
        wx.redirectTo({
          url: tenant.appendTenantToUrl('/pages/bind-user-info/bind-user-info'),
        });
      }, 800);
      return;
    }

    const successTitle = data.wechat_payment_ready === false ? '登录成功，支付绑定待刷新' : '登录成功';
    wx.showToast({ title: successTitle, icon: 'success' });
    if (data.wechat_payment_hint) {
      setTimeout(() => {
        wx.showToast({ title: data.wechat_payment_hint, icon: 'none', duration: 2500 });
      }, 900);
    }
    setTimeout(() => this.navigateAfterLogin('user'), 800);
  },

  handleLoginError(err) {
    const msg = err && err.message ? err.message : String(err);
    this.setData({ error: msg, submitting: false });
  },

  wechatLogin() {
    if (this.data.submitting) {
      return;
    }

    this.setData({ submitting: true, error: null });
    wx.login({
      success: (res) => {
        const code = res.code;
        if (!code) {
          this.setData({ error: '获取微信登录状态失败', submitting: false });
          return;
        }
        api
          .wechatLogin(code)
          .then((data) => {
            this.handleUserLoginSuccess(data);
          })
          .catch((err) => {
            this.handleLoginError(err);
          });
      },
      fail: () => {
        this.setData({ error: '微信登录失败，请重试', submitting: false });
      },
    });
  },

  onGetPhoneNumber(e) {
    if (!e.detail.code) {
      if (e.detail.errMsg && e.detail.errMsg.includes('cancel')) return;
      this.setData({ error: '获取手机号授权失败，请重试' });
      return;
    }
    if (this.data.submitting) return;

    this.setData({ submitting: true, error: null });
    const phoneCode = e.detail.code;

    wx.login({
      success: (loginRes) => {
        api
          .phoneLogin(phoneCode, loginRes.code || '')
          .then((data) => {
            this.handleUserLoginSuccess(data);
          })
          .catch((err) => {
            this.handleLoginError(err);
          });
      },
      fail: () => {
        api
          .phoneLogin(phoneCode, '')
          .then((data) => {
            this.handleUserLoginSuccess(data);
          })
          .catch((err) => {
            this.handleLoginError(err);
          });
      },
    });
  },
});
