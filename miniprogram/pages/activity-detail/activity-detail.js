const api = require('../../utils/api');
const auth = require('../../utils/auth');

Page({
  data: {
    activity: null,
    canEnroll: false,
    loading: true,
    error: null,
  },

  onLoad(options) {
    const activityId = options.id;
    if (!activityId) {
      this.setData({ error: '参数错误', loading: false });
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    this.loadActivity(activityId);
  },

  loadActivity(activityId) {
    this.setData({ loading: true, error: null });

    api.getActivity(activityId)
      .then((activity) => {
        const canEnroll = activity.status === 1 || activity.status === 2;
        const statusText = activity.status === 1 ? '未开始' : activity.status === 2 ? '进行中' : '已结束';
        const startDisplay = activity.start_time ? this.formatTime(activity.start_time) : '';
        const endDisplay = activity.end_time ? this.formatTime(activity.end_time) : '';

        this.setData({
          activity: {
            ...activity,
            status_text: statusText,
            start_display: startDisplay,
            end_display: endDisplay,
          },
          canEnroll,
          loading: false,
        });
      })
      .catch((err) => {
        console.error('加载活动详情失败:', err);
        this.setData({
          error: '加载失败',
          loading: false,
        });
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  },

  formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}年${m}月${day}日 ${h}:${min}`;
  },

  goRegister() {
    const activity = this.data.activity;
    if (!activity || !this.data.canEnroll) return;
    wx.navigateTo({
      url: '/pages/register/register?data=' + encodeURIComponent(JSON.stringify(activity)),
    });
  },

  onBackFromRegister() {
    const pages = getCurrentPages();
    const prev = pages[pages.length - 2];
    if (prev && prev.route === 'pages/index/index' && prev.load) {
      prev.load();
    }
  },
});
