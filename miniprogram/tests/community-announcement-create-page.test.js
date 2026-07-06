const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadPage(pageRelativePath, moduleMap, wxMock = {}) {
  let pageConfig = null;
  global.Page = (config) => {
    pageConfig = config;
  };
  global.wx = {
    redirectTo() {},
    navigateTo() {},
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

function createPageInstance(config) {
  const instance = {};
  Object.keys(config).forEach((key) => {
    instance[key] = config[key];
  });
  return instance;
}

test('公告兼容页会跳转到统一发布页', () => {
  let targetUrl = '';
  const pageConfig = loadPage('../pages/community-announcement-create/community-announcement-create.js', [
    ['../../utils/tenant.js', {
      applyPageOptions() {},
      appendTenantToUrl(_url, params) {
        const query = Object.entries(params)
          .map(([key, value]) => `${key}=${value}`)
          .join('&');
        return `/pages/community-post-create/community-post-create?${query}`;
      },
    }],
  ], {
    redirectTo({ url }) {
      targetUrl = url;
    },
  });

  const page = createPageInstance(pageConfig);
  page.onLoad({ channelId: '18', channelName: '公告频道', channelRole: 'admin' });

  assert.equal(
    targetUrl,
    '/pages/community-post-create/community-post-create?channelId=18&channelName=公告频道&channelRole=admin&mode=channel_announcement',
  );
});
