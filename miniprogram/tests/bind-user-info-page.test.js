const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadBindUserInfoPage({ api = {}, auth = {}, tenant = {}, wxMock = {} } = {}) {
  let pageConfig = null;
  global.Page = (config) => {
    pageConfig = config;
  };
  global.wx = {
    getStorageSync() { return ''; },
    getLaunchOptionsSync() { return {}; },
    getEnterOptionsSync() { return {}; },
    ...wxMock,
  };

  const pagePath = require.resolve('../pages/bind-user-info/bind-user-info.js');
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

test('绑定资料页不再包含证件字段配置', () => {
  const pageConfig = loadBindUserInfoPage();
  const page = createPageInstance(pageConfig);

  assert.equal(Object.prototype.hasOwnProperty.call(page.data.formData, 'identity_type'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(page.data.formData, 'identity_number'), false);
});

test('绑定资料页基础信息可通过校验（无证件信息）', () => {
  const pageConfig = loadBindUserInfoPage();
  const page = createPageInstance(pageConfig, {
    formData: {
      name: '测试用户',
      sex: 'male',
      age: '30',
      occupation: '设计师',
      phone: '13800138000',
      email: 'demo@example.com',
      industry: '教育',
    },
  });

  assert.equal(page.validateForm(), null);
});

test('绑定资料页邮箱不能为空', () => {
  const pageConfig = loadBindUserInfoPage();
  const page = createPageInstance(pageConfig, {
    formData: {
      name: '测试用户',
      sex: 'male',
      age: '30',
      occupation: '设计师',
      phone: '13800138000',
      email: '',
      industry: '教育',
    },
  });

  assert.equal(page.validateForm(), '请输入邮箱');
});

test('绑定资料页遇到脱敏手机号时应锁定手机号输入框并展示脱敏值', () => {
  const pageConfig = loadBindUserInfoPage({
    tenant: {
      applyPageOptions() {},
    },
    wxMock: {
      getStorageSync(key) {
        if (key === 'wechat_phone') return '138****8000';
        return '';
      },
    },
  });
  const page = createPageInstance(pageConfig);

  page.onLoad({});

  assert.equal(page.data.phoneReadonly, true);
  assert.equal(page.data.formData.phone, '138****8000');
});
