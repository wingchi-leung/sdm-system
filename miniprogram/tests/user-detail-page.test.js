const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadUserDetailPage({
  api = {},
  auth = {},
  tenant = {},
  wxMock = {},
} = {}) {
  let pageConfig = null;
  global.Page = (config) => {
    pageConfig = config;
  };
  global.wx = {
    getSystemInfoSync: () => ({ statusBarHeight: 24 }),
    showToast() {},
    showModal() {},
    showActionSheet() {},
    showLoading() {},
    hideLoading() {},
    navigateBack() {},
    setClipboardData() {},
    stopPullDownRefresh() {},
    ...wxMock,
  };

  const pagePath = require.resolve('../pages/user-detail/user-detail.js');
  const pageDir = path.dirname(pagePath);
  [
    ['../../utils/api.js', api],
    ['../../utils/auth.js', auth],
    ['../../utils/tenant.js', tenant],
  ].forEach(([modulePath, exportsValue]) => {
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

function createPageInstance(config) {
  const instance = {
    data: { ...(config.data || {}) },
    setData(update) {
      this.data = { ...this.data, ...update };
    },
  };
  Object.keys(config).forEach((key) => {
    if (key !== 'data') instance[key] = config[key];
  });
  return instance;
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('用户详情页会把接口数据转换为内页展示结构', async () => {
  const pageConfig = loadUserDetailPage({
    api: {
      getUserDetail: () => Promise.resolve({
        id: 7,
        name: '李四',
        phone: '13800000000',
        email: 'lisi@example.com',
        sex: 'M',
        age: 28,
        occupation: '工程师',
        industry: 'IT',
        identity_type: 'mainland',
        identity_number: '110101199001019999',
        isblock: 0,
        create_time: '2025-06-01T08:09:00.000Z',
        update_time: '2025-06-02T08:09:00.000Z',
      }),
    },
    auth: {
      hasAdminPermission: () => true,
    },
    tenant: {
      applyPageOptions() {},
    },
  });

  const page = createPageInstance(pageConfig);
  page.onLoad({ id: 7 });
  await flush();
  await flush();

  assert.equal(page.data.user.displayName, '李四');
  assert.equal(page.data.user.statusText, '正常');
  assert.deepEqual(page.data.user.infoRows, [
    { label: '手机号', value: '13800000000' },
    { label: '邮箱', value: 'lisi@example.com' },
    { label: '性别', value: '男' },
    { label: '年龄', value: '28' },
  ]);
  assert.equal(page.data.user.profileRows[0].value, '工程师');
  assert.equal(page.data.user.auditRows[2].value, '正常');
});

test('用户详情页会执行拉黑操作并刷新详情', async () => {
  let blockCalls = 0;
  const pageConfig = loadUserDetailPage({
    api: {
      getUserDetail: () => Promise.resolve({
        id: 9,
        name: '王五',
        phone: '13900000000',
        isblock: 0,
        create_time: '2025-06-01T08:09:00.000Z',
        update_time: '2025-06-01T08:09:00.000Z',
      }),
      blockUser: () => {
        blockCalls += 1;
        return Promise.resolve({ success: true });
      },
      unblockUser: () => Promise.resolve({ success: true }),
    },
    auth: {
      hasAdminPermission: () => true,
    },
    tenant: {
      applyPageOptions() {},
    },
    wxMock: {
      showModal({ success }) {
        success({ confirm: true, content: '违规' });
      },
      showLoading() {},
      hideLoading() {},
      showToast() {},
    },
  });

  const page = createPageInstance(pageConfig);
  page.onLoad({ id: 9 });
  await flush();
  await flush();

  page.toggleBlockStatus(true);
  await flush();
  await flush();

  assert.equal(blockCalls, 1);
});
