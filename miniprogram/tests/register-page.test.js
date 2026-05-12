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

test('管理员停留在报名页时不能继续提交支付报名', () => {
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
      isUser: () => false,
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

test('报名页证件类型展示港澳台通行证', () => {
  const pageConfig = loadRegisterPage();
  const page = createPageInstance(pageConfig);

  assert.equal(page.getIdentityTypeLabel('hongkong'), '港澳台通行证');
});
