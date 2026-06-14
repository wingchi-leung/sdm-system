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
    stopPullDownRefresh() {},
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
  const instance = {
    data: {
      ...config.data,
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

test('活动列表页刷新后会按开始时间倒序展示', async () => {
  const pageConfig = loadPage('../pages/activity-list/activity-list.js', [
    ['../../utils/api.js', {
      getActivities: async () => ({
        items: [
          { id: 1, activity_name: '较早活动', start_time: '2026-06-01T10:00:00' },
          { id: 2, activity_name: '较晚活动', start_time: '2026-06-02T10:00:00' },
        ],
      }),
    }],
    ['../../utils/image.js', {
      resolveActivityPosters: async (items) => items,
    }],
    ['../../utils/tenant.js', {
      applyPageOptions() {},
      appendTenantToUrl: (url) => url,
    }],
  ]);

  const page = createPageInstance(pageConfig);
  await page.refreshList();

  assert.equal(page.data.activities[0].activity_name, '较晚活动');
  assert.equal(page.data.activities[1].activity_name, '较早活动');
});
