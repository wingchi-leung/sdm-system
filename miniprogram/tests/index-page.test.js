const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadIndexPage({
  api = {},
  auth = {},
  image = {},
  tenant = {},
  avatar = {},
  wxMock = {},
} = {}) {
  let pageConfig = null;
  global.Page = (config) => {
    pageConfig = config;
  };
  global.wx = {
    stopPullDownRefresh() {},
    navigateTo() {},
    switchTab() {},
    showToast() {},
    ...wxMock,
  };

  const indexPagePath = require.resolve('../pages/index/index.js');
  const indexPageDir = path.dirname(indexPagePath);
  const moduleMap = [
    ['../../utils/api.js', api],
    ['../../utils/auth.js', auth],
    ['../../utils/image.js', image],
    ['../../utils/tenant.js', tenant],
    ['../../utils/avatar.js', avatar],
  ];

  moduleMap.forEach(([modulePath, exportsValue]) => {
    const resolvedPath = path.resolve(indexPageDir, modulePath);
    delete require.cache[resolvedPath];
    require.cache[resolvedPath] = {
      id: resolvedPath,
      filename: resolvedPath,
      loaded: true,
      exports: exportsValue,
    };
  });

  delete require.cache[indexPagePath];
  require(indexPagePath);
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

test('首页切换到新普通用户时会立即清空旧头像并更新头部状态', () => {
  let resolveActivities;
  const activitiesPromise = new Promise((resolve) => {
    resolveActivities = resolve;
  });

  const pageConfig = loadIndexPage({
    api: {
      getEnrollableActivities: () => activitiesPromise,
      getMyParticipantActivities: () => new Promise(() => {}),
      getUserProfile: () => new Promise(() => {}),
    },
    auth: {
      isAdmin: () => false,
      isUser: () => true,
      isSuperAdmin: () => false,
      getAdminActivityTypes: () => [],
      getUserName: () => '新用户',
      isActivityTypeAdmin: () => false,
    },
    image: {
      resolveActivityPosters: async (items) => items,
    },
    avatar: {
      resolveAvatarDisplayUrl: async () => 'avatar://new-user',
    },
  });

  const page = createPageInstance(pageConfig, {
    isAdmin: true,
    isUser: false,
    canCreateActivity: true,
    headerAvatarUrl: 'avatar://old-user',
    headerAvatarText: '旧',
    activities: [{ id: 1 }],
  });

  page.load();

  assert.equal(page.data.loading, true);
  assert.equal(page.data.isAdmin, false);
  assert.equal(page.data.isUser, true);
  assert.equal(page.data.canCreateActivity, false);
  assert.equal(page.data.headerAvatarUrl, '');
  assert.equal(page.data.headerAvatarText, '新');
  assert.deepEqual(page.data.activities, []);

  resolveActivities({ items: [] });
});

test('首页未登录时会跳转登录页且不会继续加载活动', () => {
  const calls = {
    getEnrollableActivities: 0,
    navigateTo: [],
    showToast: 0,
  };
  const oldSetTimeout = global.setTimeout;
  global.setTimeout = (fn) => {
    fn();
    return 1;
  };

  try {
    const pageConfig = loadIndexPage({
      api: {
        getEnrollableActivities: () => {
          calls.getEnrollableActivities += 1;
          return Promise.resolve({ items: [] });
        },
      },
      auth: {
        isLoggedIn: () => false,
        isAdmin: () => false,
        isUser: () => false,
        isSuperAdmin: () => false,
        getAdminActivityTypes: () => [],
        getUserName: () => '',
      },
      tenant: {
        applyPageOptions() {},
        appendTenantToUrl(url, params = {}) {
          const keys = Object.keys(params);
          if (!keys.length) return url;
          const query = keys
            .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`)
            .join('&');
          return `${url}?${query}`;
        },
      },
      wxMock: {
        navigateTo({ url }) {
          calls.navigateTo.push(url);
        },
        showToast() {
          calls.showToast += 1;
        },
      },
    });

    const page = createPageInstance(pageConfig, {
      activities: [{ id: 9 }],
      isAdmin: true,
      canCreateActivity: true,
      loading: true,
    });

    page.onLoad({});

    assert.equal(calls.getEnrollableActivities, 0);
    assert.equal(calls.showToast, 1);
    assert.equal(calls.navigateTo.length, 1);
    assert.match(calls.navigateTo[0], /\/pages\/login\/login\?redirect=/);
    assert.deepEqual(page.data.activities, []);
    assert.equal(page.data.isAdmin, false);
    assert.equal(page.data.canCreateActivity, false);
    assert.equal(page.data.loading, false);
  } finally {
    global.setTimeout = oldSetTimeout;
  }
});

test('首页会按开始时间排序活动并保留展示字段', async () => {
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const formatDate = (date, hour) => {
    const d = new Date(date);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };

  const pageConfig = loadIndexPage({
    api: {
      getEnrollableActivities: () => Promise.resolve({
        items: [
          {
            id: 2,
            activity_name: '明天的活动',
            start_time: formatDate(tomorrow, 19),
            end_time: formatDate(tomorrow, 21),
            location: '上海',
            current_participants: 12,
          },
          {
            id: 1,
            activity_name: '今天的活动',
            start_time: formatDate(today, 10),
            end_time: formatDate(today, 12),
            location: '北京',
            current_participants: 8,
          },
        ],
      }),
    },
    auth: {
      isAdmin: () => false,
      isUser: () => false,
      isSuperAdmin: () => false,
      isActivityTypeAdmin: () => false,
      getAdminActivityTypes: () => [],
      getUserName: () => '',
    },
    image: {
      resolveActivityPosters: async (items) => items,
    },
    avatar: {
      resolveAvatarDisplayUrl: async () => '',
    },
  });

  const page = createPageInstance(pageConfig);
  await page.load();

  assert.equal(page.data.visibleActivities.length, 2);
  assert.equal(page.data.visibleActivities[0].activity_name, '今天的活动');
  assert.equal(page.data.visibleActivities[0].location_display, '北京');
  assert.equal(page.data.visibleActivities[0].participant_display, '8 人参加');
  assert.equal(page.data.visibleActivities[1].activity_name, '明天的活动');
});

test('首页会按日期分组展示活动标题，便于滚动时定位当前日期', async () => {
  const pageConfig = loadIndexPage({
    api: {
      getEnrollableActivities: () => Promise.resolve({
        items: [
          {
            id: 1,
            activity_name: '六月九号活动A',
            start_time: '2026-06-09T09:00:00',
            end_time: '2026-06-09T11:00:00',
          },
          {
            id: 2,
            activity_name: '六月九号活动B',
            start_time: '2026-06-09T14:00:00',
            end_time: '2026-06-09T16:00:00',
          },
          {
            id: 3,
            activity_name: '六月十号活动',
            start_time: '2026-06-10T10:00:00',
            end_time: '2026-06-10T12:00:00',
          },
        ],
      }),
    },
    auth: {
      isAdmin: () => false,
      isUser: () => false,
      isSuperAdmin: () => false,
      isActivityTypeAdmin: () => false,
      getAdminActivityTypes: () => [],
      getUserName: () => '',
    },
    image: {
      resolveActivityPosters: async (items) => items,
    },
    avatar: {
      resolveAvatarDisplayUrl: async () => '',
    },
  });

  const page = createPageInstance(pageConfig);
  await page.load();

  assert.equal(page.data.dateGroups.length, 2);
  assert.equal(page.data.dateGroups[0].date_label, '6月9日');
  assert.equal(page.data.dateGroups[0].activities.length, 2);
  assert.equal(page.data.dateGroups[1].date_label, '6月10日');
  assert.equal(page.data.dateGroups[1].activities.length, 1);
});

test('首页活动接口参数：超级管理员使用管理员视角，其它账号使用用户视角', async () => {
  const calls = [];
  const pageConfig = loadIndexPage({
    api: {
      getEnrollableActivities: (opts) => {
        calls.push(opts);
        return Promise.resolve({ items: [] });
      },
    },
    auth: {
      isAdmin: () => true,
      isUser: () => false,
      isSuperAdmin: () => true,
      isActivityTypeAdmin: () => false,
      getAdminActivityTypes: () => [],
      getUserName: () => '超管',
    },
    image: {
      resolveActivityPosters: async (items) => items,
    },
    avatar: {
      resolveAvatarDisplayUrl: async () => '',
    },
  });
  const page = createPageInstance(pageConfig);
  await page.load();
  assert.deepEqual(calls[0], { asUserView: false });

  calls.length = 0;
  const pageConfig2 = loadIndexPage({
    api: {
      getEnrollableActivities: (opts) => {
        calls.push(opts);
        return Promise.resolve({ items: [] });
      },
      getMyParticipantActivities: () => Promise.resolve({ items: [] }),
      getUserProfile: () => Promise.resolve({ avatar_url: '' }),
    },
    auth: {
      isAdmin: () => false,
      isUser: () => true,
      isSuperAdmin: () => false,
      isActivityTypeAdmin: () => false,
      getAdminActivityTypes: () => [],
      getUserName: () => '普通用户',
    },
    image: {
      resolveActivityPosters: async (items) => items,
    },
    avatar: {
      resolveAvatarDisplayUrl: async () => '',
    },
  });
  const page2 = createPageInstance(pageConfig2);
  await page2.load();
  assert.deepEqual(calls[0], { asUserView: true });
});

test('首页会把待支付报名标记为待支付而不是已报名', async () => {
  const pageConfig = loadIndexPage({
    api: {
      getEnrollableActivities: () => Promise.resolve({
        items: [
          {
            id: 1,
            activity_name: '测试活动',
            start_time: '2026-05-07T08:00:00.000Z',
          },
        ],
      }),
      getMyParticipantActivities: () => Promise.resolve({
        items: [
          {
            id: 1,
            enroll_status: 1,
            payment_status: 1,
          },
        ],
      }),
      getUserProfile: () => Promise.resolve({ avatar_url: '' }),
    },
    auth: {
      isAdmin: () => false,
      isUser: () => true,
      isSuperAdmin: () => false,
      isActivityTypeAdmin: () => false,
      getAdminActivityTypes: () => [],
      getUserName: () => '普通用户',
    },
    image: {
      resolveActivityPosters: async (items) => items,
    },
    avatar: {
      resolveAvatarDisplayUrl: async () => '',
    },
  });
  const page = createPageInstance(pageConfig);
  await page.load();

  assert.equal(page.data.activities[0].has_registered, false);
  assert.equal(page.data.activities[0].registration_status_text, '待支付');
});
