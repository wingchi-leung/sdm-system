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
    getWindowInfo() {
      return { statusBarHeight: 24 };
    },
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

test('社区管理页会加载成员列表并允许管理员邀请成员', async () => {
  let invitedPayload = null;
  let pickerUrl = '';
  let pickerHandler = null;
  let actionSheetItems = [];
  let kickedMemberId = null;
  let editUrl = '';
  const pageConfig = loadPage('../pages/community-channel-manage/community-channel-manage.js', [
    ['../../utils/api.js', {
      getCommunityChannelDetail: async () => ({
        id: 7,
        name: '测试社区',
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
      kickCommunityChannelMember: async (_channelId, userId) => {
        kickedMemberId = userId;
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
    navigateTo({ url, success }) {
      if (url.includes('/pages/user-list/user-list')) {
        pickerUrl = url;
      }
      if (url.includes('/pages/community-channel-create/community-channel-create')) {
        editUrl = url;
      }
      if (typeof success === 'function') {
        success({
          eventChannel: {
            on(eventName, handler) {
              if (eventName === 'selected-users') {
                pickerHandler = handler;
              }
            },
          },
        });
      }
    },
    showActionSheet({ itemList, success }) {
      actionSheetItems = itemList;
      success({ tapIndex: 0 });
    },
    showModal({ success }) {
      success({ confirm: true });
    },
  });

  const page = createPageInstance(pageConfig);
  page.onLoad({ channelId: '7', channelName: encodeURIComponent('测试社区'), channelRole: 'member' });
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

  page.onEditChannel();
  assert.match(editUrl, /\/pages\/community-channel-create\/community-channel-create\?channelId=7/);

  await page.onMemberMore({
    currentTarget: {
      dataset: {
        member: page.data.members[0],
      },
    },
  });
  assert.deepEqual(actionSheetItems, ['删除成员']);
  assert.equal(kickedMemberId, 1001);
});

test('社区管理页支持管理员删除社区并回到上一页', async () => {
  let deletedChannelId = null;
  let navigateBackCount = 0;
  const pageConfig = loadPage('../pages/community-channel-manage/community-channel-manage.js', [
    ['../../utils/api.js', {
      getCommunityChannelDetail: async () => ({
        id: 7,
        name: '测试社区',
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
  page.onLoad({ channelId: '7', channelName: encodeURIComponent('测试社区'), channelRole: 'admin' });
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(page.data.showDeleteButton, true);

  await page.onDeleteChannel();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(deletedChannelId, 7);
  assert.equal(navigateBackCount, 1);
  assert.equal(page.data.deleting, false);
});

test('社区管理页使用统一页头并保留状态栏高度', async () => {
  const pageConfig = loadPage('../pages/community-channel-manage/community-channel-manage.js', [
    ['../../utils/api.js', {
      getCommunityChannelDetail: async () => ({
        id: 7,
        name: '测试社区',
        role: 'member',
        member_count: 0,
      }),
      getCommunityChannelMembers: async () => ({
        items: [],
        total: 0,
      }),
    }],
    ['../../utils/auth.js', {
      getUserId: () => 9000,
    }],
    ['../../utils/tenant.js', {
      applyPageOptions() {},
      appendTenantToUrl: (url) => url,
    }],
  ]);

  const page = createPageInstance(pageConfig);
  page.onLoad({ channelId: '7', channelName: encodeURIComponent('测试社区'), channelRole: 'member' });
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(page.data.statusBarHeight, 24);
  assert.equal(page.data.loading, false);
  assert.ok(pageConfig);
});
