const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadUserListPage({
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
    navigateTo() {},
    switchTab() {},
    stopPullDownRefresh() {},
    setClipboardData() {},
    ...wxMock,
  };

  const pagePath = require.resolve('../pages/user-list/user-list.js');
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

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('用户管理页会把接口数据转换为设计稿所需的展示字段', async () => {
  const pageConfig = loadUserListPage({
    api: {
      getAllUsersForAdmin: () => Promise.resolve({
        items: [
          {
            id: 1,
            name: '张三',
            phone: '13068281239',
            email: 'zhangsan@example.com',
            isblock: 0,
            create_time: '2025-06-01T08:09:00.000Z',
          },
        ],
        total: 12,
        skip: 0,
        limit: 20,
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
  await page.loadUsers(false);

  assert.equal(page.data.loading, false);
  assert.equal(page.data.total, 12);
  assert.equal(page.data.users.length, 1);
  assert.deepEqual(page.data.users[0], {
    id: 1,
    name: '张三',
    phone: '13068281239',
    email: 'zhangsan@example.com',
    isblock: 0,
    create_time: '2025-06-01T08:09:00.000Z',
    displayName: '张三',
    contactText: '13068281239',
    badgeText: '成员',
    badgeClass: '',
    statusText: '正常',
    createdAtText: '2025-06-01 16:09',
    normalizedContact: '13068281239',
    isBlocked: false,
    isSelected: false,
  });
  assert.equal(page.data.emptyTitle, '暂无成员');
});

test('用户更多菜单会按状态触发拉黑流程', async () => {
  let actionSheetItems = [];
  let blockCalls = 0;

  const pageConfig = loadUserListPage({
    api: {
      getAllUsersForAdmin: () => Promise.resolve({ items: [], total: 0, skip: 0, limit: 20 }),
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
      showActionSheet({ itemList, success }) {
        actionSheetItems = itemList;
        success({ tapIndex: itemList.length - 1 });
      },
      showModal({ success }) {
        success({ confirm: true, content: '不当言论' });
      },
      showLoading() {},
      hideLoading() {},
      showToast() {},
    },
  });

  const page = createPageInstance(pageConfig);
  const user = page.normalizeUserItem({
    id: 2,
    name: '李四',
    phone: '13800000000',
    email: 'lisi@example.com',
    isblock: 0,
  });

  assert.deepEqual(page.buildUserMenuItems(user), ['查看详情', '复制联系方式', '拉黑用户']);

  page.onUserMore({
    currentTarget: {
      dataset: { user },
    },
  });

  await flush();
  await flush();
  await flush();

  assert.deepEqual(actionSheetItems, ['查看详情', '复制联系方式', '拉黑用户']);
  assert.equal(blockCalls, 1);
});

test('用户条目点击会跳转到详情内页', () => {
  const navUrls = [];
  const pageConfig = loadUserListPage({
    auth: {
      hasAdminPermission: () => true,
    },
    tenant: {
      applyPageOptions() {},
      appendTenantToUrl: (url, params = {}) => {
        const query = Object.keys(params)
          .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`)
          .join('&');
        return query ? `${url}?${query}` : url;
      },
    },
    wxMock: {
      navigateTo({ url }) {
        navUrls.push(url);
      },
    },
  });
  const page = createPageInstance(pageConfig);

  page.showUserDetail({
    id: 99,
    displayName: '测试用户',
    contactText: '13000000000',
    statusText: '正常',
    createdAtText: '2026-06-10 16:21',
  });

  assert.deepEqual(navUrls, ['/pages/user-detail/user-detail?id=99']);
});

test('用户列表在选择模式下会回传已选用户', async () => {
  const emitted = [];
  const pageConfig = loadUserListPage({
    api: {
      getAllUsersForAdmin: () => Promise.resolve({
        items: [
          {
            id: 101,
            name: '王五',
            phone: '13900000001',
            email: '',
            isblock: 0,
            create_time: '2025-06-01T08:09:00.000Z',
          },
          {
            id: 102,
            name: '赵六',
            phone: '13900000002',
            email: '',
            isblock: 0,
            create_time: '2025-06-01T08:09:00.000Z',
          },
        ],
        total: 2,
        skip: 0,
        limit: 20,
      }),
    },
    auth: {
      hasAdminPermission: () => true,
    },
    tenant: {
      applyPageOptions() {},
    },
    wxMock: {
      navigateBack() {},
      showToast() {},
    },
  });

  const page = createPageInstance(pageConfig);
  page.getOpenerEventChannel = () => ({
    emit(eventName, payload) {
      emitted.push({ eventName, payload });
    },
    on() {},
  });

  page.onLoad({
    mode: 'picker',
    title: '选择邀请成员',
    confirm_text: '邀请并发送',
    hint: '请选择成员。',
  });
  await flush();

  assert.equal(page.data.selectionMode, true);
  assert.equal(page.data.pageTitle, '选择邀请成员');

  page.onUserTap({
    currentTarget: {
      dataset: { user: page.data.users[0] },
    },
  });
  page.onInviteMembers();

  assert.equal(page.data.selectedCount, 1);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].eventName, 'selected-users');
  assert.deepEqual(emitted[0].payload.user_ids, [101]);
});

test('用户列表在选择模式下会正确解码标题和提示文案', async () => {
  const pageConfig = loadUserListPage({
    api: {
      getAllUsersForAdmin: () => Promise.resolve({ items: [], total: 0, skip: 0, limit: 20 }),
    },
    auth: {
      hasAdminPermission: () => true,
    },
    tenant: {
      applyPageOptions() {},
    },
    wxMock: {
      showToast() {},
    },
  });

  const page = createPageInstance(pageConfig);
  page.onLoad({
    mode: 'picker',
    title: encodeURIComponent('选择邀请成员'),
    confirm_text: encodeURIComponent('邀请并发送'),
    hint: encodeURIComponent('从用户列表中勾选要邀请到当前频道的成员。'),
  });
  await flush();

  assert.equal(page.data.pageTitle, '选择邀请成员');
  assert.equal(page.data.confirmText, '邀请并发送');
  assert.equal(page.data.selectionHint, '从用户列表中勾选要邀请到当前频道的成员。');
});
