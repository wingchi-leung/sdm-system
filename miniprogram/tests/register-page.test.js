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

test('活动管理员可继续提交支付报名', async () => {
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
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(calls.createPaymentOrder, 1);
});

test('报名前会请求报名成功订阅消息授权并上报结果', async () => {
  const calls = {
    requestSubscribeMessage: 0,
    recordSubscribeConsent: 0,
    registerParticipant: 0,
  };
  const pageConfig = loadRegisterPage({
    api: {
      recordSubscribeConsent(payload) {
        calls.recordSubscribeConsent += 1;
        assert.equal(payload.template_id, 'TPL_REGISTER_SUCCESS');
        assert.equal(payload.accept_status, 'accept');
        return Promise.resolve({});
      },
      registerParticipant() {
        calls.registerParticipant += 1;
        return Promise.resolve({ enroll_status: 1 });
      },
    },
    wxMock: {
      requestSubscribeMessage({ tmplIds, success }) {
        calls.requestSubscribeMessage += 1;
        assert.deepEqual(tmplIds, ['TPL_REGISTER_SUCCESS']);
        success({ TPL_REGISTER_SUCCESS: 'accept' });
      },
      showToast() {},
      navigateBack() {},
    },
  });
  const page = createPageInstance(pageConfig, {
    activity: { id: 66 },
    subscribeConfig: {
      scenes: [
        {
          scene: 'registration_success',
          enabled: true,
          template_id: 'TPL_REGISTER_SUCCESS',
        },
      ],
    },
    name: '报名用户',
    whyJoin: '想参加',
    channel: '朋友推荐',
    expectation: '学习交流',
  });

  await page.doRegister();

  assert.equal(calls.requestSubscribeMessage, 1);
  assert.equal(calls.recordSubscribeConsent, 1);
  assert.equal(calls.registerParticipant, 1);
});

test('未配置报名成功模板时不会请求订阅授权', async () => {
  const calls = {
    requestSubscribeMessage: 0,
    registerParticipant: 0,
  };
  const pageConfig = loadRegisterPage({
    api: {
      registerParticipant() {
        calls.registerParticipant += 1;
        return Promise.resolve({ enroll_status: 1 });
      },
    },
    wxMock: {
      requestSubscribeMessage() {
        calls.requestSubscribeMessage += 1;
      },
      showToast() {},
      navigateBack() {},
    },
  });
  const page = createPageInstance(pageConfig, {
    activity: { id: 88 },
    subscribeConfig: {
      scenes: [],
    },
    name: '报名用户',
    whyJoin: '想参加',
    channel: '朋友推荐',
    expectation: '学习交流',
  });

  await page.doRegister();

  assert.equal(calls.requestSubscribeMessage, 0);
  assert.equal(calls.registerParticipant, 1);
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

test('报名页不会恢复未完成支付状态', () => {
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

  assert.equal(page.data.paymentOrderNo, '');
  assert.equal(calls.initPage, 1);
});

test('报名页不会因为本地待支付记录自动回填订单号', () => {
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

  assert.equal(page.data.paymentOrderNo, '');
});

test('取消支付后会清理本地和后端的待支付记录', async () => {
  const calls = {
    cancelPaymentOrder: 0,
  };
  const storage = {};
  const pageConfig = loadRegisterPage({
    api: {
      createPaymentOrder() {
        return Promise.resolve({
          order_no: 'ORDER-CANCEL-1',
          payment_params: {
            timeStamp: '1',
            nonceStr: 'n',
            package: 'p',
            signType: 'MD5',
            paySign: 's',
          },
        });
      },
      cancelPaymentOrder() {
        calls.cancelPaymentOrder += 1;
        return Promise.resolve({ code: 'SUCCESS' });
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
      upsertOrderRecord: (current, record) => [...(current || []), record],
      removeOrderRecord: (current) => (current || []).filter((item) => item.order_no !== 'ORDER-CANCEL-1'),
    },
    wxMock: {
      getStorageSync(key) { return storage[key]; },
      setStorageSync(key, value) { storage[key] = value; },
      removeStorageSync(key) { delete storage[key]; },
      requestPayment({ fail }) {
        fail({ errMsg: 'requestPayment:fail cancel' });
      },
      showToast() {},
    },
  });
  const page = createPageInstance(pageConfig);
  page.setData({
    activityId: 12,
    activity: { id: 12, activity_name: '测试活动' },
    actualFee: 100,
    submitting: false,
    name: '报名用户',
    whyJoin: '想参加',
    channel: '朋友推荐',
    expectation: '学习交流',
  });

  await page.doPaymentRegister();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(page.data.paymentOrderNo, '');
  assert.equal(page.data.submitting, false);
  assert.equal(calls.cancelPaymentOrder, 1);
  assert.equal(storage['pending-order-key'], undefined);
  assert.deepEqual(storage['history-order-key'], []);
});
