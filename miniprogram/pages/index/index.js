const api = require('../../utils/api');
const auth = require('../../utils/auth');

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
    canCreateActivity: false,
  },

  resolveAdminState() {
    const isAdmin = auth.isAdmin();
    const canCreateActivity = auth.isSuperAdmin() || auth.getAdminActivityTypes().length > 0;
    this.setData({ isAdmin, canCreateActivity });
  },

  onLoad() {
    this.resolveAdminState();
    this.load();
  },

  onShow() {
    this.resolveAdminState();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    this.setData({ loading: true, error: null });
    return api
      .getEnrollableActivities()
      .then((res) => {
        let items = (res.items || []).map((a) => ({
          ...a,
          start_time_display: a.start_time ? this.formatTime(a.start_time) : '',
          status_text: a.status === 1 ? '未开始' : a.status === 2 ? '进行中' : '已结束',
        }));
        if (auth.isActivityTypeAdmin()) {
          items = items.filter((a) => auth.canManageActivityType(a));
        }
        this.setData({ activities: items, loading: false });
      })
      .catch((err) => {
        const msg = formatLoadError(err);
        this.setData({ error: msg, loading: false, activities: [] });
      });
  },

  onRefresh() {
    this.load();
  },

  goDetail(e) {
    const a = e.currentTarget.dataset.activity;
    if (!a) return;
    wx.navigateTo({
      url: '/pages/activity-detail/activity-detail?data=' + encodeURIComponent(JSON.stringify(a)),
    });
  },

  goCreateActivity() {
    wx.navigateTo({ url: '/pages/create-activity/create-activity' });
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
});
