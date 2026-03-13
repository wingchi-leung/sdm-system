const api = require('../../utils/api');
const auth = require('../../utils/auth');

Page({
  data: {
    submitting: false,
    error: null,
    unsafeTip: false,
  },

  onLoad() {
    this.setData({ unsafeTip: api.isUnsafeBaseUrl() });
  },

  wechatLogin() {
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
                wx.switchTab({
                  url: '/pages/index/index'
                });
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
});
