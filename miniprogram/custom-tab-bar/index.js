Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: '/pages/index/index',
        iconPath: '/assets/icons/activity-default.png',
        selectedIconPath: '/assets/icons/activity-active.png'
      },
      {
        pagePath: '/pages/mine/mine',
        iconPath: '/assets/icons/mine-default.png',
        selectedIconPath: '/assets/icons/mine-active.png'
      }
    ]
  },

  lifetimes: {
    attached() {
      this.updateSelectedFromRoute();
    }
  },

  methods: {
    updateSelectedFromRoute() {
      const pages = getCurrentPages();
      if (!pages || pages.length === 0) {
        return;
      }
      const currentRoute = `/${pages[pages.length - 1].route}`;
      const selected = this.data.list.findIndex((item) => item.pagePath === currentRoute);
      this.setData({
        selected: selected >= 0 ? selected : 0
      });
    },

    switchTab(e) {
      const index = e.currentTarget.dataset.index;
      const item = this.data.list[index];
      if (!item) {
        return;
      }
      if (index === this.data.selected) {
        return;
      }
      this.setData({ selected: index });

      wx.switchTab({
        url: item.pagePath
      });
    }
  }
});
