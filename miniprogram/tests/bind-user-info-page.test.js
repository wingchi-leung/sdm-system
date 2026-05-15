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

test('绑定资料页将香港证件项展示为港澳台通行证', () => {
  const pageConfig = loadBindUserInfoPage();
  const page = createPageInstance(pageConfig);

  assert.equal(page.data.identityTypeOptions[1].label, '港澳台通行证');
});

test('绑定资料页证件类型不再包含台湾身份证并展示护照', () => {
  const pageConfig = loadBindUserInfoPage();
  const page = createPageInstance(pageConfig);

  assert.equal(page.data.identityTypeOptions.length, 3);
  assert.equal(page.data.identityTypeOptions[2].value, 'foreign');
  assert.equal(page.data.identityTypeOptions[2].label, '护照');
  assert.equal(
    page.data.identityTypeOptions.some((item) => item.value === 'taiwan'),
    false
  );
});

test('绑定资料页港澳台通行证使用通用证件号长度校验', () => {
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
      identity_type: 'hongkong',
      identity_number: 'H123456789',
    },
  });

  assert.equal(page.validateForm(), null);
});
