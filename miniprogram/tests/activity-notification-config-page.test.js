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

  const pagePath = require.resolve('../pages/activity-notification-config/activity-notification-config.js');
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

test('通知配置页保存时会调用活动级配置接口', async () => {
  let savedPayload = null;
  const pageConfig = loadPage([
    ['../../utils/api.js', {
      updateActivityNotificationConfig(activityId, scene, payload) {
        savedPayload = { activityId, scene, payload };
        return Promise.resolve({
          activity_id: activityId,
          scene,
          enabled: payload.enabled,
          template_id: payload.template_id,
          page_path: payload.page_path,
          payload_template_json: payload.payload_template_json,
        });
      },
    }],
    ['../../utils/auth.js', {
      isAdmin: () => true,
    }],
    ['../../utils/tenant.js', {
      applyPageOptions() {},
    }],
  ]);

  const page = createPageInstance(pageConfig, {
    activityId: 77,
    form: {
      enabled: true,
      templateId: 'TPL_ACTIVITY_001',
      pagePath: 'pages/my-activities/my-activities',
      payloadTemplateText: '{"thing1":{"value":"{{activity_name}}"}}',
    },
  });

  await page.save();

  assert.ok(savedPayload);
  assert.equal(savedPayload.activityId, 77);
  assert.equal(savedPayload.scene, 'registration_success');
  assert.equal(savedPayload.payload.template_id, 'TPL_ACTIVITY_001');
});
