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
    showLoading() {},
    hideLoading() {},
    navigateBack() {},
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

test('发布活动提交本地时间字符串，不转成 UTC 时间', async () => {
  let createdPayload = null;
  const pageConfig = loadPage('../pages/create-activity/create-activity.js', [
    ['../../utils/api.js', {
      createActivity: async (payload) => {
        createdPayload = payload;
      },
      getAvailableActivityTypes: async () => [],
    }],
    ['../../utils/auth.js', {
      isAdmin: () => true,
      isSuperAdmin: () => false,
      isActivityTypeAdmin: () => true,
      getAdminActivityTypes: () => [{ id: 1, name: '测试活动', code: 'test' }],
      normalizeActivityType: (item) => item,
      setAdminActivityTypes() {},
      canManageActivityType: () => true,
    }],
    ['../../utils/tenant.js', {
      applyPageOptions() {},
    }],
  ]);
  const page = createPageInstance(pageConfig, {
    activityName: '夜间活动',
    activityTypeName: '测试活动',
    activityTypeIndex: 0,
    activityTypeOptions: [{ id: 1, name: '测试活动', code: 'test' }],
    tag: '测试活动',
    startDate: '2026-05-09',
    startTime: '23:59',
    endDate: '2026-05-10',
    endTime: '00:30',
    requirePayment: false,
    suggestedFee: 0,
  });

  page.submit();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(createdPayload.start_time, '2026-05-09T23:59:00');
  assert.equal(createdPayload.end_time, '2026-05-10T00:30:00');
});

test('编辑活动按后端本地时间字符串回填开始和结束时间', async () => {
  const pageConfig = loadPage('../pages/edit-activity/edit-activity.js', [
    ['../../utils/api.js', {
      getActivity: async () => ({
        activity_name: '夜间活动',
        tag: '夜间',
        start_time: '2026-05-09T23:59:00',
        end_time: '2026-05-10T00:30:00',
        activity_type_name: '测试活动',
        poster_url: '',
        location: '深圳',
      }),
      getImageUrl: (url) => url,
    }],
    ['../../utils/auth.js', {
      isAdmin: () => true,
    }],
    ['../../utils/tenant.js', {
      applyPageOptions() {},
    }],
  ]);
  const page = createPageInstance(pageConfig);

  await page.loadActivity(1);

  assert.equal(page.data.startDate, '2026-05-09');
  assert.equal(page.data.startTime, '23:59');
  assert.equal(page.data.endDate, '2026-05-10');
  assert.equal(page.data.endTime, '00:30');
});
