const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadMyOrdersPage({
  api = {},
  auth = {},
  tenant = {},
  paymentOrder = {},
  wxMock = {},
} = {}) {
  let pageConfig = null;
  global.Page = (config) => {
    pageConfig = config;
  };
  global.wx = {
    reLaunch() {},
    showToast() {},
    navigateBack() {},
    ...wxMock,
  };

  const pagePath = require.resolve('../pages/my-orders/my-orders.js');
  const pageDir = path.dirname(pagePath);
  [
    ['../../utils/api.js', api],
    ['../../utils/auth.js', auth],
    ['../../utils/tenant.js', tenant],
    ['../../utils/payment-order.js', paymentOrder],
  ].forEach(([modulePath, exportsValue]) => {
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
    if (key === 'data') return;
    instance[key] = config[key];
  });
  return instance;
}

test('我的订单页未登录时会直接重定向到登录页', () => {
  let reLaunchCalls = 0;

  const pageConfig = loadMyOrdersPage({
    auth: {
      isUser: () => false,
      getUserId: () => null,
    },
    tenant: {
      appendTenantToUrl: (url) => url,
    },
    wxMock: {
      reLaunch() {
        reLaunchCalls += 1;
      },
    },
  });

  const page = createPageInstance(pageConfig);

  page.onShow();

  assert.equal(reLaunchCalls, 1);
  assert.equal(page.data.loading, false);
  assert.deepEqual(page.data.orders, []);
  assert.equal(page.data.summaryText, '暂无订单');
});
