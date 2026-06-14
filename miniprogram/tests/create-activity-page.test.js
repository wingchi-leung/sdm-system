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
    chooseMedia() {},
    setStorageSync() {},
    getStorageSync() { return 0; },
    showLoading() {},
    hideLoading() {},
    navigateBack() {},
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

test('发布活动页选择海报后会进入可预览状态', () => {
  const pageConfig = loadPage('../pages/create-activity/create-activity.js', [
    ['../../utils/api.js', {
      getAvailableActivityTypes: async () => [],
    }],
    ['../../utils/auth.js', {
      isAdmin: () => true,
      isSuperAdmin: () => false,
      isActivityTypeAdmin: () => false,
      getAdminActivityTypes: () => [],
      normalizeActivityType: (item) => item,
      setAdminActivityTypes() {},
      canManageActivityType: () => true,
    }],
    ['../../utils/tenant.js', {
      applyPageOptions() {},
    }],
  ], {
    showModal({ success }) {
      success({ confirm: true });
    },
    chooseMedia({ success }) {
      success({
        tempFiles: [
          {
            tempFilePath: 'wxfile:///tmp/poster.jpg',
            size: 1024,
          },
        ],
      });
    },
  });

  const page = createPageInstance(pageConfig);

  page.onChoosePoster();

  assert.equal(page.data.posterLocalPath, 'wxfile:///tmp/poster.jpg');
  assert.equal(page.data.error, null);

  page.onRemovePoster();
  assert.equal(page.data.posterLocalPath, '');
  assert.equal(page.data.posterUrl, '');
});
