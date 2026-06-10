const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadRegisterPage({
  api = {},
  auth = {},
  image = {},
  tenant = {},
  paymentOrder = {},
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
    redirectTo() {},
    pageScrollTo() {},
    ...wxMock,
  };

  const pagePath = require.resolve('../pages/register/register.js');
  const pageDir = path.dirname(pagePath);
  const moduleMap = [
    ['../../utils/api.js', api],
    ['../../utils/auth.js', auth],
    ['../../utils/image.js', image],
    ['../../utils/tenant.js', tenant],
    ['../../utils/payment-order.js', paymentOrder],
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

test('报名提交 payload 不包含前端可篡改的 user_id', () => {
  const pageConfig = loadRegisterPage();
  const page = createPageInstance(pageConfig, {
    activity: { id: 12 },
    userInfo: { id: 99 },
    name: '报名用户',
    phone: '13800000000',
    sex: '男',
    whyJoin: '想参加',
    channel: '朋友推荐',
    expectation: '学习交流',
  });

  const payload = page.buildParticipantData();

  assert.equal(payload.activity_id, 12);
  assert.equal(payload.user_id, undefined);
});

test('超级管理员停留在报名页时不能继续提交支付报名', () => {
  const calls = {
    createPaymentOrder: 0,
    showToast: 0,
  };
  const pageConfig = loadRegisterPage({
    api: {
      createPaymentOrder() {
        calls.createPaymentOrder += 1;
        return Promise.resolve({});
      },
    },
    auth: {
      isLoggedIn: () => true,
      isSuperAdmin: () => true,
    },
    wxMock: {
      showToast() {
        calls.showToast += 1;
      },
    },
  });
  const page = createPageInstance(pageConfig, {
    loading: false,
    activity: { id: 12 },
    name: '报名用户',
    phone: '13800000000',
    whyJoin: '想参加',
    channel: '朋友推荐',
    expectation: '学习交流',
    requirePayment: true,
    actualFee: 100,
    suggestedFee: 100,
  });

  page.submit();

  assert.equal(calls.createPaymentOrder, 0);
  assert.equal(calls.showToast, 1);
  assert.equal(page.data.submitting, false);
});

test('活动管理员可继续提交支付报名', () => {
  const calls = {
    createPaymentOrder: 0,
  };
  const pageConfig = loadRegisterPage({
    api: {
      createPaymentOrder() {
        calls.createPaymentOrder += 1;
        return Promise.resolve({
          order_no: 'ORDER-1',
          payment_params: {
            timeStamp: '1',
            nonceStr: 'n',
            package: 'p',
            signType: 'MD5',
            paySign: 's',
          },
        });
      },
      queryPaymentOrder() {
        return Promise.resolve({ status: 1, order_no: 'ORDER-1' });
      },
    },
    auth: {
      isLoggedIn: () => true,
      isSuperAdmin: () => false,
      getUserId: () => 101,
    },
    tenant: {
      getTenantCode: () => 'demo',
    },
    paymentOrder: {
      buildPendingOrderStorageKey: () => 'k1',
      buildOrderHistoryStorageKey: () => 'k2',
      upsertOrderRecord: (current, record) => [...current, record],
    },
    wxMock: {
      getStorageSync: () => [],
      setStorageSync() {},
      removeStorageSync() {},
      requestPayment({ success }) { success(); },
      showToast() {},
      navigateBack() {},
    },
  });
  const page = createPageInstance(pageConfig, {
    loading: false,
    activityId: 12,
    activity: { id: 12, activity_name: '测试活动' },
    name: '报名用户',
    phone: '13800000000',
    whyJoin: '想参加',
    channel: '朋友推荐',
    expectation: '学习交流',
    requirePayment: true,
    actualFee: 100,
    suggestedFee: 100,
  });

  page.submit();

  assert.equal(calls.createPaymentOrder, 1);
});

test('报名页加载活动时会解析海报展示地址', async () => {
  const pageConfig = loadRegisterPage({
    api: {
      getActivity() {
        return Promise.resolve({
          id: 12,
          activity_name: '测试活动',
          poster_url: '/uploads/posters/demo.jpg',
          require_payment: 1,
          suggested_fee: 9900,
        });
      },
      getEnrollmentInfo() {
        return Promise.resolve({
          is_full: false,
          remaining_quota: 6,
        });
      },
    },
    image: {
      resolveDisplayUrl(url) {
        return Promise.resolve(`wxfile://${url}`);
      },
    },
  });
  const page = createPageInstance(pageConfig);

  await page.loadActivity(12);

  assert.equal(page.data.activity.poster_url, 'wxfile:///uploads/posters/demo.jpg');
  assert.equal(page.data.requirePayment, true);
  assert.equal(page.data.suggestedFeeYuan, '99.00');
});

test('报名页会同步展示用户资料到个人资料区', async () => {
  const pageConfig = loadRegisterPage({
    api: {
      getUserProfile() {
        return Promise.resolve({
          name: '报名用户',
          sex: 'F',
          age: 28,
          occupation: '产品经理',
          phone: '13800000000',
          email: 'demo@example.com',
          industry: '教育',
        });
      },
    },
  });
  const page = createPageInstance(pageConfig);

  await page.loadUserProfile();

  assert.equal(page.data.name, '报名用户');
  assert.equal(page.data.sex, '女');
  assert.equal(page.data.age, '28');
  assert.equal(page.data.occupation, '产品经理');
  assert.equal(page.data.phone, '13800000000');
  assert.equal(page.data.email, 'demo@example.com');
  assert.equal(page.data.industry, '教育');
});

test('报名页不再暴露证件类型字段', () => {
  const pageConfig = loadRegisterPage();
  const page = createPageInstance(pageConfig);

  assert.equal(Object.prototype.hasOwnProperty.call(page.data, 'identityType'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(page.data, 'identityTypeLabel'), false);
});

test('报名提交 payload 不包含证件号字段', () => {
  const pageConfig = loadRegisterPage();
  const page = createPageInstance(pageConfig, {
    activity: { id: 18 },
    name: '测试用户',
    phone: '13800000000',
    sex: '男',
    age: '28',
    occupation: '工程师',
    email: 'demo@example.com',
    industry: '教育',
    whyJoin: '学习',
    channel: '朋友推荐',
    expectation: '提升',
  });
  const payload = page.buildParticipantData();

  assert.equal(payload.identity_number, undefined);
  assert.equal(payload.identity_type, undefined);
});

test('报名页仅在同活动存在待支付订单时恢复继续支付', () => {
  const calls = {
    initPage: 0,
  };
  const pageConfig = loadRegisterPage({
    auth: {
      isLoggedIn: () => true,
      isSuperAdmin: () => false,
      getUserId: () => 1001,
    },
    tenant: {
      applyPageOptions() {},
      getTenantCode: () => 'demo',
    },
    paymentOrder: {
      buildPendingOrderStorageKey: () => 'pending-order-key',
      buildOrderHistoryStorageKey: () => 'history-order-key',
      upsertOrderRecord: (current) => current,
    },
    wxMock: {
      getStorageSync() {
        return {
          activityId: 12,
          orderNo: 'ORDER-RECOVER-1',
        };
      },
    },
  });
  const page = createPageInstance(pageConfig);
  page.initPage = () => {
    calls.initPage += 1;
  };

  page.onLoad({ id: '12' });

  assert.equal(page.data.recoverPendingPayment, true);
  assert.equal(page.data.paymentOrderNo, 'ORDER-RECOVER-1');
  assert.equal(calls.initPage, 1);
});

test('报名页不会恢复其他活动的待支付订单', () => {
  const pageConfig = loadRegisterPage({
    auth: {
      isLoggedIn: () => true,
      isSuperAdmin: () => false,
      getUserId: () => 1001,
    },
    tenant: {
      applyPageOptions() {},
      getTenantCode: () => 'demo',
    },
    paymentOrder: {
      buildPendingOrderStorageKey: () => 'pending-order-key',
      buildOrderHistoryStorageKey: () => 'history-order-key',
      upsertOrderRecord: (current) => current,
    },
    wxMock: {
      getStorageSync() {
        return {
          activityId: 33,
          orderNo: 'ORDER-RECOVER-2',
        };
      },
    },
  });
  const page = createPageInstance(pageConfig);
  page.initPage = () => {};

  page.onLoad({ id: '12' });

  assert.equal(page.data.recoverPendingPayment, false);
  assert.equal(page.data.paymentOrderNo, '');
});

test('报名页会自动清理已关闭的待支付订单', async () => {
  const calls = {
    removeStorageSync: [],
  };
  const pageConfig = loadRegisterPage({
    api: {
      queryPaymentOrder() {
        return Promise.resolve({
          activity_id: 12,
          status: 3,
        });
      },
    },
    auth: {
      isLoggedIn: () => true,
      isSuperAdmin: () => false,
      getUserId: () => 1001,
    },
    tenant: {
      applyPageOptions() {},
      getTenantCode: () => 'demo',
    },
    paymentOrder: {
      buildPendingOrderStorageKey: () => 'pending-order-key',
      buildOrderHistoryStorageKey: () => 'history-order-key',
      upsertOrderRecord: (current) => current,
    },
    wxMock: {
      getStorageSync() {
        return {
          activityId: 12,
          orderNo: 'ORDER-CLOSED-1',
        };
      },
      removeStorageSync(key) {
        calls.removeStorageSync.push(key);
      },
    },
  });
  const page = createPageInstance(pageConfig);
  page.setData({
    activityId: 12,
    paymentOrderNo: 'ORDER-CLOSED-1',
    recoverPendingPayment: true,
  });

  await page.refreshPendingPaymentStatus(12);

  assert.equal(page.data.recoverPendingPayment, false);
  assert.equal(page.data.paymentOrderNo, '');
  assert.equal(calls.removeStorageSync.length, 1);
});
