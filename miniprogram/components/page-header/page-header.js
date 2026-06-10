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
    statusBarHeight: {
      type: Number,
      value: 0,
    },
    showBack: {
      type: Boolean,
      value: true,
    },
  },

  lifetimes: {
    attached() {
      const fallbackHeight = (() => {
        try {
          const systemInfo = typeof wx.getSystemInfoSync === 'function' ? wx.getSystemInfoSync() : null;
          return Number(systemInfo && systemInfo.statusBarHeight) || 0;
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
      this.triggerEvent('back');
    },
  },
});
