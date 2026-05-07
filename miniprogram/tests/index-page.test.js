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
