const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function loadPage(pageRelativePath, moduleMap, wxMock = {}) {
  let pageConfig = null;
  global.Page = (config) => {
    pageConfig = config;
  };
  global.wx = {
    showToast() {},
    showLoading() {},
    hideLoading() {},
    navigateBack() {},
    switchTab() {},
    showModal() {},
    getSystemInfoSync() {
      return { statusBarHeight: 24 };
    },
    createSelectorQuery() {
      return {
        select() {
          return this;
        },
        context(callback) {
          callback({ context: wxMock.editorContext || null });
          return this;
        },
        exec() {},
      };
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

test('发布页在社区模式下会初始化标题和富文本编辑器', () => {
  const pageConfig = loadPage('../pages/community-post-create/community-post-create.js', [
    ['../../utils/api.js', {
      getImageUrl: (url) => `https://static.example.com${url}`,
    }],
    ['../../utils/auth.js', {
      isLoggedIn: () => true,
      isUser: () => true,
      isAdmin: () => false,
      redirectToLogin() {},
    }],
    ['../../utils/tenant.js', {
      applyPageOptions() {},
    }],
  ]);

  const page = createPageInstance(pageConfig);
  page.onLoad({ channelId: '12', channelName: encodeURIComponent('测试社区') });

  assert.equal(page.data.mode, 'channel_post');
  assert.equal(page.data.channelId, 12);
  assert.equal(page.data.channelName, '测试社区');
  assert.equal(page.data.contextName, '测试社区');
  assert.equal(page.data.pageTitle, '发布动态');
  assert.equal(page.data.titlePlaceholder, '输入动态标题');
});

test('发布页在右上角提供发布按钮入口', () => {
  const wxmlPath = path.resolve(__dirname, '../pages/community-post-create/community-post-create.wxml');
  const wxml = fs.readFileSync(wxmlPath, 'utf8');

  assert.match(wxml, /<button/);
  assert.match(wxml, /plain="true"/);
  assert.match(wxml, /bindtap="onSubmit"/);
  assert.match(wxml, /publish-row/);
  assert.match(wxml, /publish-action/);
  assert.match(wxml, /publish-action__text/);
});

test('发布页标题会按 120 字限制截断', () => {
  const pageConfig = loadPage('../pages/community-post-create/community-post-create.js', [
    ['../../utils/api.js', {
      getImageUrl: (url) => `https://static.example.com${url}`,
    }],
    ['../../utils/auth.js', {
      isLoggedIn: () => true,
      isUser: () => true,
      isAdmin: () => false,
      redirectToLogin() {},
    }],
    ['../../utils/tenant.js', {
      applyPageOptions() {},
    }],
  ]);

  const page = createPageInstance(pageConfig);
  page.onTitleInput({ detail: { value: 'a'.repeat(130) } });

  assert.equal(page.data.title.length, 120);
  assert.equal(page.data.titleLength, 120);
});

test('发布页提交时会发送富文本内容和图片列表', async () => {
  let createdPayload = null;
  const editorContext = {
    getContents({ success }) {
      success({
        html: '<p>这是一个新的社区动态</p><img src="/uploads/community/1.jpg" />',
        text: '这是一个新的社区动态',
      });
    },
  };

  const pageConfig = loadPage('../pages/community-post-create/community-post-create.js', [
    ['../../utils/api.js', {
      getImageUrl: (url) => `https://static.example.com${url}`,
      createCommunityChannelPost: async (_channelId, payload) => {
        createdPayload = payload;
        return { id: 1 };
      },
      createCommunityPost: async () => {
        throw new Error('不应触发活动发布');
      },
      uploadCommunityImage: async () => ({ url: '/uploads/community/1.jpg' }),
    }],
    ['../../utils/auth.js', {
      isLoggedIn: () => true,
      isUser: () => true,
      isAdmin: () => false,
      redirectToLogin() {},
    }],
    ['../../utils/tenant.js', {
      applyPageOptions() {},
    }],
  ], {
    editorContext,
  });

  const page = createPageInstance(pageConfig);
  page.onLoad({ channelId: '12', channelName: encodeURIComponent('测试社区') });
  page.onTitleInput({ detail: { value: '我的动态标题' } });

  await page.onSubmit();

  assert.deepEqual(createdPayload, {
    title: '我的动态标题',
    content: '<p>这是一个新的社区动态</p><img src="/uploads/community/1.jpg" />',
    content_format: 'html',
    images: ['/uploads/community/1.jpg'],
  });
});

test('插入图片时会使用缩略宽度和图片样式类', async () => {
  const insertCalls = [];
  const editorContext = {
    insertImage(options) {
      insertCalls.push(options);
      if (typeof options.success === 'function') {
        options.success();
      }
    },
    getContents({ success }) {
      success({
        html: '<img src="/uploads/community/thumb.jpg" />',
        text: '',
      });
    },
  };

  const pageConfig = loadPage('../pages/community-post-create/community-post-create.js', [
    ['../../utils/api.js', {
      getImageUrl: (url) => `https://static.example.com${url}`,
      uploadCommunityImage: async () => ({ url: '/uploads/community/thumb.jpg' }),
    }],
    ['../../utils/auth.js', {
      isLoggedIn: () => true,
      isUser: () => true,
      isAdmin: () => false,
      redirectToLogin() {},
    }],
    ['../../utils/tenant.js', {
      applyPageOptions() {},
    }],
  ], {
    editorContext,
    chooseMedia({ success }) {
      success({
        tempFiles: [{
          tempFilePath: 'wxfile:///tmp/community-thumb.jpg',
          size: 1024,
        }],
      });
    },
  });

  const page = createPageInstance(pageConfig);
  page.onLoad({ channelId: '12', channelName: encodeURIComponent('测试社区') });

  await page.onInsertImage();

  assert.equal(insertCalls.length, 1);
  assert.equal(insertCalls[0].width, '48%');
  assert.equal(insertCalls[0].extClass, 'editor--community-thumb-image');
  assert.equal(insertCalls[0].src, 'https://static.example.com/uploads/community/thumb.jpg');
});

test('活动模式下发布页会提交活动动态', async () => {
  let createdPayload = null;
  const editorContext = {
    getContents({ success }) {
      success({
        html: '<p>活动动态正文</p>',
        text: '活动动态正文',
      });
    },
  };

  const pageConfig = loadPage('../pages/community-post-create/community-post-create.js', [
    ['../../utils/api.js', {
      getImageUrl: (url) => `https://static.example.com${url}`,
      createCommunityChannelPost: async () => {
        throw new Error('不应触发社区频道发布');
      },
      createCommunityPost: async (payload) => {
        createdPayload = payload;
        return { id: 1 };
      },
    }],
    ['../../utils/auth.js', {
      isLoggedIn: () => true,
      isUser: () => true,
      isAdmin: () => false,
      redirectToLogin() {},
    }],
    ['../../utils/tenant.js', {
      applyPageOptions() {},
    }],
  ], {
    editorContext,
  });

  const page = createPageInstance(pageConfig);
  page.onLoad({ activityId: '77', activityName: encodeURIComponent('活动名称') });
  page.onTitleInput({ detail: { value: '活动标题' } });

  await page.onSubmit();

  assert.deepEqual(createdPayload, {
    activity_id: 77,
    title: '活动标题',
    content: '<p>活动动态正文</p>',
    images: [],
  });
});

test('公告模式下会切换为公告配置并提交公告接口', async () => {
  let createdPayload = null;
  const editorContext = {
    getContents({ success }) {
      success({
        html: '<p>公告正文</p><img src="/uploads/community/announcement.jpg" />',
        text: '公告正文',
      });
    },
  };

  const pageConfig = loadPage('../pages/community-post-create/community-post-create.js', [
    ['../../utils/api.js', {
      getImageUrl: (url) => `https://static.example.com${url}`,
      createCommunityChannelAnnouncement: async (_channelId, payload) => {
        createdPayload = payload;
        return { id: 1 };
      },
      uploadCommunityImage: async () => ({ url: '/uploads/community/announcement.jpg' }),
    }],
    ['../../utils/auth.js', {
      isLoggedIn: () => true,
      isUser: () => true,
      isAdmin: () => false,
      redirectToLogin() {},
    }],
    ['../../utils/tenant.js', {
      applyPageOptions() {},
    }],
  ], {
    editorContext,
  });

  const page = createPageInstance(pageConfig);
  page.onLoad({
    mode: 'channel_announcement',
    channelId: '18',
    channelName: encodeURIComponent('公告频道'),
    channelRole: 'admin',
  });
  page.onTitleInput({ detail: { value: 'b'.repeat(80) } });

  assert.equal(page.data.mode, 'channel_announcement');
  assert.equal(page.data.pageTitle, '发布公告');
  assert.equal(page.data.titlePlaceholder, '输入公告标题');
  assert.equal(page.data.title.length, 50);
  assert.equal(page.data.titleLength, 50);

  await page.onSubmit();

  assert.deepEqual(createdPayload, {
    title: 'b'.repeat(50),
    content: '<p>公告正文</p><img src="/uploads/community/announcement.jpg" />',
    content_format: 'html',
    images: ['/uploads/community/announcement.jpg'],
  });
});

test('非频道管理员不能使用公告模式发布', () => {
  let toastTitle = '';
  const pageConfig = loadPage('../pages/community-post-create/community-post-create.js', [
    ['../../utils/api.js', {
      getImageUrl: (url) => `https://static.example.com${url}`,
    }],
    ['../../utils/auth.js', {
      isLoggedIn: () => true,
      isUser: () => true,
      isAdmin: () => false,
      redirectToLogin() {},
    }],
    ['../../utils/tenant.js', {
      applyPageOptions() {},
    }],
  ], {
    showToast({ title }) {
      toastTitle = title;
    },
  });

  const page = createPageInstance(pageConfig);
  page.onBackTap = () => {};
  page.onLoad({
    mode: 'channel_announcement',
    channelId: '18',
    channelName: encodeURIComponent('公告频道'),
    channelRole: 'member',
  });

  assert.equal(toastTitle, '仅频道管理员可发布公告');
});
