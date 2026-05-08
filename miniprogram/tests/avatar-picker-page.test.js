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
  const pageConfig = loadAvatarPickerPage({
    api: {
      uploadAvatar: async (filePath) => {
        uploadedPath = filePath;
        return { url: '/uploads/avatars/optimized.jpg' };
      },
    },
    wxMock: {
      chooseMedia(options) {
        options.success({ tempFiles: [{ tempFilePath: 'tmp://original.jpg' }] });
      },
      compressImage(options) {
        assert.equal(options.src, 'tmp://original.jpg');
        options.success({ tempFilePath: 'tmp://compressed.jpg' });
      },
    },
  });
  const page = createPageInstance(pageConfig);

  page.onChooseAvatar();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(uploadedPath, 'tmp://compressed.jpg');
  assert.equal(page.data.customAvatarUrl, '/uploads/avatars/optimized.jpg');
  assert.equal(page.data.uploading, false);
});
