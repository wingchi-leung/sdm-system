const api = require('../../utils/api');

Component({
  properties: {
    size: { type: String, value: '58rpx' },
    top: { type: String, value: '82rpx' },
    right: { type: String, value: '18rpx' },
    // 外部可直接传入未读数;若 autoFetch=true 则组件自行拉取
    unreadCount: { type: Number, value: 0 },
    // 只显示小红点不显示数字
    dotOnly: { type: Boolean, value: false },
    // 是否在 attached 时自动拉取未读数
    autoFetch: { type: Boolean, value: true },
  },

  data: {
    styleText: '',
    _internalUnread: 0,
  },

  observers: {
    'size, top, right': function updateStyle(size, top, right) {
      this.setData({
        styleText: `top: ${top}; right: ${right}; width: ${size}; height: ${size};`,
      });
    },
  },

  computed: {
    // 实际展示的未读数:优先用内部拉取值,外部传值为兜底
    displayCount() {
      return this.data._internalUnread || this.data.unreadCount;
    },
  },

  lifetimes: {
    attached() {
      const { size, top, right } = this.data;
      this.setData({
        styleText: `top: ${top}; right: ${right}; width: ${size}; height: ${size};`,
      });
      if (this.data.autoFetch) {
        this._fetchUnreadCount();
      }
    },
  },

  methods: {
    async _fetchUnreadCount() {
      try {
        const res = await api.getCommunityNotificationUnreadCount();
        this.setData({ _internalUnread: Number(res.unread_count || 0) });
      } catch (_) {
        // 静默失败,保持当前计数
      }
    },

    onTap() {
      wx.navigateTo({ url: '/pages/community-notifications/community-notifications' });
    },

    // 外部可调用此方法刷新未读数(如标记已读后)
    refresh() {
      this._fetchUnreadCount();
    },
  },
});
