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
    navigateBack() {},
    setNavigationBarTitle() {},
    ...wxMock,
  };

  const pagePath = require.resolve(pageRelativePath);
  const pageDir = path.dirname(pagePath);
  Object.keys(moduleMap).forEach((modulePath) => {
    const resolvedPath = path.resolve(pageDir, modulePath);
    delete require.cache[resolvedPath];
    require.cache[resolvedPath] = {
      id: resolvedPath,
      filename: resolvedPath,
      loaded: true,
      exports: moduleMap[modulePath],
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

test('报名人员页返回前台时会清空失效管理员数据', () => {
  const pageConfig = loadPage('../pages/activity-participants/activity-participants.js', {
    '../../utils/api.js': {},
    '../../utils/auth.js': {
      isAdmin: () => false,
    },
    '../../utils/tenant.js': {},
  });
  const page = createPageInstance(pageConfig, {
    activityId: 1,
    participants: [{ id: 1, participant_name: '旧报名用户' }],
    total: 1,
    currentPage: 2,
    totalPages: 3,
    loading: false,
    isAdmin: true,
  });

  page.onShow();

  assert.deepEqual(page.data.participants, []);
  assert.equal(page.data.total, 0);
  assert.equal(page.data.currentPage, 0);
  assert.equal(page.data.totalPages, 1);
  assert.equal(page.data.isAdmin, false);
});

test('用户管理页返回前台时会清空失效管理员数据', () => {
  const pageConfig = loadPage('../pages/user-list/user-list.js', {
    '../../utils/api.js': {},
    '../../utils/auth.js': {
      hasAdminPermission: () => false,
    },
    '../../utils/tenant.js': {},
  });
  const page = createPageInstance(pageConfig, {
    users: [{ id: 8, name: '旧用户' }],
    total: 1,
    skip: 20,
    loading: false,
    hasMore: false,
  });

  page.onShow();

  assert.deepEqual(page.data.users, []);
  assert.equal(page.data.total, 0);
  assert.equal(page.data.skip, 0);
  assert.equal(page.data.loading, false);
  assert.equal(page.data.hasMore, true);
});

test('我的订单页返回前台时会清空非普通用户订单数据', () => {
  const pageConfig = loadPage('../pages/my-orders/my-orders.js', {
    '../../utils/api.js': {},
    '../../utils/auth.js': {
      isUser: () => false,
      getUserId: () => 1,
    },
    '../../utils/tenant.js': {},
    '../../utils/payment-order.js': {},
  });
  const page = createPageInstance(pageConfig, {
    loading: false,
    orders: [{ order_no: 'OLD' }],
    summaryText: '共 1 笔订单',
    error: '旧错误',
  });

  page.onShow();

  assert.deepEqual(page.data.orders, []);
  assert.equal(page.data.summaryText, '暂无订单');
  assert.equal(page.data.loading, false);
  assert.equal(page.data.error, null);
});

test('动态详情页返回前台时会按当前身份关闭评论能力', () => {
  const pageConfig = loadPage('../pages/community-post-detail/community-post-detail.js', {
    '../../utils/api.js': {},
    '../../utils/auth.js': {
      isUser: () => false,
      isAdmin: () => false,
    },
    '../../utils/tenant.js': {},
  });
  const page = createPageInstance(pageConfig, {
    postId: 2,
    canComment: true,
  });

  page.onShow();

  assert.equal(page.data.canComment, false);
});
