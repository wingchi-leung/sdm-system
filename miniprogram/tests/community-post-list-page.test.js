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

test('社区动态列表返回页面时会重新拉取帖子', async () => {
  let loadCount = 0;
  const pageConfig = loadPage('../pages/community-post-list/community-post-list.js', [
    ['../../utils/api.js', {
      getCommunityChannelPosts: async () => ({ items: [], total: 0 }),
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
  });
  page.resolvePageState = () => {};
  page.loadPosts = async () => {
    loadCount += 1;
  };

  page.onShow();

  assert.equal(loadCount, 1);
});

test('社区动态列表在有帖子时不会显示空状态', async () => {
  const pageConfig = loadPage('../pages/community-post-list/community-post-list.js', [
    ['../../utils/api.js', {
      getCommunityChannelPosts: async () => ({
        items: [
          {
            id: 88,
            title: '已发布的动态',
            content: '正文内容',
            images: [],
            preview_comments: [],
            comment_count: 0,
            author_name: '测试用户',
            author_avatar_url: '/avatar.png',
            author_update_time: '2026-06-12T08:00:00.000Z',
            create_time: '2026-06-12T08:00:00.000Z',
          },
        ],
        total: 1,
      }),
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
      parsePostContent: () => ({ text: '正文内容', blocks: [{ type: 'text', text: '正文内容' }] }),
    }],
    ['../../utils/avatar.js', {
      resolveAvatarDisplayUrl: async () => '/avatar.png',
      getDefaultAvatarPath: () => '/default-avatar.png',
    }],
  ]);

  const page = createPageInstance(pageConfig, {
    channelId: 9,
    channelName: '测试社区',
  });

  await page.loadPosts({ reset: true });

  assert.equal(page.data.posts.length, 1);
  assert.equal(page.data.hasMorePosts, false);
  assert.equal(page.data.showEmptyState, false);
});

test('社区动态页管理员会显示成员管理入口', () => {
  const pageConfig = loadPage('../pages/community-post-list/community-post-list.js', [
    ['../../utils/api.js', {
      getCommunityChannelPosts: async () => ({ items: [], total: 0 }),
    }],
    ['../../utils/auth.js', {
      isUser: () => true,
      isAdmin: () => false,
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
    channelRole: 'admin',
  });

  page.resolvePageState();

  assert.equal(page.data.showManageButton, true);
});

test('社区动态页支持展开并提交评论', async () => {
  let submittedPayload = null;
  const pageConfig = loadPage('../pages/community-post-list/community-post-list.js', [
    ['../../utils/api.js', {
      getCommunityChannelPosts: async () => ({ items: [], total: 0 }),
      uploadCommunityImage: async () => ({ url: '/uploads/community/posts/2026/06/demo.jpg' }),
      createCommunityChannelComment: async (_channelId, _postId, payload) => {
        submittedPayload = payload;
        return {
          id: 501,
          channel_id: 9,
          post_id: 88,
          user_id: 1001,
          user_name: '测试用户',
          user_avatar_url: '/avatar.png',
          content: payload.content,
          images: payload.images,
          status: 1,
          create_time: '2026-06-12T08:00:00.000Z',
          update_time: '2026-06-12T08:00:00.000Z',
        };
      },
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
  ], {
    showToast() {},
    showLoading() {},
    hideLoading() {},
    showModal({ success }) {
      success({ confirm: false });
    },
  });

  const page = createPageInstance(pageConfig, {
    channelId: 9,
    channelName: '测试社区',
    posts: [
      {
        id: 88,
        comment_count: 0,
        comments: [],
        commentContent: '这里是评论内容',
        commentImageLocalPaths: [],
        commentSubmitting: false,
      },
    ],
  });

  page.onToggleCommentComposer({ currentTarget: { dataset: { id: '88' } } });
  assert.equal(page.data.posts[0].comment_compose_open, true);

  await page.onSubmitComment({ currentTarget: { dataset: { id: '88' } } });

  assert.deepEqual(submittedPayload, {
    content: '这里是评论内容',
    images: [],
  });
  assert.equal(page.data.posts[0].comment_count, 1);
  assert.equal(page.data.posts[0].comments.length, 1);
  assert.equal(page.data.posts[0].commentContent, '');
  assert.equal(page.data.posts[0].comment_compose_open, false);
});
