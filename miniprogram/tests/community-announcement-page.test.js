const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadPage(pageRelativePath, moduleMap) {
  let pageConfig = null;
  global.Page = (config) => {
    pageConfig = config;
  };
  global.wx = {
    showToast() {},
    navigateTo() {},
    getStorageSync() {
      return null;
    },
  };
  global.getApp = () => ({ globalData: {} });

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
      this.data = { ...this.data, ...update };
    },
  };
  Object.keys(config).forEach((key) => {
    if (key !== 'data') instance[key] = config[key];
  });
  return instance;
}

test('社区动态列表 onShow 会并发拉取公告 summary 和帖子', async () => {
  let postsCalled = 0;
  let summaryCalled = 0;
  const pageConfig = loadPage('../pages/community-post-list/community-post-list.js', [
    ['../../utils/api.js', {
      getCommunityChannelPosts: async () => {
        postsCalled += 1;
        return { items: [], total: 0 };
      },
      getCommunityChannelAnnouncementSummary: async () => {
        summaryCalled += 1;
        return { total: 3, latest: { id: 1, title: 'a', create_time: '2026-06-12T08:00:00.000Z' } };
      },
      getCommunityChannelDetail: async () => ({ name: 'x', role: 'member', member_count: 1 }),
    }],
    ['../../utils/auth.js', {
      isUser: () => true,
      isAdmin: () => false,
    }],
    ['../../utils/tenant.js', {
      applyPageOptions() {},
      appendTenantToUrl: (url) => url,
    }],
    ['../../utils/community-content.js', {
      parsePostContent: () => ({ text: '', blocks: [] }),
    }],
    ['../../utils/avatar.js', {
      resolveAvatarDisplayUrl: async () => '/avatar.png',
      getDefaultAvatarPath: () => '/default-avatar.png',
    }],
  ]);

  const page = createPageInstance(pageConfig, {
    channelId: 9,
    channelName: '测试社区',
    channelRole: 'member',
  });
  page.resolvePageState = () => {};
  page.loadChannelDetail = async () => {};
  page.loadPosts = async () => { postsCalled += 1; };

  page.onShow();

  // 等 loadAnnouncementSummary 异步完成
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(postsCalled >= 1, true, 'loadPosts 应被调用');
  assert.equal(summaryCalled, 1, 'loadAnnouncementSummary 应被调用一次');
  assert.equal(page.data.announcementCount, 3, 'announcementCount 应为 3');
});

test('频道管理员角色：showAnnouncementCreate=true；普通成员=false', () => {
  const pageConfig = loadPage('../pages/community-post-list/community-post-list.js', [
    ['../../utils/api.js', {}],
    ['../../utils/auth.js', { isUser: () => true, isAdmin: () => false }],
    ['../../utils/tenant.js', { applyPageOptions() {}, appendTenantToUrl: (u) => u }],
    ['../../utils/community-content.js', {}],
    ['../../utils/avatar.js', {}],
  ]);

  const pageAdmin = createPageInstance(pageConfig, {
    channelRole: 'admin',
    announcementCount: 0,
  });
  pageAdmin.resolvePageState();
  assert.equal(pageAdmin.data.showAnnouncementCreate, true, 'admin 应可见 + 公告');

  const pageMember = createPageInstance(pageConfig, {
    channelRole: 'member',
    announcementCount: 0,
  });
  pageMember.resolvePageState();
  assert.equal(pageMember.data.showAnnouncementCreate, false, 'member 不可见 + 公告');
});

test('公告数 0 时不显示入口卡片；>0 时显示', () => {
  const pageConfig = loadPage('../pages/community-post-list/community-post-list.js', [
    ['../../utils/api.js', {}],
    ['../../utils/auth.js', { isUser: () => true, isAdmin: () => false }],
    ['../../utils/tenant.js', { applyPageOptions() {}, appendTenantToUrl: (u) => u }],
    ['../../utils/community-content.js', {}],
    ['../../utils/avatar.js', {}],
  ]);

  const pageEmpty = createPageInstance(pageConfig, { announcementCount: 0 });
  pageEmpty.resolvePageState();
  assert.equal(pageEmpty.data.showAnnouncementEntry, false, 'count=0 不展示入口');

  const pageFilled = createPageInstance(pageConfig, { announcementCount: 5 });
  pageFilled.resolvePageState();
  assert.equal(pageFilled.data.showAnnouncementEntry, true, 'count>0 展示入口');
});

