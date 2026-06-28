const api = require('../../utils/api');
const auth = require('../../utils/auth');
const image = require('../../utils/image');
const { resolveActivityPostersOrFallback } = require('../../utils/image-safe');
const tenant = require('../../utils/tenant');
const { formatParticipantActivities } = require('../../utils/mine-data');

Page({
  data: {
    loading: true,
    error: null,
    activities: [],
    summaryText: '共 0 条报名记录',
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
  },

  onShow() {
    if (!this.ensureUserAccess()) return;
    this.loadActivities();
  },

  ensureUserAccess() {
    // 允许普通用户和活动管理员访问（活动管理员也可以报名自己的活动）
    if (!auth.isLoggedIn()) {
      this.setData({
        loading: false,
        activities: [],
        summaryText: '共 0 条报名记录',
        error: null,
      });
      auth.redirectToLogin('请登录后查看');
      return false;
    }
    if (auth.isUser() || auth.isActivityTypeAdmin()) return true;
    this.setData({
      loading: false,
      activities: [],
      summaryText: '共 0 条报名记录',
      error: null,
    });
    wx.showToast({ title: '请登录后查看', icon: 'none' });
    setTimeout(() => wx.navigateBack(), 1200);
    return false;
  },

  async loadActivities() {
    // 允许普通用户和活动管理员访问
    if (!auth.isUser() && !auth.isActivityTypeAdmin()) {
      this.ensureUserAccess();
      return;
    }
    this.setData({ loading: true, error: null });
    try {
      const registrations = await api.getMyParticipantActivities();
      const activities = formatParticipantActivities(
        registrations.items || [],
        this.formatTime.bind(this)
      );
      const resolvedActivities = await resolveActivityPostersOrFallback(
        image,
        activities,
        '我的活动列表'
      );
      this.setData({
        activities: resolvedActivities,
        summaryText: `共 ${resolvedActivities.length} 条报名记录`,
        loading: false,
      });
    } catch (err) {
      this.setData({
        activities: [],
        summaryText: '共 0 条报名记录',
        loading: false,
        error: err && err.message ? err.message : '加载报名活动失败',
      });
    }
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

  goActivityDetail(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    wx.navigateTo({
      url: tenant.appendTenantToUrl('/pages/activity-detail/activity-detail', { id }),
    });
  },
});
