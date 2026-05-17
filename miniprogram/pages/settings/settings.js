const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');

Page({
  onLoad(options) {
    tenant.applyPageOptions(options);
  },

  goProfileEdit() {
    wx.navigateTo({ url: tenant.appendTenantToUrl('/pages/profile-edit/profile-edit') });
  },

  onDeactivateAccount() {
    wx.showModal({
      title: '注销账号',
      content: '注销后将停用当前账号登录能力，是否继续？',
      success: (res) => {
        if (!res.confirm) return;
        api.deactivateMyAccount()
          .then(() => {
            auth.logout();
            wx.showToast({ title: '账号已注销', icon: 'none' });
            wx.navigateTo({ url: tenant.appendTenantToUrl('/pages/login/login') });
          })
          .catch((err) => {
            wx.showToast({ title: err && err.message ? err.message : '注销失败', icon: 'none' });
          });
      },
    });
  },
});

