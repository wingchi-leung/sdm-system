const api = require('../../utils/api');
const auth = require('../../utils/auth');

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

  // 快速点击计数
  gateTapCount: 0,
  gateTapTimer: null,

  onLoad() {
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
      url: '/pages/index/index'
    });
  },

  /**
   * 图标点击：快速点击5次进入管理员模式
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

    // 达到5次点击
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

  onAccountInput(e) {
    this.setData({ account: e.detail.value, error: null });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value, error: null });
  },

  submit() {
    // 防抖：如果正在提交，直接返回
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
    this.setData({ submitting: true, error: null });

    if (isAdminMode) {
      // 管理员登录
      api
        .adminLogin(account.trim(), password)
        .then((res) => {
          auth.saveAdminToken(res.access_token, res);
          wx.showToast({ title: '登录成功', icon: 'success' });
          setTimeout(() => {
            this.navigateAfterLogin('admin');
          }, 800);
        })
        .catch((err) => {
          const msg = err && err.message ? err.message : String(err);
          this.setData({ error: msg, submitting: false });
        });
    } else {
      // 微信一键登录
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

              // 保存首次登录标识
              if (data.is_first_login || data.require_bind_info) {
                wx.setStorageSync('require_bind_info', true);
              }

              wx.showToast({ title: '登录成功', icon: 'success' });

              // 根据是否需要绑定信息跳转
              if (data.require_bind_info) {
                setTimeout(() => {
                  wx.redirectTo({
                    url: '/pages/bind-user-info/bind-user-info'
                  });
                }, 800);
              } else {
                setTimeout(() => {
                  this.navigateAfterLogin('user');
                }, 800);
              }
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
    }
  },

  wechatLogin() {
    // 防抖：如果正在提交，直接返回
    if (this.data.submitting) {
      return;
    }

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

            // 保存首次登录标识
            if (data.is_first_login || data.require_bind_info) {
              wx.setStorageSync('require_bind_info', true);
            }

            wx.showToast({ title: '登录成功', icon: 'success' });

            // 根据是否需要绑定信息跳转
            if (data.require_bind_info) {
              setTimeout(() => {
                wx.redirectTo({
                  url: '/pages/bind-user-info/bind-user-info'
                });
              }, 800);
            } else {
              setTimeout(() => {
                this.navigateAfterLogin('user');
              }, 800);
            }
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

  /**
   * 手机号一键登录（通过微信授权获取手机号）
   * 同时调用 wx.login 获取 code，用于后端换取 openid 以支持微信支付
   */
  onGetPhoneNumber(e) {
    // 用户取消授权
    if (!e.detail.code) {
      if (e.detail.errMsg && e.detail.errMsg.includes('cancel')) return;
      this.setData({ error: '获取手机号授权失败，请重试' });
      return;
    }
    if (this.data.submitting) return;

    this.setData({ submitting: true, error: null });

    const phoneCode = e.detail.code;

    // 登录成功后的统一处理
    const handleLoginSuccess = (data) => {
      auth.saveUserToken({
        accessToken: data.access_token,
        userId: data.user_id,
        userName: data.user_name || '微信用户',
      });
      if (data.phone) wx.setStorageSync('wechat_phone', data.phone);
      if (data.is_first_login || data.require_bind_info) {
        wx.setStorageSync('require_bind_info', true);
      }
      const successTitle = data.wechat_payment_ready === false ? '登录成功，支付绑定待刷新' : '登录成功';
      wx.showToast({ title: successTitle, icon: 'success' });
      if (data.wechat_payment_hint) {
        setTimeout(() => {
          wx.showToast({ title: data.wechat_payment_hint, icon: 'none', duration: 2500 });
        }, 900);
      }
      if (data.require_bind_info) {
        setTimeout(() => wx.redirectTo({ url: '/pages/bind-user-info/bind-user-info' }), 800);
      } else {
        setTimeout(() => this.navigateAfterLogin('user'), 800);
      }
    };

    const handleLoginError = (err) => {
      const msg = err && err.message ? err.message : String(err);
      this.setData({ error: msg, submitting: false });
    };

    // 先取 wx.login code（换 openid），再一起发给后端
    wx.login({
      success: (loginRes) => {
        api.phoneLogin(phoneCode, loginRes.code || '')
          .then(handleLoginSuccess)
          .catch(handleLoginError);
      },
      fail: () => {
        // wx.login 失败时降级，openid 为空（支付功能不可用）
        api.phoneLogin(phoneCode, '')
          .then(handleLoginSuccess)
          .catch(handleLoginError);
      },
    });
  },
});
