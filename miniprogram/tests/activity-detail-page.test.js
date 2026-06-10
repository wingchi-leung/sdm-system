const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadActivityDetailPage({
  api = {},
  auth = {},
  image = {},
  tenant = {},
  wxMock = {},
} = {}) {
  let pageConfig = null;
  global.Page = (config) => {
    pageConfig = config;
  };
  global.wx = {
    showToast() {},
    navigateTo() {},
    navigateBack() {},
    ...wxMock,
  };

  const pagePath = require.resolve('../pages/activity-detail/activity-detail.js');
  const pageDir = path.dirname(pagePath);
  const moduleMap = [
    ['../../utils/api.js', api],
    ['../../utils/auth.js', auth],
    ['../../utils/image.js', image],
    ['../../utils/tenant.js', tenant],
  ];

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
    if (key === 'data') return;
    instance[key] = config[key];
  });
  return instance;
}

test('活动详情页未登录时会跳转登录页且不会继续拉取活动', () => {
  const calls = {
    getActivity: 0,
    navigateTo: [],
    showToast: 0,
  };
  const oldSetTimeout = global.setTimeout;
  global.setTimeout = (fn) => {
    fn();
    return 1;
  };

  try {
    const pageConfig = loadActivityDetailPage({
      api: {
        getActivity() {
          calls.getActivity += 1;
          return Promise.resolve({});
        },
      },
      auth: {
        isLoggedIn: () => false,
        isAdmin: () => false,
        isUser: () => false,
      },
      tenant: {
        applyPageOptions() {},
        appendTenantToUrl(url, params = {}) {
          const keys = Object.keys(params);
          if (!keys.length) return url;
          const query = keys
            .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`)
            .join('&');
          return `${url}?${query}`;
        },
      },
      wxMock: {
        navigateTo({ url }) {
          calls.navigateTo.push(url);
        },
        showToast() {
          calls.showToast += 1;
        },
      },
    });

    const page = createPageInstance(pageConfig, {
      activity: { id: 1, activity_name: '旧活动' },
      loading: true,
      showAdminPanel: true,
    });

    page.onLoad({ id: 12 });

    assert.equal(calls.getActivity, 0);
    assert.equal(calls.showToast, 1);
    assert.equal(calls.navigateTo.length, 1);
    assert.match(calls.navigateTo[0], /\/pages\/login\/login\?redirect=/);
    assert.equal(page.data.activity, null);
    assert.equal(page.data.showAdminPanel, false);
    assert.equal(page.data.loading, false);
    assert.equal(page.data.error, '请先登录后查看活动');
  } finally {
    global.setTimeout = oldSetTimeout;
  }
});

test('活动管理员在可报名活动中可以看到报名入口', async () => {
  const pageConfig = loadActivityDetailPage({
    api: {
      getActivity() {
        return Promise.resolve({
          id: 12,
          status: 1,
          activity_type_id: 3,
          activity_type_name: '沙龙',
          activity_type_code: 'SALON',
        });
      },
      getActivityPermissions() {
        return Promise.resolve({ can_manage: true });
      },
    },
    auth: {
      isLoggedIn: () => true,
      isAdmin: () => true,
      isUser: () => false,
      isSuperAdmin: () => false,
      canManageActivityType: () => true,
    },
    image: {
      resolveDisplayUrl(url) {
        return Promise.resolve(url);
      },
    },
  });
  const page = createPageInstance(pageConfig, { activityId: 12 });

  page.loadActivity(12);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(page.data.canEnroll, true);
  assert.equal(page.data.actionTipText, '');
});

test('待支付报名在活动详情页会显示待支付并隐藏社区入口', async () => {
  const calls = {
    navigateTo: 0,
  };
  const pageConfig = loadActivityDetailPage({
    api: {
      getActivity() {
        return Promise.resolve({
          id: 12,
          status: 1,
          activity_type_id: 3,
          activity_type_name: '沙龙',
          activity_type_code: 'SALON',
        });
      },
      getActivityPermissions() {
        return Promise.resolve({ can_manage: false });
      },
      getMyParticipantActivities() {
        return Promise.resolve({
          items: [
            {
              id: 12,
              enroll_status: 1,
              payment_status: 1,
            },
          ],
        });
      },
    },
    auth: {
      isLoggedIn: () => true,
      isAdmin: () => false,
      isUser: () => true,
      isSuperAdmin: () => false,
      canManageActivityType: () => false,
    },
    image: {
      resolveDisplayUrl(url) {
        return Promise.resolve(url);
      },
    },
    wxMock: {
      navigateTo() {
        calls.navigateTo += 1;
      },
    },
  });
  const page = createPageInstance(pageConfig, { activityId: 12 });

  page.loadActivity(12);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(page.data.hasRegistered, false);
  assert.equal(page.data.hasPendingPayment, true);
  assert.equal(page.data.registrationStatusText, '待支付');
  assert.equal(page.data.canEnroll, false);
  assert.equal(page.data.actionTipText, '待支付，请前往我的订单继续完成支付');
  assert.equal(page.data.showCommunitySection, false);
});

test('活动详情页新版视图模型会补全标题摘要和信息区', async () => {
  const pageConfig = loadActivityDetailPage({
    api: {
      getActivity() {
        return Promise.resolve({
          id: 12,
          status: 2,
          activity_name: '未来设计',
          activity_type_name: '主题探索',
          activity_intro: '重新理解人与技术的关系\n我们将一起思考设计的边界。',
          start_time: '2026-06-12T19:30:00',
          end_time: '2026-06-12T21:00:00',
          location: '上海 · 徐汇滨江',
          max_participants: 20,
        });
      },
      getActivityPermissions() {
        return Promise.resolve({ can_manage: false });
      },
    },
    auth: {
      isLoggedIn: () => true,
      isAdmin: () => false,
      isUser: () => false,
      isSuperAdmin: () => false,
      canManageActivityType: () => false,
    },
    image: {
      resolveDisplayUrl(url) {
        return Promise.resolve(url);
      },
    },
  });
  const page = createPageInstance(pageConfig, { activityId: 12 });

  page.loadActivity(12);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(page.data.activity.hero_kicker, '主题探索');
  assert.equal(page.data.activity.hero_summary, '重新理解人与技术的关系');
  assert.equal(page.data.activity.detail_paragraphs.length, 2);
  assert.equal(page.data.activity.info_rows[0].value, '06.12 周五 19:30 - 21:00');
  assert.equal(page.data.activity.info_rows[1].value, '上海 · 徐汇滨江');
  assert.equal(page.data.activity.info_rows[2].value, '线下参与 ｜ 限定 20 人');
});
