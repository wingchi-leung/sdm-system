const api = require('../../utils/api');
const auth = require('../../utils/auth');

Page({
  data: {
    activityId: null,
    activity: null,
    canEnroll: false,
    isAdmin: false,
    loading: true,
    error: null,
    statusOptions: [
      { value: 1, label: '未开始' },
      { value: 2, label: '进行中' },
      { value: 3, label: '已结束' },
    ],
  },

  isFirstLoad: true,

  onLoad(options) {
    const activityId = options.id;
    if (!activityId) {
      this.setData({ error: '参数错误', loading: false });
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    this.setData({
      activityId: activityId,
      isAdmin: auth.isAdmin(),
    });
    this.loadActivity(activityId);
  },

  onShow() {
    // 从编辑页返回时刷新数据（首次加载跳过）
    if (this.isFirstLoad) {
      this.isFirstLoad = false;
      return;
    }
    if (this.data.activityId) {
      this.loadActivity(this.data.activityId);
    }
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

  // 管理员功能
  onViewParticipants() {
    wx.navigateTo({ url: `/pages/activity-participants/activity-participants?id=${this.data.activityId}` });
  },

  onViewCheckins() {
    const name = encodeURIComponent(this.data.activity.activity_name);
    wx.navigateTo({ url: `/pages/activity-checkins/activity-checkins?id=${this.data.activityId}&name=${name}` });
  },

  onViewStatistics() {
    const name = encodeURIComponent(this.data.activity.activity_name);
    wx.navigateTo({ url: `/pages/activity-statistics/activity-statistics?id=${this.data.activityId}&name=${name}` });
  },

  onChangeStatus() {
    const currentStatus = this.data.activity.status;
    const items = this.data.statusOptions.map(s => s.label);

    wx.showActionSheet({
      itemList: items,
      success: async (res) => {
        const newStatus = this.data.statusOptions[res.tapIndex].value;
        if (newStatus === currentStatus) {
          wx.showToast({ title: '当前已是该状态', icon: 'none' });
          return;
        }
        try {
          await api.updateActivityStatus(this.data.activityId, newStatus);
          wx.showToast({ title: '状态更新成功', icon: 'success' });
          this.loadActivity(this.data.activityId);
        } catch (err) {
          wx.showToast({ title: err.message || '更新失败', icon: 'none' });
        }
      },
    });
  },

  onEditActivity() {
    wx.navigateTo({ url: `/pages/edit-activity/edit-activity?id=${this.data.activityId}` });
  },
});
