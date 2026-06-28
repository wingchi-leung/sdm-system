const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');

Page({
  redirectingToLogin: false,

  onLoad(options) {
    tenant.applyPageOptions(options);
  },

  onShow() {
    this.ensureLoggedIn();
  },

  goToLogin() {
    if (this.redirectingToLogin) return;
    this.redirectingToLogin = true;
    wx.reLaunch({ url: tenant.appendTenantToUrl('/pages/login/login') });
  },

  ensureLoggedIn() {
    if (auth.isLoggedIn()) {
      this.redirectingToLogin = false;
      return true;
    }
    this.goToLogin();
    return false;
  },

  goProfileEdit() {
    if (!this.ensureLoggedIn()) return;
    wx.navigateTo({ url: tenant.appendTenantToUrl('/pages/profile-edit/profile-edit') });
  },

  onDeactivateAccount() {
    if (!this.ensureLoggedIn()) return;
    wx.showModal({
      title: '注销账号',
      content: '注销后将停用当前账号登录能力，是否继续？',
      success: (res) => {
        if (!res.confirm) return;
        api.deactivateMyAccount()
          .then(() => {
            auth.logout();
            wx.showToast({ title: '账号已注销', icon: 'none' });
            this.goToLogin();
          })
          .catch((err) => {
            wx.showToast({ title: err && err.message ? err.message : '注销失败', icon: 'none' });
          });
      },
    });
  },
});
