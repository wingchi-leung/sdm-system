Page({
  data: {
    activity: null,
    canEnroll: false,
  },

  onLoad(options) {
    try {
      const data = options.data ? decodeURIComponent(options.data) : '';
      const activity = data ? JSON.parse(data) : null;
      if (!activity) {
        wx.showToast({ title: '参数错误', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
        return;
      }
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
      });
    } catch (e) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    }
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
    // 从报名页返回可刷新上一页列表，由 index 的 onShow 或从详情再返回时由 index 自己处理
    const pages = getCurrentPages();
    const prev = pages[pages.length - 2];
    if (prev && prev.route === 'pages/index/index' && prev.load) {
      prev.load();
    }
  },
});
