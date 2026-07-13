const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadAvatarPickerPage({ api = {}, tenant = {}, avatar = {}, wxMock = {} } = {}) {
  let pageConfig = null;
  global.Page = (config) => {
    pageConfig = config;
  };
  global.wx = {
    createAnimation() {
      return {
        rotate() { return this; },
        step() { return this; },
        export() { return {}; },
      };
    },
    ...wxMock,
  };

  const pagePath = require.resolve('../pages/avatar-picker/avatar-picker.js');
  const pageDir = path.dirname(pagePath);
  [
    ['../../utils/api.js', api],
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

function createPageInstance(config) {
  const instance = {
    data: { ...config.data },
    setData(update) {
      this.data = { ...this.data, ...update };
    },
  };
  Object.keys(config).forEach((key) => {
    if (key !== 'data') instance[key] = config[key];
  });
  return instance;
}

test('选择自定义头像时会先压缩再上传', async () => {
  let uploadedPath = '';
  let updatedAvatarUrl = '';
  let selectedSourceType = null;
  const pageConfig = loadAvatarPickerPage({
    api: {
      uploadAvatar: async (filePath) => {
        uploadedPath = filePath;
        return { url: '/uploads/avatars/optimized.jpg' };
      },
      updateUserAvatar: async (avatarUrl) => {
        updatedAvatarUrl = avatarUrl;
      },
      getUserProfile: async () => ({
        avatar_url: '',
        update_time: '2025-01-01T00:00:00.000Z',
      }),
    },
    wxMock: {
      getStorageSync() {
        return 1;
      },
      chooseMedia(options) {
        selectedSourceType = options.sourceType;
        options.success({ tempFiles: [{ tempFilePath: 'tmp://original.jpg' }] });
      },
      compressImage(options) {
        assert.equal(options.src, 'tmp://original.jpg');
        options.success({ tempFilePath: 'tmp://compressed.jpg' });
      },
      previewImage() {},
      navigateBack() {},
      showToast() {},
    },
  });
  const page = createPageInstance(pageConfig);

  await page.loadProfile();

  page.onChooseAvatar();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(selectedSourceType, ['album', 'camera']);
  assert.equal(page.data.selectedAvatarTempPath, 'tmp://original.jpg');
  assert.equal(page.data.selectedAvatarDisplayUrl, 'tmp://compressed.jpg');

  await page.onSave();

  assert.equal(uploadedPath, 'tmp://compressed.jpg');
  assert.equal(updatedAvatarUrl, '/uploads/avatars/optimized.jpg');
});
