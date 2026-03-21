Component({
  data: {
    selected: 0
  },

  methods: {
    switchTab(e) {
      const index = e.currentTarget.dataset.index;
      const urls = [
        '/pages/index/index',
        '/pages/mine/mine'
      ];

      wx.switchTab({
        url: urls[index]
      });
    }
  }
});