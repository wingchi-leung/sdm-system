const api = require('../../utils/api');
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
  processActivities(items) {
    return (items || []).map(item => ({
      ...item,
      poster_url: api.getImageUrl(item.poster_url),
    }));
  },

  // 刷新列表
  async refreshList() {
    this._isLoaded = true;
    try {
      const result = await api.getActivities({ skip: 0, limit: PAGE_SIZE });
      const activities = this.processActivities(result.items);
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
      const result = await api.getActivities({ skip: this.data.skip, limit: PAGE_SIZE });
      const newItems = this.processActivities(result.items);
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
