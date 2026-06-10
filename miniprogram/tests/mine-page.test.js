const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadMinePage({
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
    navigateTo() {},
    showToast() {},
    showModal() {},
    ...wxMock,
  };

  const moduleMap = [
    ['../../utils/api.js', api],
    ['../../utils/auth.js', auth],
    ['../../utils/image.js', image],
    ['../../utils/tenant.js', tenant],
    ['../../utils/avatar.js', avatar],
  ];
  const minePagePath = require.resolve('../pages/mine/mine.js');
  const minePageDir = path.dirname(minePagePath);

  moduleMap.forEach(([modulePath, exportsValue]) => {
    const resolvedPath = path.resolve(minePageDir, modulePath);
    delete require.cache[resolvedPath];
    require.cache[resolvedPath] = {
      id: resolvedPath,
      filename: resolvedPath,
      loaded: true,
      exports: exportsValue,
    };
  });

  delete require.cache[minePagePath];
  require(minePagePath);

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

function flushTimers() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('普通用户进入我的页面时会先清空管理员残留视图', async () => {
  let resolveProfile;
  let participantActivitiesCalls = 0;
  const profilePromise = new Promise((resolve) => {
    resolveProfile = resolve;
  });

  const pageConfig = loadMinePage({
    api: {
      getUserProfile: () => profilePromise,
      getMyParticipantActivities: () => {
        participantActivitiesCalls += 1;
        return Promise.resolve({ items: [] });
      },
    },
    auth: {
      isAdmin: () => false,
      isUser: () => true,
      getUserName: () => '普通用户',
    },
    image: {
      resolveActivityPosters: async (items) => items,
    },
    tenant: {
      appendTenantToUrl: (url) => url,
    },
    avatar: {
      resolveAvatarDisplayUrl: async () => 'avatar://user',
    },
  });

  const page = createPageInstance(pageConfig, {
    view: 'admin',
    adminProfile: { levelText: '超级管理员' },
    userName: '管理员',
    myActivities: [{ id: 99 }],
  });

  page.checkAuth();

  assert.equal(page.data.view, 'user');
  assert.equal(page.data.loading, true);
  assert.equal(page.data.adminProfile, null);
  assert.equal(page.data.userName, '普通用户');
  assert.deepEqual(page.data.myActivities, []);
  assert.deepEqual(page.data.summaryCards, []);

  resolveProfile({ avatar_url: 'avatar-source', create_time: '2025-02-01T10:00:00.000Z' });
  await flushTimers();
  await flushTimers();

  assert.equal(participantActivitiesCalls, 1);
  assert.equal(page.data.loading, false);
  assert.equal(page.data.joinedLabel, 'Joined 2025');
  assert.deepEqual(page.data.summaryCards, [
    { value: 0, label: '参与探索' },
    { value: 0, label: '笔记与分享' },
    { value: 0, label: '成长时长 (h)' },
  ]);
});

test('我的页会根据报名数据展示统计卡片', async () => {
  let resolveProfile;
  const profilePromise = new Promise((resolve) => {
    resolveProfile = resolve;
  });

  const pageConfig = loadMinePage({
    api: {
      getUserProfile: () => profilePromise,
      getMyParticipantActivities: () => Promise.resolve({
        items: [
          { id: 1, enroll_status: 1, payment_status: 0 },
          { id: 2, enroll_status: 2, payment_status: 0 },
          { id: 3, enroll_status: 1, payment_status: 1 },
        ],
      }),
    },
    auth: {
      isAdmin: () => false,
      isUser: () => true,
      getUserName: () => '普通用户',
    },
    image: {
      resolveActivityPosters: async (items) => items,
    },
    tenant: {
      appendTenantToUrl: (url) => url,
    },
    avatar: {
      resolveAvatarDisplayUrl: async () => 'avatar://user',
    },
  });

  const page = createPageInstance(pageConfig);

  page.checkAuth();
  resolveProfile({ avatar_url: 'avatar-source', create_time: '2024-05-08T10:00:00.000Z' });

  await flushTimers();
  await flushTimers();

  assert.deepEqual(page.data.summaryCards, [
    { value: 3, label: '参与探索' },
    { value: 1, label: '笔记与分享' },
    { value: 1, label: '成长时长 (h)' },
  ]);
  assert.equal(page.data.joinedLabel, 'Joined 2024');
  assert.equal(page.data.avatarDisplayUrl, 'avatar://user');
});

test('退出登录时会立即清空我的页面数据', () => {
  const calls = {
    logout: 0,
    navigateTo: 0,
    showToast: 0,
    showModal: 0,
  };

  const pageConfig = loadMinePage({
    auth: {
      logout: () => {
        calls.logout += 1;
      },
    },
    tenant: {
      appendTenantToUrl: (url) => url,
    },
    wxMock: {
      showModal(options) {
        calls.showModal += 1;
        options.success({ confirm: true, cancel: false });
      },
      navigateTo() {
        calls.navigateTo += 1;
      },
      showToast() {
        calls.showToast += 1;
      },
    },
  });

  const page = createPageInstance(pageConfig, {
    view: 'admin',
    loading: false,
    adminProfile: { levelText: '超级管理员' },
    userName: '管理员',
    avatarDisplayUrl: 'avatar://admin',
    myActivities: [{ id: 1 }],
  });

  page.logout();

  assert.equal(calls.logout, 1);
  assert.equal(calls.navigateTo, 1);
  assert.equal(calls.showToast, 1);
  assert.equal(calls.showModal, 1);
  assert.equal(page.data.view, 'user');
  assert.equal(page.data.loading, false);
  assert.equal(page.data.adminProfile, null);
  assert.equal(page.data.userName, '');
  assert.equal(page.data.avatarDisplayUrl, '');
  assert.deepEqual(page.data.myActivities, []);
  assert.deepEqual(page.data.summaryCards, []);
  assert.equal(page.data.joinedLabel, '');
});

test('我的页可以跳转到设置和协议说明', () => {
  const navUrls = [];
  const pageConfig = loadMinePage({
    tenant: {
      appendTenantToUrl: (url) => url,
    },
    wxMock: {
      navigateTo({ url }) {
        navUrls.push(url);
      },
    },
  });
  const page = createPageInstance(pageConfig);

  page.goSettings();
  page.goAgreementNotes();

  assert.deepEqual(navUrls, ['/pages/settings/settings', '/pages/agreement-notes/agreement-notes']);
});
