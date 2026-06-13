const api = require('../../utils/api');
const auth = require('../../utils/auth');
const image = require('../../utils/image');
const tenant = require('../../utils/tenant');
const { formatParticipantActivities } = require('../../utils/mine-data');
const { resolveAvatarDisplayUrl } = require('../../utils/avatar');
const { syncTabBarSelected } = require('../../utils/tab-bar');

function getJoinedLabel(profile) {
  if (!profile || !profile.create_time) {
    return '';
  }
  const createdAt = new Date(profile.create_time);
  if (!Number.isNaN(createdAt.getTime())) {
    return `Joined ${createdAt.getFullYear()}`;
  }
  return '';
}

function buildSummaryCards(items = []) {
  const totalCount = Array.isArray(items) ? items.length : 0;
  const waitingCount = items.filter((item) => item && item.enroll_status === 2).length;
  const pendingCount = items.filter((item) => item && item.payment_status === 1).length;

  return [
    { value: totalCount, label: '参与探索' },
    { value: waitingCount, label: '笔记与分享' },
    { value: pendingCount, label: '成长时长 (h)' },
  ];
}

Page({
  data: {
    view: 'user', // user | admin
    profile: null,
    adminProfile: null,
    loading: true,
    myActivities: [],
    summaryCards: [],
    joinedLabel: '',
    userName: '',
    avatarDisplayUrl: '',
    floatingBellTop: '180rpx',
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    this._loadVersion = 0;
    this.computeFloatingBellTop();
    this.checkAuth();
  },

  computeFloatingBellTop() {
    let statusBarHeight = 0;
    try {
      const sys = typeof wx.getSystemInfoSync === 'function' ? wx.getSystemInfoSync() : null;
      statusBarHeight = Number(sys && sys.statusBarHeight) || 0;
    } catch (_) {
      statusBarHeight = 0;
    }
    // 状态栏 + 系统导航栏(44px) + 顶部留白(约 20rpx)
    const navBarHeight = 44; // px
    const topPx = statusBarHeight + navBarHeight;
    // rpx: 1px = 2rpx (iPhone 6/7/8 标准 750rpx 屏宽)
    const topRpx = Math.round(topPx * 2) + 20;
    this.setData({ floatingBellTop: `${topRpx}rpx` });
  },

  onShow() {
    syncTabBarSelected(this);
    this.checkAuth();
  },

  bumpLoadVersion() {
    this._loadVersion = (this._loadVersion || 0) + 1;
    return this._loadVersion;
  },

  isCurrentLoad(loadVersion) {
    return this._loadVersion === loadVersion;
  },

  resetPageState(overrides = {}) {
    this.setData({
      view: 'user',
      profile: null,
      adminProfile: null,
      loading: true,
      myActivities: [],
      summaryCards: [],
      joinedLabel: '',
      userName: '',
      avatarDisplayUrl: '',
      ...overrides,
    });
  },

  async checkAuth() {
    const loadVersion = this.bumpLoadVersion();

    if (auth.isAdmin()) {
      this.resetPageState({ view: 'admin', loading: true, summaryCards: [] });
      try {
        const profileTask = api.getUserProfile();
        const snapshotTask = api.getAuthSnapshot().catch(() => null);
        const [profile, snapshot] = await Promise.all([profileTask, snapshotTask]);
        if (!this.isCurrentLoad(loadVersion)) return;

        if (snapshot) {
          auth.updateAdminMeta(snapshot);
        }

        let avatarDisplayUrl = '';
        try {
          avatarDisplayUrl = await resolveAvatarDisplayUrl(profile && profile.avatar_url, profile && profile.update_time);
        } catch (avatarErr) {
          avatarDisplayUrl = '';
        }

        this.setData({
          view: 'admin',
          profile,
          userName: profile?.name || auth.getUserName() || '',
          avatarDisplayUrl,
          joinedLabel: getJoinedLabel(profile),
          loading: false,
          adminProfile: this.buildAdminProfile(),
        });
      } catch (err) {
        if (!this.isCurrentLoad(loadVersion)) return;
        this.setData({
          view: 'admin',
          profile: null,
          userName: auth.getUserName() || '',
          avatarDisplayUrl: '',
          joinedLabel: '',
          loading: false,
          adminProfile: this.buildAdminProfile(),
        });
        wx.showToast({ title: '管理员资料加载失败', icon: 'none' });
      }
      return;
    }

    if (auth.isUser()) {
      this.resetPageState({
        view: 'user',
        loading: true,
        userName: auth.getUserName() || '',
      });

      let profile = null;
      let avatarDisplayUrl = '';
      let participantItems = [];
      let displayActivities = [];

      try {
        profile = await api.getUserProfile();
      } catch (err) {
        wx.showToast({ title: '个人资料加载失败', icon: 'none' });
      }

      try {
        const activitiesRes = await api.getMyParticipantActivities();
        participantItems = Array.isArray(activitiesRes && activitiesRes.items) ? activitiesRes.items : [];
        displayActivities = await this.buildMyActivities(participantItems);
      } catch (err) {
        wx.showToast({ title: '报名数据加载失败', icon: 'none' });
      }

      try {
        avatarDisplayUrl = await resolveAvatarDisplayUrl(profile && profile.avatar_url, profile && profile.update_time);
      } catch (avatarErr) {
        avatarDisplayUrl = '';
      }

      if (!this.isCurrentLoad(loadVersion)) return;

      this.setData({
        view: 'user',
        profile,
        userName: profile?.name || auth.getUserName() || '',
        avatarDisplayUrl,
        adminProfile: null,
        myActivities: displayActivities,
        summaryCards: buildSummaryCards(participantItems),
        joinedLabel: getJoinedLabel(profile),
        loading: false,
      });
      return;
    }

    this.resetPageState({ loading: false });
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
    wx.showModal({
      title: '确认退出',
      content: '退出后将返回登录页，是否继续？',
      confirmText: '退出',
      cancelText: '取消',
      success: (res) => {
        if (!res || !res.confirm) return;
        this.bumpLoadVersion();
        auth.logout();
        this.resetPageState({ loading: false, summaryCards: [] });
        wx.showToast({ title: '已退出', icon: 'none' });
        wx.navigateTo({ url: tenant.appendTenantToUrl('/pages/login/login') });
      },
      fail: () => {
        wx.showToast({ title: '无法弹出确认框，请稍后重试', icon: 'none' });
      },
    });
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

  goSettings() {
    wx.navigateTo({ url: tenant.appendTenantToUrl('/pages/settings/settings') });
  },

  goAgreementNotes() {
    wx.navigateTo({ url: tenant.appendTenantToUrl('/pages/agreement-notes/agreement-notes') });
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

  goCommunityModeration() {
    wx.navigateTo({ url: tenant.appendTenantToUrl('/pages/community-moderation/community-moderation') });
  },
});
