const { getTabBarSelectedIndex, getCurrentRoute } = require('../utils/tab-bar');

Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: '/pages/index/index',
        iconPath: '/assets/icons/activities.png',
        selectedIconPath: '/assets/icons/activities-active.png'
      },
      {
        pagePath: '/pages/community/index',
        iconPath: '/assets/icons/community.png',
        selectedIconPath: '/assets/icons/community-active.jpg'
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

  pageLifetimes: {
    show() {
      this.updateSelectedFromRoute();
    }
  },

  methods: {
    updateSelectedFromRoute() {
      const selected = getTabBarSelectedIndex(getCurrentRoute());
      if (selected < 0) {
        return;
      }
      this.setData({ selected });
    },

    switchTab(e) {
      const index = Number(e.currentTarget.dataset.index);
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
