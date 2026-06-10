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
    showModal() {},
    showLoading() {},
    hideLoading() {},
    stopPullDownRefresh() {},
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

test('频道管理页会加载成员列表并允许管理员邀请成员', async () => {
  let invitedPayload = null;
  let pickerUrl = '';
  let pickerHandler = null;
  const pageConfig = loadPage('../pages/community-channel-manage/community-channel-manage.js', [
    ['../../utils/api.js', {
      getCommunityChannelDetail: async () => ({
        id: 7,
        name: '测试频道',
        role: 'admin',
        member_count: 2,
      }),
      getCommunityChannelMembers: async () => ({
        items: [
          {
            id: 1,
            user_id: 1001,
            user_name: '张三',
            role: 'admin',
            status: 'active',
            create_time: '2026-06-10T08:00:00.000Z',
          },
          {
            id: 2,
            user_id: 1002,
            user_name: '李四',
            role: 'member',
            status: 'banned',
            create_time: '2026-06-10T09:00:00.000Z',
          },
        ],
        total: 2,
      }),
      inviteCommunityChannelMembers: async (_channelId, userIds) => {
        invitedPayload = userIds;
        return { invited_count: userIds.length };
      },
      kickCommunityChannelMember: async () => ({ success: true }),
      banCommunityChannelMember: async () => ({ success: true }),
      unbanCommunityChannelMember: async () => ({ success: true }),
    }],
    ['../../utils/auth.js', {
      getUserId: () => 9000,
    }],
    ['../../utils/tenant.js', {
      applyPageOptions() {},
      appendTenantToUrl: (url, params = {}) => {
        const query = Object.keys(params)
          .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`)
          .join('&');
        return query ? `${url}?${query}` : url;
      },
    }],
  ], {
    navigateTo({ url, success }) {
      pickerUrl = url;
      success({
        eventChannel: {
          on(eventName, handler) {
            if (eventName === 'selected-users') {
              pickerHandler = handler;
            }
          },
        },
      });
    },
  });

  const page = createPageInstance(pageConfig);
  page.onLoad({ channelId: '7', channelName: encodeURIComponent('测试频道'), channelRole: 'member' });
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(page.data.showInviteButton, true);
  assert.equal(page.data.members.length, 2);
  assert.equal(page.data.members[0].role_label, '管理员');
  assert.equal(page.data.members[1].status_label, '禁言');

  await page.onInviteMembers();
  assert.match(pickerUrl, /\/pages\/user-list\/user-list\?mode=picker/);

  await pickerHandler({ user_ids: [1003, 1004, 1003] });
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.deepEqual(invitedPayload, [1003, 1004]);
});

test('频道管理页支持管理员删除频道并回到上一页', async () => {
  let deletedChannelId = null;
  let navigateBackCount = 0;
  const pageConfig = loadPage('../pages/community-channel-manage/community-channel-manage.js', [
    ['../../utils/api.js', {
      getCommunityChannelDetail: async () => ({
        id: 7,
        name: '测试频道',
        role: 'admin',
        member_count: 2,
      }),
      getCommunityChannelMembers: async () => ({
        items: [],
        total: 0,
      }),
      deleteCommunityChannel: async (channelId) => {
        deletedChannelId = channelId;
        return { success: true };
      },
    }],
    ['../../utils/auth.js', {
      getUserId: () => 9000,
    }],
    ['../../utils/tenant.js', {
      applyPageOptions() {},
      appendTenantToUrl: (url, params = {}) => {
        const query = Object.keys(params)
          .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`)
          .join('&');
        return query ? `${url}?${query}` : url;
      },
    }],
  ], {
    showModal({ success }) {
      success({ confirm: true });
    },
    navigateBack() {
      navigateBackCount += 1;
    },
  });

  const page = createPageInstance(pageConfig);
  page.onLoad({ channelId: '7', channelName: encodeURIComponent('测试频道'), channelRole: 'admin' });
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(page.data.showDeleteButton, true);

  await page.onDeleteChannel();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(deletedChannelId, 7);
  assert.equal(navigateBackCount, 1);
  assert.equal(page.data.deleting, false);
});