test('公告列表 onLoad 拉取列表 & summary', async () => {
  let listCalled = 0;
  const pageConfig = loadPage('../pages/community-announcement-list/community-announcement-list.js', [
    ['../../utils/api.js', {
      getCommunityChannelAnnouncements: async () => {
        listCalled += 1;
        return { items: [], total: 0 };
      },
    }],
    ['../../utils/auth.js', { isUser: () => true, isAdmin: () => false }],
    ['../../utils/tenant.js', { applyPageOptions() {}, appendTenantToUrl: (u) => u }],
    ['../../utils/community-content.js', {}],
    ['../../utils/avatar.js', { resolveAvatarDisplayUrl: async () => '/a', getDefaultAvatarPath: () => '/b' }],
  ]);

  const page = createPageInstance(pageConfig, {});
  page.resolvePermissions = () => {};
  page.onLoad({ channelId: 5, channelName: 'CN', channelRole: 'member' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(listCalled, 1, '应调用一次列表');
  assert.equal(page.data.channelId, 5);
  assert.equal(page.data.total, 0);
});

test('公告列表：频道管理员显示发公告按钮；普通成员不显示', () => {
  const pageConfig = loadPage('../pages/community-announcement-list/community-announcement-list.js', [
    ['../../utils/api.js', {}],
    ['../../utils/auth.js', { isUser: () => true, isAdmin: () => false }],
    ['../../utils/tenant.js', { applyPageOptions() {}, appendTenantToUrl: (u) => u }],
    ['../../utils/community-content.js', {}],
    ['../../utils/avatar.js', {}],
  ]);

  const admin = createPageInstance(pageConfig, { channelRole: 'admin' });
  admin.resolvePermissions();
  assert.equal(admin.data.showCreateButton, true);

  const member = createPageInstance(pageConfig, { channelRole: 'member' });
  member.resolvePermissions();
  assert.equal(member.data.showCreateButton, false);
});

test('公告列表 canDelete：发布人或频道管理员可删；其他成员不可', () => {
  const pageConfig = loadPage('../pages/community-announcement-list/community-announcement-list.js', [
    ['../../utils/api.js', {}],
    ['../../utils/auth.js', { isUser: () => true, isAdmin: () => false }],
    ['../../utils/tenant.js', { applyPageOptions() {}, appendTenantToUrl: (u) => u }],
    ['../../utils/community-content.js', {}],
    ['../../utils/avatar.js', {}],
  ]);

  const page = createPageInstance(pageConfig, { channelRole: 'admin' });
  page.resolvePermissions();

  // 模拟 storage 中的 userInfo
  global.wx.getStorageSync = (key) => (key === 'userInfo' ? { id: 42 } : null);

  // author == me
  assert.equal(page.canDelete({ author_user_id: 42 }), true, '本人应可删');
  // 非本人但是 channel admin
  assert.equal(page.canDelete({ author_user_id: 99 }), true, '频道 admin 可删');
});

test('公告列表 canDelete：channelRole=member 且非作者不可删', () => {
  const pageConfig = loadPage('../pages/community-announcement-list/community-announcement-list.js', [
    ['../../utils/api.js', {}],
    ['../../utils/auth.js', { isUser: () => true, isAdmin: () => false }],
    ['../../utils/tenant.js', { applyPageOptions() {}, appendTenantToUrl: (u) => u }],
    ['../../utils/community-content.js', {}],
    ['../../utils/avatar.js', {}],
  ]);

  const page = createPageInstance(pageConfig, { channelRole: 'member' });
  page.resolvePermissions();
  global.wx.getStorageSync = (key) => (key === 'userInfo' ? { id: 7 } : null);

  assert.equal(page.canDelete({ author_user_id: 99 }), false, '普通成员不可删他人');
});

test('公告详情页 onLoad 拉取详情', async () => {
  let detailCalled = 0;
  const pageConfig = loadPage('../pages/community-announcement-detail/community-announcement-detail.js', [
    ['../../utils/api.js', {
      getImageUrl: (url) => {
        if (String(url).includes('/uploads/')) {
          return `https://static.example.com${String(url).replace(/^https?:\/\/[^/]+/, '').replace('/__pageframe__', '')}`;
        }
        return url;
      },
      getCommunityChannelAnnouncementDetail: async (channelId, id) => {
        detailCalled += 1;
        return {
          id,
          channel_id: channelId,
          author_user_id: 1,
          author_name: 'A',
          author_avatar_url: '/a',
          author_update_time: '2026-06-12T08:00:00.000Z',
          title: 'T',
          content: '<p>hello</p>',
          content_format: 'html',
          images: [],
          status: 1,
          create_time: '2026-06-12T08:00:00.000Z',
          update_time: '2026-06-12T08:00:00.000Z',
        };
      },
    }],
    ['../../utils/auth.js', { isUser: () => true, isAdmin: () => false }],
    ['../../utils/tenant.js', { applyPageOptions() {}, appendTenantToUrl: (u) => u }],
    ['../../utils/avatar.js', { resolveAvatarDisplayUrl: async () => '/a', getDefaultAvatarPath: () => '/b' }],
  ]);

  // admin 看的是别人发的公告，canDelete 仍应为 true（频道管理员对所有公告有删权）
  global.wx.getStorageSync = (key) => (key === 'userInfo' ? { id: 999 } : null);

  const page = createPageInstance(pageConfig, {});
  page.onLoad({ id: 9, channelId: 5, channelName: 'CN', channelRole: 'admin' });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(detailCalled, 1);
  assert.equal(page.data.announcementId, 9);
  assert.equal(page.data.announcement.title, 'T');
  assert.equal(page.data.canDelete, true, '频道 admin 看他人的公告也应可删');
});

test('公告详情页会把图片地址规范化为可访问静态地址', async () => {
  const pageConfig = loadPage('../pages/community-announcement-detail/community-announcement-detail.js', [
    ['../../utils/api.js', {
      getImageUrl: (url) => {
        const text = String(url);
        if (text.startsWith('/__pageframe__/uploads/')) {
          return `https://static.example.com${text.replace('/__pageframe__', '')}`;
        }
        if (text.startsWith('/uploads/')) {
          return `https://static.example.com${text}`;
        }
        return text;
      },
      getCommunityChannelAnnouncementDetail: async () => ({
        id: 1,
        channel_id: 5,
        author_user_id: 1,
        author_name: 'A',
        author_avatar_url: '/a',
        author_update_time: '2026-06-12T08:00:00.000Z',
        title: 'T',
        content: '<p>hello</p><img src="/__pageframe__/uploads/community/posts/2026/06/20260621_b47b2f58.jpg" />',
        content_format: 'html',
        images: [],
        status: 1,
        create_time: '2026-06-12T08:00:00.000Z',
        update_time: '2026-06-12T08:00:00.000Z',
      }),
    }],
    ['../../utils/auth.js', { isUser: () => true, isAdmin: () => false }],
    ['../../utils/tenant.js', { applyPageOptions() {}, appendTenantToUrl: (u) => u }],
    ['../../utils/avatar.js', { resolveAvatarDisplayUrl: async () => '/a', getDefaultAvatarPath: () => '/b' }],
  ]);

  const page = createPageInstance(pageConfig, {});
  page.onLoad({ id: 9, channelId: 5, channelName: 'CN', channelRole: 'admin' });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.match(page.data.announcement.content, /https:\/\/static\.example\.com\/uploads\/community\/posts\/2026\/06\/20260621_b47b2f58\.jpg/);
});
