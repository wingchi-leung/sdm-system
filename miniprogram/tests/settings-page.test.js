const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadSettingsPage({
  api = {},
  auth = {},
  tenant = {},
  wxMock = {},
} = {}) {
  let pageConfig = null;
  global.Page = (config) => {
    pageConfig = config;
  };
  global.wx = {
    showModal() {},
    showToast() {},
    navigateTo() {},
    reLaunch() {},
    ...wxMock,
  };

  const pagePath = require.resolve('../pages/settings/settings.js');
  const pageDir = path.dirname(pagePath);
  [
    ['../../utils/api.js', api],
    ['../../utils/auth.js', auth],
    ['../../utils/tenant.js', tenant],
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

function createPageInstance(config) {
  const instance = {
    data: { ...(config.data || {}) },
    setData(update) {
      this.data = { ...this.data, ...update };
    },
  };
  Object.keys(config).forEach((key) => {
    if (key !== 'data') instance[key] = config[key];
  });
  return instance;
}

test('设置页注销账号确认后会调用接口并退出登录', async () => {
  let deactivateCalls = 0;
  let logoutCalls = 0;
  let reLaunchCalls = 0;

  const pageConfig = loadSettingsPage({
    api: {
      deactivateMyAccount: () => {
        deactivateCalls += 1;
        return Promise.resolve({ success: true });
      },
    },
    auth: {
      isLoggedIn: () => true,
      logout: () => {
        logoutCalls += 1;
      },
    },
    tenant: {
      appendTenantToUrl: (url) => url,
    },
    wxMock: {
      showModal({ success }) {
        success({ confirm: true });
      },
      reLaunch() {
        reLaunchCalls += 1;
      },
    },
  });

  const page = createPageInstance(pageConfig);
  page.onDeactivateAccount();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(deactivateCalls, 1);
  assert.equal(logoutCalls, 1);
  assert.equal(reLaunchCalls, 1);
});

test('设置页未登录时会直接重定向到登录页', () => {
  let reLaunchCalls = 0;

  const pageConfig = loadSettingsPage({
    auth: {
      isLoggedIn: () => false,
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
});
