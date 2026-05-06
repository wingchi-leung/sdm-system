const api = require('../../utils/api');
const auth = require('../../utils/auth');
const image = require('../../utils/image');
const tenant = require('../../utils/tenant');

Page({
  data: {
    activityId: null,
    activity: null,
    posterLoadFailed: false,
    canEnroll: false,
    hasRegistered: false,
    registrationStatusText: '',
    actionTipText: '',
    isAdmin: false,
    showAdminPanel: false,
    loading: true,
    error: null,
    statusOptions: [
      { value: 1, label: '未开始' },
      { value: 2, label: '进行中' },
      { value: 3, label: '已结束' },
    ],
    communityPosts: [],
    communityLoading: false,
    communityError: null,
    showCommunitySection: false,
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
    this.setData({ loading: true, error: null, posterLoadFailed: false });
    const tasks = [api.getActivity(activityId)];
    if (auth.isUser()) {
      tasks.push(api.getMyParticipantActivities(activityId));
    }

    Promise.all(tasks)
      .then(async ([activity, registrationRes]) => {
        const registration = registrationRes && registrationRes.items && registrationRes.items[0]
          ? registrationRes.items[0]
          : null;
        const hasRegistered = !!registration;
        const canEnroll = activity.status === 1 || activity.status === 2;
        const showAdminPanel = auth.canManageActivityType({
          id: activity.activity_type_id,
          name: activity.activity_type_name,
          code: activity.activity_type_code,
        });
        const showCommunitySection = showAdminPanel || hasRegistered;
        const statusText = activity.status === 1 ? '未开始' : activity.status === 2 ? '进行中' : '已结束';
        const startDisplay = activity.start_time ? this.formatTime(activity.start_time) : '';
        const endDisplay = activity.end_time ? this.formatTime(activity.end_time) : '';
        let actionTipText = '';
        if (hasRegistered) {
          actionTipText = registration.enroll_status === 2 ? '您已在候补中' : '您已报名该活动';
        } else if (auth.isAdmin()) {
          actionTipText = '管理员账号不可直接报名';
        } else if (!canEnroll) {
          actionTipText = '活动已结束，无法报名';
        }

        const posterUrl = await image.resolveDisplayUrl(activity.poster_url);

        this.setData({
          activity: {
            ...activity,
            poster_url: posterUrl,
            status_text: statusText,
            start_display: startDisplay,
            end_display: endDisplay,
          },
          canEnroll: canEnroll && !hasRegistered && !auth.isAdmin(),
          hasRegistered,
          registrationStatusText: hasRegistered
            ? (registration.enroll_status === 2 ? '候补中' : '已报名')
            : '',
          actionTipText,
          showCommunitySection,
          showAdminPanel,
          loading: false,
        });
        if (showCommunitySection) {
          this.loadCommunityPreview(activity.id);
        } else {
          this.setData({
            communityPosts: [],
            communityLoading: false,
            communityError: null,
          });
        }
      })
      .catch((err) => {
        this.setData({
          error: '加载失败',
          loading: false,
        });
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  },

  onPosterLoad() {
    if (this.data.posterLoadFailed) {
      this.setData({ posterLoadFailed: false });
    }
  },

  onPosterError(e) {
    const posterUrl = this.data.activity && this.data.activity.poster_url
      ? this.data.activity.poster_url
      : '';
    console.error('活动海报加载失败', {
      posterUrl,
      detail: e && e.detail ? e.detail : null,
    });
    this.setData({ posterLoadFailed: true });
    wx.showToast({
      title: '海报加载失败，请检查图片域名配置',
      icon: 'none',
      duration: 2500,
    });
  },
  async loadCommunityPreview(activityId) {
    this.setData({ communityLoading: true, communityError: null });
    try {
      const result = await api.getCommunityPosts(activityId, { limit: 3 });
      this.setData({
        communityPosts: (result.items || []).map((item) => ({
          ...item,
          cover_url: api.getImageUrl(item.cover_url),
          create_time_display: this.formatDate(item.create_time),
        })),
        communityLoading: false,
      });
    } catch (err) {
      this.setData({
        communityLoading: false,
        communityError: err.message || '加载活动动态失败',
      });
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

  formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}.${m}.${day}`;
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

  onViewCommunityList() {
    const activity = this.data.activity || {};
    wx.navigateTo({
      url: tenant.appendTenantToUrl('/pages/community-post-list/community-post-list', {
        activityId: this.data.activityId,
        activityName: activity.activity_name || '',
      }),
    });
  },

  onViewCommunityPost(e) {
    const postId = e.currentTarget.dataset.id;
    if (!postId) return;
    wx.navigateTo({
      url: tenant.appendTenantToUrl('/pages/community-post-detail/community-post-detail', { id: postId }),
    });
  },

  onCreateCommunityPost() {
    const activity = this.data.activity || {};
    wx.navigateTo({
      url: tenant.appendTenantToUrl('/pages/community-post-create/community-post-create', {
        activityId: this.data.activityId,
        activityName: activity.activity_name || '',
      }),
    });
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
