const TAB_BAR_ITEMS = [
  {
    pagePath: '/pages/index/index',
  },
  {
    pagePath: '/pages/community/index',
  },
  {
    pagePath: '/pages/mine/mine',
  },
];

function normalizeRoute(route) {
  const text = route == null ? '' : String(route).trim();
  if (!text) return '';
  return text.startsWith('/') ? text : `/${text}`;
}

function getTabBarSelectedIndex(route) {
  const currentRoute = normalizeRoute(route);
  if (!currentRoute) return -1;

  const selected = TAB_BAR_ITEMS.findIndex((item) => item.pagePath === currentRoute);
  return selected >= 0 ? selected : -1;
}

function getCurrentRoute() {
  const pages = getCurrentPages();
  if (!pages || pages.length === 0) {
    return '';
  }

  return normalizeRoute(pages[pages.length - 1].route);
}

function syncTabBarSelected(page) {
  if (!page || typeof page.getTabBar !== 'function') {
    return false;
  }

  const tabBar = page.getTabBar();
  if (!tabBar || typeof tabBar.setData !== 'function') {
    return false;
  }

  const selected = getTabBarSelectedIndex(getCurrentRoute());
  if (selected < 0) {
    return false;
  }

  tabBar.setData({
    selected,
  });
  return true;
}

module.exports = {
  TAB_BAR_ITEMS,
  getCurrentRoute,
  getTabBarSelectedIndex,
  syncTabBarSelected,
};
