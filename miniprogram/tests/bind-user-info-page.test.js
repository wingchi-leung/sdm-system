const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadBindUserInfoPage({ api = {}, auth = {}, tenant = {}, avatar = {}, wxMock = {} } = {}) {
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
    ['../../utils/auth.js', {
      hasPendingBindInfo: () => true,
      ...auth,
    }],
    ['../../utils/tenant.js', tenant],
    ['../../utils/avatar.js', {
      resolveAvatarDisplayUrl: async (value) => value,
      getDefaultAvatarPath: () => '/assets/avatars/avatar-1.svg',
      ...avatar,
    }],
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
      const nextData = { ...this.data };
      Object.keys(update || {}).forEach((key) => {
        if (key.includes('.')) {
          const parts = key.split('.');
          let target = nextData;
          for (let i = 0; i < parts.length - 1; i += 1) {
            const part = parts[i];
            if (!target[part] || typeof target[part] !== 'object') {
              target[part] = {};
            }
            target = target[part];
          }
          target[parts[parts.length - 1]] = update[key];
          return;
        }
        nextData[key] = update[key];
      });
      this.data = nextData;
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

test('绑定资料页年龄输入会自动过滤英文和符号', () => {
  const pageConfig = loadBindUserInfoPage();
  const page = createPageInstance(pageConfig);

  page.onAgeInput({ detail: { value: '12ab-3' } });

  assert.equal(page.data.formData.age, '123');
});

test('绑定资料页遇到脱敏手机号时应锁定手机号输入框并展示脱敏值', () => {
  const pageConfig = loadBindUserInfoPage({
    auth: {
      hasPendingBindInfo: () => true,
    },
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

test('绑定资料页输入框聚焦态由受控状态维护', () => {
  const pageConfig = loadBindUserInfoPage({
    auth: {
      hasPendingBindInfo: () => true,
    },
    tenant: {
      applyPageOptions() {},
    },
  });
  const page = createPageInstance(pageConfig);

  page.onFieldFocus({ currentTarget: { dataset: { field: 'name' } } });
  assert.equal(page.data.focusedField, 'name');

  page.onFieldBlur({ currentTarget: { dataset: { field: 'name' } } });
  assert.equal(page.data.focusedField, '');
});

test('绑定资料页未完成绑定时返回会直接回到登录页', () => {
  let reLaunchUrl = '';
  const pageConfig = loadBindUserInfoPage({
    auth: {
      hasPendingBindInfo: () => true,
    },
    tenant: {
      applyPageOptions() {},
      appendTenantToUrl: (url) => url,
    },
    wxMock: {
      reLaunch({ url }) {
        reLaunchUrl = url;
      },
    },
  });
  const page = createPageInstance(pageConfig);

  page.onBack();

  assert.equal(reLaunchUrl, '/pages/login/login');
});

test('绑定资料页在未完成绑定时卸载也会回到登录页', () => {
  let reLaunchUrl = '';
  const pageConfig = loadBindUserInfoPage({
    auth: {
      hasPendingBindInfo: () => true,
    },
    tenant: {
      applyPageOptions() {},
      appendTenantToUrl: (url) => url,
    },
    wxMock: {
      reLaunch({ url }) {
        reLaunchUrl = url;
      },
    },
  });
  const page = createPageInstance(pageConfig);

  page.onUnload();

  assert.equal(reLaunchUrl, '/pages/login/login');
});

test('绑定资料页可先上传头像并在提交时带上头像地址', async () => {
  let uploadedPath = '';
  let bindPayload = null;
  const pageConfig = loadBindUserInfoPage({
    api: {
      uploadAvatar: async (filePath) => {
        uploadedPath = filePath;
        return { url: '/uploads/avatars/bind-demo.jpg' };
      },
      bindUserInfo: async (payload) => {
        bindPayload = payload;
        return { success: true };
      },
    },
    auth: {
      clearRequireBindInfo() {},
    },
    tenant: {
      applyPageOptions() {},
    },
    wxMock: {
      getStorageSync(key) {
        if (key === 'wechat_phone') return '';
        if (key === 'notice_bind_avatar_upload_ack_v1') return 1;
        return '';
      },
      chooseMedia(options) {
        options.success({
          tempFiles: [
            {
              tempFilePath: 'tmp://avatar.jpg',
              size: 1024,
            },
          ],
        });
      },
      compressImage(options) {
        options.success({ tempFilePath: 'tmp://avatar-compressed.jpg' });
      },
      showToast() {},
      switchTab() {},
    },
  });
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

  page.onChooseAvatar();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(uploadedPath, 'tmp://avatar-compressed.jpg');
  assert.equal(page.data.avatarUrl, '/uploads/avatars/bind-demo.jpg');
  assert.equal(page.data.avatarDisplayUrl, '/uploads/avatars/bind-demo.jpg');

  page.submit();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(bindPayload.avatar_url, '/uploads/avatars/bind-demo.jpg');
  assert.equal(bindPayload.name, '测试用户');
});
