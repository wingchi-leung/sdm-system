const api = require('../../utils/api');
const auth = require('../../utils/auth');

Page({
  data: {
    view: 'guest', // guest | user | admin
    profile: null,
    adminProfile: null,
    loading: true,
  },

  onLoad() {
    this.checkAuth();
  },

  onShow() {
    this.checkAuth();
  },

  checkAuth() {
    if (auth.isAdmin()) {
      this.setData({
        view: 'admin',
        loading: false,
        profile: null,
        adminProfile: this.buildAdminProfile(),
      });
      return;
    }
    if (auth.isUser()) {
      this.setData({ loading: true });
      api
        .getUserProfile()
        .then((profile) => {
          this.setData({
            view: 'user',
            profile,
            userName: auth.getUserName(),
            adminProfile: null,
            loading: false,
          });
        })
        .catch(() => {
          this.setData({
            view: 'user',
            profile: null,
            userName: auth.getUserName(),
            adminProfile: null,
            loading: false,
          });
        });
      return;
    }
    this.setData({ view: 'guest', profile: null, adminProfile: null, loading: false });
  },

  buildAdminProfile() {
    const isSuper = auth.isSuperAdmin();
    const types = auth.getAdminActivityTypes();
    const typeNames = types.map((t) => t.name).filter(Boolean);
    return {
      isSuper,
      levelText: isSuper ? '超级管理员' : '活动管理员',
      typeNames,
      typeNamesText: typeNames.join('、'),
      canCreateActivity: isSuper || types.length > 0,
    };
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  logout() {
    auth.logout();
    wx.showToast({ title: '已退出', icon: 'none' });
    this.setData({ view: 'guest', profile: null, adminProfile: null });
  },

  goCreateActivity() {
    const profile = this.data.adminProfile || {};
    if (!profile.canCreateActivity) {
      wx.showToast({ title: '当前账号未授权活动类型', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/create-activity/create-activity' });
  },

goActivityList() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  goActivityManage() {
    wx.navigateTo({ url: '/pages/activity-list/activity-list' });
  },
});
