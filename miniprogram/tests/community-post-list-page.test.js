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

test('频道动态列表返回页面时会重新拉取帖子', async () => {
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
    channelName: '测试频道',
  });
  page.resolvePageState = () => {};
  page.loadPosts = async () => {
    loadCount += 1;
  };

  page.onShow();

  assert.equal(loadCount, 1);
});
