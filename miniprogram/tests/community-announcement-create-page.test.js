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

test('公告发布页标题会按 50 字限制截断', () => {
  const pageConfig = loadPage('../pages/community-announcement-create/community-announcement-create.js', [
    ['../../utils/api.js', {
      getImageUrl: (url) => `https://static.example.com${url}`,
    }],
    ['../../utils/auth.js', {
      isUser: () => true,
      isAdmin: () => false,
    }],
    ['../../utils/tenant.js', {
      applyPageOptions() {},
    }],
  ]);

  const page = createPageInstance(pageConfig);
  page.onTitleInput({ detail: { value: 'b'.repeat(80) } });

  assert.equal(page.data.title.length, 50);
  assert.equal(page.data.titleLength, 50);
});

test('公告发布页提交时会发送富文本内容和图片列表', async () => {
  let createdPayload = null;
  const editorContext = {
    getContents({ success }) {
      success({
        html: '<p>公告正文</p><img src="/uploads/community/announcement.jpg" />',
        text: '公告正文',
      });
    },
  };

  const pageConfig = loadPage('../pages/community-announcement-create/community-announcement-create.js', [
    ['../../utils/api.js', {
      getImageUrl: (url) => `https://static.example.com${url}`,
      createCommunityChannelAnnouncement: async (_channelId, payload) => {
        createdPayload = payload;
        return { id: 1 };
      },
      uploadCommunityImage: async () => ({ url: '/uploads/community/announcement.jpg' }),
    }],
    ['../../utils/auth.js', {
      isUser: () => true,
      isAdmin: () => false,
    }],
    ['../../utils/tenant.js', {
      applyPageOptions() {},
    }],
  ], {
    editorContext,
  });

  const page = createPageInstance(pageConfig);
  page.onLoad({ channelId: '18', channelName: encodeURIComponent('公告频道') });
  page.onTitleInput({ detail: { value: '公告标题' } });

  await page.onSubmit();

  assert.deepEqual(createdPayload, {
    title: '公告标题',
    content: '<p>公告正文</p><img src="/uploads/community/announcement.jpg" />',
    content_format: 'html',
    images: ['/uploads/community/announcement.jpg'],
  });
});
