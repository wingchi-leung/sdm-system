const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadPage(pageRelativePath, moduleMap = {}, wxMock = {}) {
  let pageConfig = null;
  global.Page = (config) => {
    pageConfig = config;
  };
  global.wx = {
    showToast() {},
    showModal() {},
    navigateBack() {},
    reLaunch() {},
    setNavigationBarTitle() {},
    getSystemInfoSync() {
      return { statusBarHeight: 24 };
    },
    ...wxMock,
  };

  const pagePath = require.resolve(pageRelativePath);
  const pageDir = path.dirname(pagePath);
  Object.entries(moduleMap).forEach(([modulePath, exportsValue]) => {
    const resolvedPath = path.resolve(pageDir, modulePath);
    delete require.cache[resolvedPath];
    require.cache[resolvedPath] = {
      id: resolvedPath,
      filename: resolvedPath,
      loaded: true,
      exports: exportsValue,
    };
  });

  delete require.cache[pagePath];
  require(pagePath);
  return pageConfig;
}

function createPageInstance(config, initialData = {}) {
  const instance = {
    data: {
      ...config.data,
      ...initialData,
    },
    setData(update) {
      this.data = {
        ...this.data,
        ...update,
      };
    },
  };

  Object.keys(config).forEach((key) => {
    if (key === 'data') return;
    instance[key] = config[key];
  });
  return instance;
}

function expectRedirect(pageRelativePath, { trigger, moduleMap = {}, wxMock = {}, initialData = {}, callArgs = {} }) {
  let reLaunchCalls = 0;
  let showToastCalls = 0;
  const pageConfig = loadPage(pageRelativePath, moduleMap, {
    reLaunch() {
      reLaunchCalls += 1;
    },
    showToast() {
      showToastCalls += 1;
    },
    ...wxMock,
  });
  const page = createPageInstance(pageConfig, initialData);

  trigger(page, callArgs);

  assert.equal(reLaunchCalls, 1);
  assert.equal(showToastCalls >= 1, true);
}

test('未登录时会直接跳转登录页：我的活动', () => {
  expectRedirect('../pages/my-activities/my-activities.js', {
    moduleMap: {
      '../../utils/api.js': {},
      '../../utils/auth.js': {
        isLoggedIn: () => false,
        isUser: () => false,
        isActivityTypeAdmin: () => false,
        redirectToLogin(message) {
          wx.showToast({ title: message, icon: 'none' });
          wx.reLaunch({ url: '/pages/login/login' });
        },
      },
      '../../utils/image.js': {},
      '../../utils/image-safe.js': { resolveActivityPostersOrFallback: async (_image, items) => items },
      '../../utils/tenant.js': { applyPageOptions() {} },
      '../../utils/mine-data.js': { formatParticipantActivities: (items) => items },
    },
    trigger: (page) => page.onShow(),
  });
});

test('未登录时会直接跳转登录页：报名管理', () => {
  expectRedirect('../pages/activity-participants/activity-participants.js', {
    moduleMap: {
      '../../utils/api.js': {},
      '../../utils/auth.js': {
        isLoggedIn: () => false,
        isAdmin: () => false,
        redirectToLogin(message) {
          wx.showToast({ title: message, icon: 'none' });
          wx.reLaunch({ url: '/pages/login/login' });
        },
      },
      '../../utils/tenant.js': { applyPageOptions() {} },
    },
    trigger: (page) => page.onLoad({ id: 1 }),
  });
});

test('未登录时会直接跳转登录页：报名统计', () => {
  expectRedirect('../pages/activity-statistics/activity-statistics.js', {
    moduleMap: {
      '../../utils/api.js': {},
      '../../utils/auth.js': {
        isLoggedIn: () => false,
        isAdmin: () => false,
        redirectToLogin(message) {
          wx.showToast({ title: message, icon: 'none' });
          wx.reLaunch({ url: '/pages/login/login' });
        },
      },
      '../../utils/tenant.js': { applyPageOptions() {} },
    },
    trigger: (page) => page.onLoad({ id: 1 }),
  });
});

test('未登录时会直接跳转登录页：签到记录', () => {
  expectRedirect('../pages/activity-checkins/activity-checkins.js', {
    moduleMap: {
      '../../utils/api.js': {},
      '../../utils/auth.js': {
        isLoggedIn: () => false,
        isAdmin: () => false,
        redirectToLogin(message) {
          wx.showToast({ title: message, icon: 'none' });
          wx.reLaunch({ url: '/pages/login/login' });
        },
      },
      '../../utils/tenant.js': { applyPageOptions() {} },
    },
    trigger: (page) => page.onLoad({ id: 1 }),
  });
});

test('未登录时会直接跳转登录页：发布活动', () => {
  expectRedirect('../pages/create-activity/create-activity.js', {
    moduleMap: {
      '../../utils/api.js': {},
      '../../utils/auth.js': {
        isLoggedIn: () => false,
        isAdmin: () => false,
        redirectToLogin(message) {
          wx.showToast({ title: message, icon: 'none' });
          wx.reLaunch({ url: '/pages/login/login' });
        },
        isSuperAdmin: () => false,
        isActivityTypeAdmin: () => false,
        getAdminActivityTypes: () => [],
        normalizeActivityType: (item) => item,
        setAdminActivityTypes() {},
        canManageActivityType: () => false,
        updateAdminMeta() {},
        getAdminLevel: () => null,
        getToken: () => '',
      },
      '../../utils/tenant.js': { applyPageOptions() {} },
    },
    trigger: (page) => page.onLoad({}),
  });
});

test('未登录时会直接跳转登录页：编辑活动', () => {
  expectRedirect('../pages/edit-activity/edit-activity.js', {
    moduleMap: {
      '../../utils/api.js': {},
      '../../utils/auth.js': {
        isLoggedIn: () => false,
        isAdmin: () => false,
        redirectToLogin(message) {
          wx.showToast({ title: message, icon: 'none' });
          wx.reLaunch({ url: '/pages/login/login' });
        },
      },
      '../../utils/tenant.js': { applyPageOptions() {} },
    },
    trigger: (page) => page.onLoad({}),
  });
});

test('未登录时会直接跳转登录页：社区发帖', () => {
  expectRedirect('../pages/community-post-create/community-post-create.js', {
    moduleMap: {
      '../../utils/api.js': {},
      '../../utils/auth.js': {
        isLoggedIn: () => false,
        isUser: () => false,
        isAdmin: () => false,
        redirectToLogin(message) {
          wx.showToast({ title: message, icon: 'none' });
          wx.reLaunch({ url: '/pages/login/login' });
        },
      },
      '../../utils/tenant.js': { applyPageOptions() {} },
    },
    trigger: (page) => page.onLoad({ channelId: '12', channelName: '测试社区' }),
  });
});

test('未登录时会直接跳转登录页：社区创建', () => {
  expectRedirect('../pages/community-channel-create/community-channel-create.js', {
    moduleMap: {
      '../../utils/api.js': {},
      '../../utils/auth.js': {
        isLoggedIn: () => false,
        isAdmin: () => false,
        redirectToLogin(message) {
          wx.showToast({ title: message, icon: 'none' });
          wx.reLaunch({ url: '/pages/login/login' });
        },
      },
      '../../config/index.js': { baseUrl: 'http://localhost:8000' },
    },
    trigger: (page) => page.onLoad({}),
  });
});
