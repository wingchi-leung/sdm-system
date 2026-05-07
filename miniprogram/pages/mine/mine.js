const api = require('../../utils/api');
const auth = require('../../utils/auth');
const image = require('../../utils/image');
const tenant = require('../../utils/tenant');
const { formatParticipantActivities } = require('../../utils/mine-data');
const { resolveAvatarDisplayUrl } = require('../../utils/avatar');

Page({
  data: {
    view: 'user', // user | admin
    profile: null,
    adminProfile: null,
    loading: true,
    myActivities: [],
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    this.checkAuth();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
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
      Promise.all([
        api.getUserProfile(),
        api.getMyParticipantActivities(),
      ])
        .then(async ([profile, registrations]) => {
          const avatarDisplayUrl = await resolveAvatarDisplayUrl(profile && profile.avatar_url);
          this.setData({
            view: 'user',
            profile,
            userName: auth.getUserName(),
            avatarDisplayUrl,
            adminProfile: null,
            myActivities: await this.buildMyActivities(registrations.items || []),
            loading: false,
          });
        })
        .catch(() => {
          this.setData({
            view: 'user',
            profile: null,
            userName: auth.getUserName(),
            avatarDisplayUrl: '',
            adminProfile: null,
            myActivities: [],
            loading: false,
          });
        });
      return;
    }
    // 未登录直接跳转登录页
    wx.navigateTo({ url: tenant.appendTenantToUrl('/pages/login/login') });
  },

  buildAdminProfile() {
    const isSuper = auth.isSuperAdmin();
    const canViewUsers = auth.hasAdminPermission('user.view');
    const types = auth.getAdminActivityTypes();
    const typeNames = types.map((t) => t.name).filter(Boolean);
    return {
      isSuper,
      canViewUsers,
      levelText: isSuper ? '超级管理员' : '活动管理员',
      typeNames,
      typeNamesText: typeNames.join('、'),
      canCreateActivity: isSuper || types.length > 0,
    };
  },

  async buildMyActivities(items) {
    const mappedItems = formatParticipantActivities(items, this.formatTime.bind(this));
    return image.resolveActivityPosters(mappedItems);
  },

  formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${m}月${day}日 ${h}:${min}`;
  },

  logout() {
    auth.logout();
    wx.showToast({ title: '已退出', icon: 'none' });
    wx.navigateTo({ url: tenant.appendTenantToUrl('/pages/login/login') });
  },

  goCreateActivity() {
    const profile = this.data.adminProfile || {};
    if (!profile.canCreateActivity) {
      wx.showToast({ title: '当前账号未授权活动类型', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: tenant.appendTenantToUrl('/pages/create-activity/create-activity') });
  },

  goActivityList() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  goMyActivityDetail(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    wx.navigateTo({ url: tenant.appendTenantToUrl('/pages/activity-detail/activity-detail', { id }) });
  },

  goMyActivities() {
    wx.navigateTo({ url: tenant.appendTenantToUrl('/pages/my-activities/my-activities') });
  },

  goMyOrders() {
    wx.navigateTo({ url: tenant.appendTenantToUrl('/pages/my-orders/my-orders') });
  },

  goAvatarPicker() {
    wx.navigateTo({ url: tenant.appendTenantToUrl('/pages/avatar-picker/avatar-picker') });
  },

  goActivityManage() {
    wx.navigateTo({ url: tenant.appendTenantToUrl('/pages/activity-list/activity-list') });
  },

  goUserList() {
    if (!auth.hasAdminPermission('user.view')) {
      wx.showToast({ title: '当前账号无用户查看权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: tenant.appendTenantToUrl('/pages/user-list/user-list') });
  },
});
