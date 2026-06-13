Component({
  options: {
    multipleSlots: true,
  },

  data: {
    resolvedStatusBarHeight: 0,
  },

  properties: {
    title: {
      type: String,
      value: '',
    },
    titleStyle: {
      type: String,
      value: '',
    },
    statusBarHeight: {
      type: Number,
      value: 0,
    },
    showBack: {
      type: Boolean,
      value: true,
    },
    autoBack: {
      type: Boolean,
      value: true,
    },
  },

  lifetimes: {
    attached() {
      const fallbackHeight = (() => {
        try {
          if (typeof wx.getWindowInfo === 'function') {
            const windowInfo = wx.getWindowInfo();
            return Number(windowInfo && windowInfo.statusBarHeight) || 0;
          }
          if (typeof wx.getSystemInfoSync === 'function') {
            const systemInfo = wx.getSystemInfoSync();
            return Number(systemInfo && systemInfo.statusBarHeight) || 0;
          }
          return 0;
        } catch (_) {
          return 0;
        }
      })();
      const height = Number(this.properties.statusBarHeight || 0) || fallbackHeight;
      this.setData({ resolvedStatusBarHeight: height });
    },
  },

  methods: {
    onBackTap() {
      if (this.properties.autoBack) {
        wx.navigateBack({
          fail: () => {
            const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
            if (pages.length > 1) return;
          },
        });
        return;
      }
      this.triggerEvent('back');
    },
  },
});
