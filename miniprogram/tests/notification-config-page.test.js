const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadPage(moduleMap, wxMock = {}) {
  let pageConfig = null;
  global.Page = (config) => {
    pageConfig = config;
  };
  global.wx = {
    showToast() {},
    navigateBack() {},
    ...wxMock,
  };

  const pagePath = require.resolve('../pages/notification-config/notification-config.js');
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

test('通知配置页会只显示目标场景', async () => {
  const pageConfig = loadPage([
    ['../../utils/api.js', {
      getNotificationSceneConfigs: async () => ([
        {
          scene: 'refund_success',
          name: '退款成功通知',
          description: '忽略场景',
          enabled: true,
          template_id: 'tpl_refund',
          page_path: 'pages/my-orders/my-orders',
          payload_template_json: {},
        },
        {
          scene: 'registration_received',
          name: '报名确认通知',
          description: '首次报名确认',
          enabled: false,
          template_id: '',
          page_path: 'pages/my-activities/my-activities',
          payload_template_json: {
            thing1: { value: '{{activity_name}}' },
          },
        },
        {
          scene: 'review_result',
          name: '审核结果通知',
          description: '审核结果',
          enabled: true,
          template_id: 'tpl_review',
          page_path: 'pages/my-activities/my-activities',
          payload_template_json: {
            thing1: { value: '{{activity_name}}' },
          },
        },
      ]),
      updateNotificationSceneConfig() {
        return Promise.resolve({});
      },
    }],
    ['../../utils/auth.js', {
      isAdmin: () => true,
      redirectToLogin() {},
    }],
    ['../../utils/tenant.js', {
      applyPageOptions() {},
    }],
  ]);

  const page = createPageInstance(pageConfig);
  await page.loadSceneConfigs();

  assert.equal(page.data.loading, false);
  assert.equal(page.data.error, '');
  assert.equal(page.data.scenes.length, 2);
  assert.equal(page.data.scenes[0].scene, 'registration_received');
  assert.equal(page.data.scenes[1].scene, 'review_result');
});

test('通知配置页保存时会按场景调用更新接口', async () => {
  let savedPayload = null;
  const pageConfig = loadPage([
    ['../../utils/api.js', {
      getNotificationSceneConfigs: async () => ([
        {
          scene: 'registration_received',
          name: '报名确认通知',
          description: '首次报名确认',
          enabled: false,
          template_id: '',
          page_path: 'pages/my-activities/my-activities',
          payload_template_json: {
            thing1: { value: '{{activity_name}}' },
          },
        },
      ]),
      updateNotificationSceneConfig(scene, payload) {
        savedPayload = { scene, payload };
        return Promise.resolve({
          scene,
          name: payload.name,
          description: payload.description,
          enabled: payload.enabled,
          template_id: payload.template_id,
          page_path: payload.page_path,
          payload_template_json: payload.payload_template_json,
        });
      },
    }],
    ['../../utils/auth.js', {
      isAdmin: () => true,
      redirectToLogin() {},
    }],
    ['../../utils/tenant.js', {
      applyPageOptions() {},
    }],
  ]);

  const page = createPageInstance(pageConfig);
  await page.loadSceneConfigs();
  page.updateSceneField(0, 'templateId', 'TPL_NOTIFY_001');
  page.updateSceneField(0, 'pagePath', 'pages/my-activities/my-activities');
  page.updateSceneField(0, 'payloadTemplateText', '{"thing1":{"value":"{{activity_name}}"},"phrase2":{"value":"已收到报名"}}');

  await page.saveScene({
    currentTarget: {
      dataset: {
        index: 0,
      },
    },
  });

  assert.ok(savedPayload);
  assert.equal(savedPayload.scene, 'registration_received');
  assert.equal(savedPayload.payload.name, '报名确认通知');
  assert.equal(savedPayload.payload.template_id, 'TPL_NOTIFY_001');
  assert.equal(savedPayload.payload.enabled, false);
  assert.equal(savedPayload.payload.payload_template_json.phrase2.value, '已收到报名');
});
