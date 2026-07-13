const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadProfileEditPage({ api = {}, auth = {}, tenant = {}, avatar = {}, wxMock = {} } = {}) {
  let pageConfig = null;
  global.Page = (config) => {
    pageConfig = config;
  };
  global.wx = {
    showToast() {},
    navigateBack() {},
    compressImage(options) {
      options.success({ tempFilePath: options.src });
    },
    chooseMedia() {},
    ...wxMock,
  };

  const pagePath = require.resolve('../pages/profile-edit/profile-edit.js');
  const pageDir = path.dirname(pagePath);
  [
    ['../../utils/api.js', api],
    ['../../utils/auth.js', auth],
    ['../../utils/tenant.js', tenant],
    ['../../utils/avatar.js', avatar],
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
    data: { ...config.data, ...initialData },
    setData(update) {
      this.data = { ...this.data, ...update };
    },
  };
  Object.keys(config).forEach((key) => {
    if (key !== 'data') instance[key] = config[key];
  });
  return instance;
}

test('资料页点击头像会打开头像选项', () => {
  const pageConfig = loadProfileEditPage({
    api: {
      getUserProfile: async () => ({
        name: '路边明',
        avatar_url: '/uploads/avatars/a.jpg',
        update_time: '2026-01-01T00:00:00.000Z',
      }),
    },
    avatar: {
      normalizeAvatarValue: (value) => value,
      resolveAvatarDisplayUrl: async () => '/avatar-display.jpg',
      getDefaultAvatarPath: () => '/default-avatar.jpg',
    },
  });
  const page = createPageInstance(pageConfig);

  return page.loadProfile().then(() => {
    page.showAvatarMenu();

    assert.equal(page.data.avatarMenuVisible, true);
  });
});

test('资料页选择微信头像后会立即更新头像接口', async () => {
  let uploadedPath = '';
  let updatedAvatarUrl = '';
  const pageConfig = loadProfileEditPage({
    api: {
      getUserProfile: async () => ({
        name: '路边明',
        avatar_url: '/uploads/avatars/a.jpg',
        update_time: '2026-01-01T00:00:00.000Z',
      }),
      uploadAvatar: async (filePath) => {
        uploadedPath = filePath;
        return { url: '/uploads/avatars/b.jpg' };
      },
      updateUserAvatar: async (avatarUrl) => {
        updatedAvatarUrl = avatarUrl;
      },
    },
    avatar: {
      normalizeAvatarValue: (value) => value,
      resolveAvatarDisplayUrl: async (value) => `display:${value}`,
      getDefaultAvatarPath: () => '/default-avatar.jpg',
    },
    wxMock: {
      chooseMedia(options) {
        options.success({ tempFiles: [{ tempFilePath: 'tmp://avatar.jpg' }] });
      },
    },
  });
  const page = createPageInstance(pageConfig);

  await page.loadProfile();
  await page.onChooseWechatAvatar({ detail: { avatarUrl: 'tmp://wechat-avatar.jpg' } });

  assert.equal(uploadedPath, 'tmp://wechat-avatar.jpg');
  assert.equal(updatedAvatarUrl, '/uploads/avatars/b.jpg');
  assert.equal(page.data.avatarDisplayUrl, 'tmp://wechat-avatar.jpg');
});

test('资料页从相册选择头像后会立即保存', async () => {
  let uploadedPath = '';
  let avatarUpdateCalls = 0;
  const pageConfig = loadProfileEditPage({
    api: {
      getUserProfile: async () => ({
        name: '路边明',
        avatar_url: '/uploads/avatars/a.jpg',
        update_time: '2026-01-01T00:00:00.000Z',
      }),
      uploadAvatar: async (filePath) => {
        uploadedPath = filePath;
        return { url: '/uploads/avatars/c.jpg' };
      },
      updateUserAvatar: async () => {
        avatarUpdateCalls += 1;
      },
    },
    avatar: {
      normalizeAvatarValue: (value) => value,
      resolveAvatarDisplayUrl: async () => '/avatar-display.jpg',
      getDefaultAvatarPath: () => '/default-avatar.jpg',
    },
    wxMock: {
      chooseMedia(options) {
        options.success({ tempFiles: [{ tempFilePath: 'tmp://album-avatar.jpg' }] });
      },
    },
  });
  const page = createPageInstance(pageConfig);

  await page.loadProfile();
  page.chooseAvatarFromAlbum();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(uploadedPath, 'tmp://album-avatar.jpg');
  assert.equal(avatarUpdateCalls, 1);
  assert.equal(page.data.avatarChanged, false);
});

test('资料页点击微信头像选项时会进入等待态', async () => {
  const toastCalls = [];
  const pageConfig = loadProfileEditPage({
    api: {
      getUserProfile: async () => ({
        name: '路边明',
        avatar_url: '/uploads/avatars/a.jpg',
        update_time: '2026-01-01T00:00:00.000Z',
      }),
    },
    avatar: {
      normalizeAvatarValue: (value) => value,
      resolveAvatarDisplayUrl: async () => '/avatar-display.jpg',
      getDefaultAvatarPath: () => '/default-avatar.jpg',
    },
    wxMock: {
      showToast(options) {
        toastCalls.push(options.title);
      },
    },
  });
  const page = createPageInstance(pageConfig);

  await page.loadProfile();
  page.onWechatAvatarTap();

  assert.equal(page._waitingWechatAvatar, true);
  assert.deepEqual(toastCalls, []);
});
