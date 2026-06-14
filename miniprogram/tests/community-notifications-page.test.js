const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadPage(pageRelativePath, moduleMap, wxMock = {}) {
  let pageConfig = null;
  global.Page = (config) => {
    pageConfig = config;
  };
  global.wx = {
    showToast() {},
    navigateBack() {},
    ...wxMock,
  };

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

test('站内信页会正确映射邀请消息并统计未读数', async () => {
  const pageConfig = loadPage(
    '../pages/community-notifications/community-notifications.js',
    [
      ['../../utils/api.js', {
        getCommunityNotifications: async () => ({
          items: [
            {
              id: 1,
              type: 'channel_invite',
              title: '邀请你加入社区',
              content: '欢迎加入',
              data: {
                action: 'channel_invite',
                channel_id: 88,
                channel_name: '测试社区',
                inviter_name: '管理员',
              },
              is_read: 0,
              create_time: '2026-06-12T03:02:00Z',
            },
          ],
        }),
        markCommunityNotificationsReadAll: async () => ({ success: true }),
      }],
    ],
  );

  const page = createPageInstance(pageConfig);

  await page.loadNotifications();

  assert.equal(page.data.loading, false);
  assert.equal(page.data.error, null);
  assert.equal(page.data.items.length, 1);
  assert.equal(page.data.unreadCount, 1);
  assert.equal(page.data.items[0].type_label, '社区邀请');
  assert.equal(page.data.items[0].status_label, '待处理');
  assert.equal(page.data.items[0].can_respond, true);
  assert.equal(page.data.items[0].has_channel, true);
});

test('站内信页的全部已读会重新拉取消息', async () => {
  let loadCount = 0;
  const pageConfig = loadPage(
    '../pages/community-notifications/community-notifications.js',
    [
      ['../../utils/api.js', {
        getCommunityNotifications: async () => {
          loadCount += 1;
          return { items: [] };
        },
        markCommunityNotificationsReadAll: async () => ({ success: true }),
      }],
    ],
    {
      showToast() {},
    },
  );

  const page = createPageInstance(pageConfig);
  await page.onReadAll();

  assert.equal(loadCount, 1);
});
