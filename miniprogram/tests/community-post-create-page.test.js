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

function createSelectorQueryMock(editorCtx) {
  const query = {
    select() {
      return query;
    },
    context(callback) {
      callback({ context: editorCtx });
      return query;
    },
    exec() {},
  };
  return () => query;
}

test('发布页插入图片后会上传并回写编辑器快照', async () => {
  let uploadedPath = '';
  let insertedImageUrl = '';
  const editorCtx = {
    focus() {},
    format() {},
    clear(options) {
      if (options && typeof options.success === 'function') options.success();
    },
    insertImage(options) {
      insertedImageUrl = options.src;
      if (options && typeof options.success === 'function') options.success();
    },
    getContents(options) {
      if (options && typeof options.success === 'function') {
        options.success({
          html: `<p>正文</p><img src="${insertedImageUrl}" />`,
          text: '正文',
        });
      }
    },
  };

  const pageConfig = loadPage('../pages/community-post-create/community-post-create.js', [
    ['../../utils/api.js', {
      uploadCommunityImage: async (filePath) => {
        uploadedPath = filePath;
        return { url: '/uploads/community/1.jpg' };
      },
      getImageUrl: (url) => `https://static.example.com${url}`,
      createCommunityChannelPost: async () => {
        throw new Error('不应触发发布');
      },
    }],
    ['../../utils/auth.js', {
      isUser: () => true,
      isAdmin: () => false,
    }],
    ['../../utils/tenant.js', {
      applyPageOptions() {},
    }],
  ], {
    createSelectorQuery: createSelectorQueryMock(editorCtx),
    chooseMedia(options) {
      options.success({
        tempFiles: [{ tempFilePath: 'tmp://image-1.jpg', size: 1024 }],
      });
    },
  });

  const page = createPageInstance(pageConfig, {
    title: '测试标题',
  });

  page.onLoad({ channelId: '12', channelName: encodeURIComponent('测试社区') });
  await page.onEditorReady();
  await page.onInsertImage();
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(uploadedPath, 'tmp://image-1.jpg');
  assert.equal(insertedImageUrl, 'https://static.example.com/uploads/community/1.jpg');
  // 字符串快照改存相对路径（与后端存储/列表展示链路一致）
  assert.equal(page.data._editorHtml.includes('/uploads/community/1.jpg'), true);
  assert.equal(page.data.contentLength, 2);
});

test('发布页提交时会发送 HTML 内容和图片列表', async () => {
  let createdPayload = null;
  const editorCtx = {
    focus() {},
    format() {},
    clear(options) {
      if (options && typeof options.success === 'function') options.success();
    },
    insertImage() {},
    getContents(options) {
      if (options && typeof options.success === 'function') {
        // 模拟编辑器真实返回的"完整 URL 形态"
        options.success({
          html: '<p>第一段</p><img src="https://static.example.com/uploads/community/1.jpg" />',
          text: '第一段',
        });
      }
    },
  };

  const pageConfig = loadPage('../pages/community-post-create/community-post-create.js', [
    ['../../utils/api.js', {
      uploadCommunityImage: async () => ({ url: '/uploads/community/1.jpg' }),
      getImageUrl: (url) => `https://static.example.com${url}`,
      createCommunityChannelPost: async (_channelId, payload) => {
        createdPayload = payload;
        return { id: 1 };
      },
    }],
    ['../../utils/auth.js', {
      isUser: () => true,
      isAdmin: () => false,
    }],
    ['../../utils/tenant.js', {
      applyPageOptions() {},
    }],
  ], {
    createSelectorQuery: createSelectorQueryMock(editorCtx),
  });

  const page = createPageInstance(pageConfig, {
    title: '测试标题',
  });

  page.onLoad({ channelId: '12', channelName: encodeURIComponent('测试社区') });
  await page.onEditorReady();
  // 模拟 onInsertImage 已记录"完整 URL → 相对路径"映射
  page._uploadedUrlMap = new Map([
    ['https://static.example.com/uploads/community/1.jpg', '/uploads/community/1.jpg'],
  ]);
  await page.onSubmit();

  assert.deepEqual(createdPayload, {
    title: '测试标题',
    content: '<p>第一段</p><img src="/uploads/community/1.jpg" />',
    content_format: 'html',
    images: ['/uploads/community/1.jpg'],
  });
});
