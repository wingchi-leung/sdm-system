const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadPage(pageRelativePath, moduleMap, wxMock = {}, appMock = {}) {
  let pageConfig = null;
  global.Page = (config) => {
    pageConfig = config;
  };
  global.wx = {
    showToast() {},
    ...wxMock,
  };
  global.getApp = () => appMock;

  const pagePath = require.resolve(pageRelativePath);
  const pageDir = path.dirname(pagePath);
  moduleMap.forEach(([modulePath, exportsValue]) => {
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
    if (key !== 'data') instance[key] = config[key];
  });
  return instance;
}

test('社区首页在收到删除脏标记后会先清空旧频道再重拉空态', async () => {
  let channelCalls = 0;
  const appMock = {
    globalData: {
      channelListDirty: true,
    },
  };
  const pageConfig = loadPage(
    '../pages/community/index.js',
    [
      ['../../utils/api.js', {
        getCommunityChannels: async () => {
          channelCalls += 1;
          return { items: [], total: 0 };
        },
        getCommunityNotificationUnreadCount: async () => ({ unread_count: 0 }),
      }],
      ['../../utils/auth.js', {
        isAdmin: () => false,
      }],
      ['../../utils/tenant.js', {
        appendTenantToUrl: (url) => url,
      }],
      ['../../utils/tab-bar.js', {
        syncTabBarSelected() {},
      }],
    ],
    {},
    appMock,
  );

  const page = createPageInstance(pageConfig, {
    channels: [
      { id: 1, name: '旧频道' },
    ],
  });

  page.onShow();

  assert.equal(page.data.loading, true);
  assert.deepEqual(page.data.channels, []);
  assert.equal(appMock.globalData.channelListDirty, false);

  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(channelCalls, 1);
  assert.equal(page.data.loading, false);
  assert.deepEqual(page.data.channels, []);
  assert.equal(page.data.error, null);
});

test('社区首页管理员频道可以进入成员管理页', async () => {
  let navigatedUrl = '';
  const pageConfig = loadPage(
    '../pages/community/index.js',
    [
      ['../../utils/api.js', {
        getCommunityChannels: async () => ({ items: [] }),
        getCommunityNotificationUnreadCount: async () => ({ unread_count: 0 }),
      }],
      ['../../utils/auth.js', {
        isAdmin: () => false,
      }],
      ['../../utils/tenant.js', {
        appendTenantToUrl: (url, params) => {
          const query = new URLSearchParams(params).toString();
          return query ? `${url}?${query}` : url;
        },
      }],
      ['../../utils/tab-bar.js', {
        syncTabBarSelected() {},
      }],
    ],
    {
      navigateTo: ({ url }) => {
        navigatedUrl = url;
      },
    },
  );

  const page = createPageInstance(pageConfig);
  page.onManageChannelMembers({
    currentTarget: {
      dataset: {
        channel: {
          id: 12,
          name: '测试频道',
          role: 'admin',
        },
      },
    },
  });

  assert.match(navigatedUrl, /\/pages\/community-channel-manage\/community-channel-manage/);
  assert.match(navigatedUrl, /channelId=12/);
  assert.match(navigatedUrl, /channelName=%E6%B5%8B%E8%AF%95%E9%A2%91%E9%81%93/);
});
