const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadLoginPage({
  api = {},
  auth = {},
  tenant = {},
  privacy = {},
  wxMock = {},
} = {}) {
  let pageConfig = null;
  global.Page = (config) => {
    pageConfig = config;
  };
  global.wx = {
    vibrateShort() {},
    switchTab() {},
    redirectTo() {},
    showToast() {},
    login() {},
    setStorageSync() {},
    ...wxMock,
  };

  const loginPagePath = require.resolve('../pages/login/login.js');
  const loginPageDir = path.dirname(loginPagePath);
  const moduleMap = [
    ['../../utils/api.js', api],
    ['../../utils/auth.js', auth],
    ['../../utils/tenant.js', tenant],
    ['../../utils/privacy.js', privacy],
  ];

  moduleMap.forEach(([modulePath, exportsValue]) => {
    const resolvedPath = path.resolve(loginPageDir, modulePath);
    delete require.cache[resolvedPath];
    require.cache[resolvedPath] = {
      id: resolvedPath,
      filename: resolvedPath,
      loaded: true,
      exports: exportsValue,
    };
  });

  delete require.cache[loginPagePath];
  require(loginPagePath);
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

test('登录页连续点击五次隐藏入口会切换到管理员模式', () => {
  let vibrateCount = 0;
  const oldSetTimeout = global.setTimeout;
  const oldClearTimeout = global.clearTimeout;
  global.setTimeout = () => 1;
  global.clearTimeout = () => {};

  try {
    const pageConfig = loadLoginPage({
      api: { isUnsafeBaseUrl: () => false },
      tenant: { applyPageOptions() {} },
      wxMock: {
        vibrateShort() {
          vibrateCount += 1;
        },
      },
    });

    const page = createPageInstance(pageConfig, {
      isAdminMode: false,
      account: 'old',
      password: 'secret',
      error: '旧错误',
    });

    for (let i = 0; i < 5; i += 1) {
      page.onGateIconTap();
    }

    assert.equal(vibrateCount, 1);
    assert.equal(page.data.isAdminMode, true);
    assert.equal(page.data.account, '');
    assert.equal(page.data.password, '');
    assert.equal(page.data.error, null);
  } finally {
    global.setTimeout = oldSetTimeout;
    global.clearTimeout = oldClearTimeout;
  }
});

test('退出管理员模式会清空管理员表单状态', () => {
  const pageConfig = loadLoginPage({
    api: { isUnsafeBaseUrl: () => false },
    tenant: { applyPageOptions() {} },
  });

  const page = createPageInstance(pageConfig, {
    isAdminMode: true,
    account: 'admin',
    password: 'pwd',
    error: '登录失败',
  });

  page.exitAdminMode();

  assert.equal(page.data.isAdminMode, false);
  assert.equal(page.data.account, '');
  assert.equal(page.data.password, '');
  assert.equal(page.data.error, null);
});

test('手机号授权点击前会触发隐私授权检查', async () => {
  let called = 0;
  const pageConfig = loadLoginPage({
    api: { isUnsafeBaseUrl: () => false },
    tenant: { applyPageOptions() {} },
    privacy: {
      ensurePrivacyAuthorization: async () => {
        called += 1;
        return true;
      },
    },
  });
  const page = createPageInstance(pageConfig);

  page.onPhoneAuthTap();
  await Promise.resolve();

  assert.equal(called, 1);
});

