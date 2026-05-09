const api = require('../../utils/api');
const auth = require('../../utils/auth');
const image = require('../../utils/image');
const tenant = require('../../utils/tenant');
const { resolveAvatarDisplayUrl } = require('../../utils/avatar');

/** 把接口/网络错误转成可读文案，避免显示 [object Object] */
function formatLoadError(err) {
  if (!err) return '加载失败，请重试';
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  if (err.errMsg) return err.errMsg; // 微信 wx.request 失败时的字段
  const s = String(err);
  if (s === '[object Object]') {
    return '无法连接服务器，请确认：1) 后端已启动（端口 8000）；2) 开发者工具已勾选「不校验合法域名」';
  }
  return s;
}

Page({
  data: {
    activities: [],
    loading: true,
    error: null,
    isAdmin: false,
    isUser: false,
    canCreateActivity: false,
    headerAvatarUrl: '',
    headerAvatarText: '用',
  },

  _redirectingToLogin: false,

  resetPageState(overrides = {}) {
    this.setData({
      loading: true,
      error: null,
      activities: [],
      headerAvatarUrl: '',
      ...overrides,
    });
  },

  ensureLoggedIn() {
    if (auth.isLoggedIn()) {
      this._redirectingToLogin = false;
      return true;
    }

    this.resetPageState({
      loading: false,
      isAdmin: false,
      isUser: false,
      canCreateActivity: false,
      headerAvatarText: '用',
    });

    if (this._redirectingToLogin) {
      return false;
    }

    this._redirectingToLogin = true;
    const redirectUrl = tenant.appendTenantToUrl('/pages/index/index');
    wx.showToast({ title: '请先登录', icon: 'none' });
    setTimeout(() => {
      wx.navigateTo({
        url: tenant.appendTenantToUrl('/pages/login/login', { redirect: redirectUrl }),
      });
    }, 300);
    return false;
  },

  resolveAdminState() {
    const isAdmin = auth.isAdmin();
    const isUser = auth.isUser();
    const canCreateActivity = auth.isSuperAdmin() || auth.getAdminActivityTypes().length > 0;
    this.setData({
      isAdmin,
      isUser,
      canCreateActivity,
      headerAvatarUrl: isUser ? this.data.headerAvatarUrl : '',
      headerAvatarText: auth.getUserName() ? String(auth.getUserName()).slice(0, 1) : '用',
    });
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    if (!this.ensureLoggedIn()) return;
    this.resolveAdminState();
    this.load();
  },

  onShow() {
    if (!this.ensureLoggedIn()) return;
    this.resolveAdminState();
    this.load();
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    this.resetPageState();
    this.resolveAdminState();
    const tasks = [api.getEnrollableActivities()];
    if (auth.isUser()) {
      tasks.push(api.getMyParticipantActivities());
      tasks.push(api.getUserProfile());
    }
    return Promise.all(tasks)
      .then(async ([res, registrationRes, profile]) => {
        const registrationMap = {};
        (registrationRes?.items || []).forEach((item) => {
          registrationMap[item.id] = item;
        });
        let items = (res.items || []).map((a) => {
          const dateDisplay = this.formatDateForDisplay(a.start_time);
          const registration = registrationMap[a.id];
          return {
            ...a,
            start_time_display: a.start_time ? this.formatTime(a.start_time) : '',
            status_text: a.status === 1 ? '未开始' : a.status === 2 ? '进行中' : '已结束',
            date_day: dateDisplay.day,
            date_month: dateDisplay.month,
            has_registered: !!registration,
            registration_status_text: registration
              ? (registration.enroll_status === 2 ? '候补中' : '已报名')
              : '',
          };
        });
        items = await image.resolveActivityPosters(items);
        if (auth.isActivityTypeAdmin()) {
          items = items.filter((a) => auth.canManageActivityType(a));
        }
        const headerAvatarUrl = auth.isUser()
          ? await resolveAvatarDisplayUrl(profile && profile.avatar_url)
          : '';
        this.setData({ activities: items, loading: false, headerAvatarUrl });
      })
      .catch((err) => {
        const msg = formatLoadError(err);
        this.setData({ error: msg, loading: false, activities: [], headerAvatarUrl: '' });
      });
  },

  onRefresh() {
    this.load();
  },

  goDetail(e) {
    const a = e.currentTarget.dataset.activity;
    if (!a) return;
    // 只传递ID，详情页重新获取数据
    wx.navigateTo({
      url: tenant.appendTenantToUrl('/pages/activity-detail/activity-detail', { id: a.id }),
    });
  },

  goCreateActivity() {
    wx.navigateTo({ url: tenant.appendTenantToUrl('/pages/create-activity/create-activity') });
  },

  goMine() {
    wx.switchTab({ url: '/pages/mine/mine' });
  },

  statusText(status) {
    const map = { 1: '未开始', 2: '进行中', 3: '已结束' };
    return map[status] || '未知';
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

  // 格式化日期为大号数字显示
  formatDateForDisplay(iso) {
    if (!iso) return { day: '--', month: '未知' };
    const d = new Date(iso);
    const day = d.getDate();
    const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    const month = months[d.getMonth()];
    return { day, month };
  },

  onShareAppMessage() {
    return {
      title: '活动列表',
      path: tenant.appendTenantToUrl('/pages/index/index'),
    };
  },
});
