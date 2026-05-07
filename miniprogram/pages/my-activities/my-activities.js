const api = require('../../utils/api');
const image = require('../../utils/image');
const tenant = require('../../utils/tenant');
const { formatParticipantActivities } = require('../../utils/mine-data');

Page({
  data: {
    loading: true,
    error: null,
    activities: [],
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
  },

  onShow() {
    this.loadActivities();
  },

  async loadActivities() {
    this.setData({ loading: true, error: null });
    try {
      const registrations = await api.getMyParticipantActivities();
      const activities = formatParticipantActivities(
        registrations.items || [],
        this.formatTime.bind(this)
      );
      const resolvedActivities = await image.resolveActivityPosters(activities);
      this.setData({
        activities: resolvedActivities,
        loading: false,
      });
    } catch (err) {
      this.setData({
        activities: [],
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
