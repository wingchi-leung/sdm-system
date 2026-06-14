const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');

function buildGroups(pendingData) {
  const map = [
    { key: 'activity_posts', title: '活动动态', itemType: 'activity_post' },
    { key: 'activity_comments', title: '活动评论', itemType: 'activity_comment' },
    { key: 'channel_posts', title: '社区动态', itemType: 'channel_post' },
    { key: 'channel_comments', title: '社区评论', itemType: 'channel_comment' },
  ];
  return map.map((group) => {
    const block = pendingData[group.key] || {};
    const items = Array.isArray(block.items) ? block.items : [];
    return {
      key: group.key,
      title: group.title,
      itemType: group.itemType,
      total: Number(block.total || 0),
      items,
    };
  });
}

Page({
  data: {
    loading: true,
    groups: [],
    error: '',
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    if (!auth.isAdmin()) {
      wx.showToast({ title: '仅管理员可访问', icon: 'none' });
      wx.navigateBack({ delta: 1 });
      return;
    }
    this.loadPending();
  },

  onPullDownRefresh() {
    this.loadPending().finally(() => wx.stopPullDownRefresh());
  },

  loadPending() {
    this.setData({ loading: true, error: '' });
    return api.getCommunityModerationPending({ skip: 0, limit: 50 })
      .then((res) => {
        this.setData({
          loading: false,
          groups: buildGroups(res || {}),
        });
      })
      .catch((err) => {
        this.setData({
          loading: false,
          groups: [],
          error: err && err.message ? err.message : '加载待审核内容失败',
        });
      });
  },

  onApprove(e) {
    this.reviewItem(e, 'approve', '已通过');
  },

  onReject(e) {
    this.reviewItem(e, 'reject', '已驳回');
  },

  reviewItem(e, action, successText) {
    const { itemId, itemType } = e.currentTarget.dataset || {};
    if (!itemId || !itemType) return;
    wx.showLoading({ title: '提交中', mask: true });
    api.reviewCommunityModerationItem(itemType, itemId, action)
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: successText, icon: 'success' });
        this.loadPending();
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: err && err.message ? err.message : '操作失败', icon: 'none' });
      });
  },
});
