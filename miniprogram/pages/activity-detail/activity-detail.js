const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');

Page({
  data: {
    activityId: null,
    activity: null,
    canEnroll: false,
    isAdmin: false,
    showAdminPanel: false,
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
    tenant.applyPageOptions(options);
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
        const showAdminPanel = auth.canManageActivityType({
          id: activity.activity_type_id,
          name: activity.activity_type_name,
          code: activity.activity_type_code,
        });
        const statusText = activity.status === 1 ? '未开始' : activity.status === 2 ? '进行中' : '已结束';
        const startDisplay = activity.start_time ? this.formatTime(activity.start_time) : '';
        const endDisplay = activity.end_time ? this.formatTime(activity.end_time) : '';

        this.setData({
          activity: {
            ...activity,
            poster_url: api.getImageUrl(activity.poster_url),
            status_text: statusText,
            start_display: startDisplay,
            end_display: endDisplay,
          },
          canEnroll,
          showAdminPanel,
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
    // 只传递活动 ID，避免 URL 过长
    wx.navigateTo({
      url: tenant.appendTenantToUrl('/pages/register/register', { id: activity.id }),
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
    wx.navigateTo({ url: tenant.appendTenantToUrl('/pages/activity-participants/activity-participants', { id: this.data.activityId }) });
  },

  onViewCheckins() {
    const name = this.data.activity.activity_name;
    wx.navigateTo({ url: tenant.appendTenantToUrl('/pages/activity-checkins/activity-checkins', { id: this.data.activityId, name }) });
  },

  onViewStatistics() {
    const name = this.data.activity.activity_name;
    wx.navigateTo({ url: tenant.appendTenantToUrl('/pages/activity-statistics/activity-statistics', { id: this.data.activityId, name }) });
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
    wx.navigateTo({ url: tenant.appendTenantToUrl('/pages/edit-activity/edit-activity', { id: this.data.activityId }) });
  },

  onDeleteActivity() {
    const activity = this.data.activity;
    wx.showModal({
      title: '确认删除',
      content: `确定要删除活动"${activity.activity_name}"吗？此操作不可撤销。`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await api.deleteActivity(this.data.activityId);
            wx.showToast({ title: '删除成功', icon: 'success' });
            setTimeout(() => wx.navigateBack(), 1500);
          } catch (err) {
            wx.showToast({ title: err.message || '删除失败', icon: 'none' });
          }
        }
      },
    });
  },

  onShareAppMessage() {
    const activity = this.data.activity || {};
    return {
      title: activity.activity_name || '活动详情',
      path: tenant.appendTenantToUrl('/pages/activity-detail/activity-detail', { id: this.data.activityId }),
    };
  },
});
