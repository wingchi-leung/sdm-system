const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadPage(pageRelativePath, moduleMap, wxMock = {}) {
  let pageConfig = null;
  global.Page = (config) => {
    pageConfig = config;
  };
  global.wx = {
    showToast() {},
    navigateBack() {},
    showLoading() {},
    hideLoading() {},
    chooseMedia() {},
    uploadFile() {},
    ...wxMock,
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

test('社区编辑页会回填详情并提交更新', async () => {
  let updatedPayload = null;
  const appState = { globalData: {} };
  global.getApp = () => appState;

  const pageConfig = loadPage('../pages/community-channel-create/community-channel-create.js', [
    ['../../utils/api.js', {
      getCommunityChannelDetail: async () => ({
        id: 7,
        name: '旧社区名称',
        description: '旧描述',
        avatar_url: '/uploads/community/channels/old-avatar.png',
        role: 'admin',
      }),
      updateCommunityChannel: async (_channelId, payload) => {
        updatedPayload = payload;
        return {
          id: 7,
          name: payload.name,
          description: payload.description,
          avatar_url: payload.avatar_url,
        };
      },
    }],
    ['../../utils/auth.js', {
      isAdmin: () => true,
    }],
  ], {
    navigateBack() {},
  });

  const page = createPageInstance(pageConfig);
  page.onLoad({ channelId: '7' });
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(page.data.editMode, true);
  assert.equal(page.data.pageTitle, '编辑社区');
  assert.equal(page.data.name, '旧社区名称');
  assert.equal(page.data.avatarTemp, '/uploads/community/channels/old-avatar.png');

  page.onNameInput({ detail: { value: '新社区名称' } });
  page.onDescriptionInput({ detail: { value: '新描述' } });
  await page.onSubmit();

  assert.deepEqual(updatedPayload, {
    name: '新社区名称',
    description: '新描述',
    avatar_url: '/uploads/community/channels/old-avatar.png',
  });
});
