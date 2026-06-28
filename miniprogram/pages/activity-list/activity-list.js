const api = require('../../utils/api');
const image = require('../../utils/image');
const { resolveActivityPostersOrFallback } = require('../../utils/image-safe');
const tenant = require('../../utils/tenant');

// 分页配置
const PAGE_SIZE = 20;

Page({
  data: {
    activities: [],
    loading: true,
    // 分页状态
    hasMore: true,
    loadingMore: false,
    skip: 0,
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    this.loadActivities(true);
  },

  onShow() {
    // 从其他页面返回时刷新列表
    if (this._isLoaded) {
      this.refreshList();
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.refreshList().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 上拉加载更多
  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.loadMoreActivities();
    }
  },

  // 处理活动数据，转换图片URL
  async processActivities(items) {
    return resolveActivityPostersOrFallback(image, items || [], '活动管理列表');
  },

  sortActivitiesDesc(items) {
    return [...(items || [])].sort((a, b) => {
      const aTime = a.start_time ? new Date(a.start_time).getTime() : 0;
      const bTime = b.start_time ? new Date(b.start_time).getTime() : 0;
      return bTime - aTime;
    });
  },

  // 刷新列表
  async refreshList() {
    this._isLoaded = true;
    try {
      const result = await api.getActivities({ skip: 0, limit: PAGE_SIZE, asUserView: false });
      const activities = this.sortActivitiesDesc(await this.processActivities(result.items));
      this.setData({
        activities: activities,
        hasMore: (result.items || []).length >= PAGE_SIZE,
        skip: result.items?.length || 0,
        loading: false,
      });
    } catch (err) {
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  // 加载活动（初始加载）
  async loadActivities(isInit = false) {
    if (isInit) {
      this._isLoaded = true;
    }
    await this.refreshList();
  },

  // 加载更多活动
  async loadMoreActivities() {
    if (this.data.loadingMore || !this.data.hasMore) return;

    this.setData({ loadingMore: true });
    try {
      const result = await api.getActivities({ skip: this.data.skip, limit: PAGE_SIZE, asUserView: false });
      const newItems = this.sortActivitiesDesc(await this.processActivities(result.items));
      this.setData({
        activities: [...this.data.activities, ...newItems],
        hasMore: newItems.length >= PAGE_SIZE,
        skip: this.data.skip + newItems.length,
        loadingMore: false,
      });
    } catch (err) {
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loadingMore: false });
    }
  },

  onViewDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: tenant.appendTenantToUrl('/pages/activity-detail/activity-detail', { id }) });
  },
});
