const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadActivityParticipantsPage({
  api = {},
  auth = {},
  tenant = {},
  wxMock = {},
} = {}) {
  let pageConfig = null;
  global.Page = (config) => {
    pageConfig = config;
  };
  global.wx = {
    showToast() {},
    showModal() {},
    navigateBack() {},
    ...wxMock,
  };

  const pagePath = require.resolve('../pages/activity-participants/activity-participants.js');
  const pageDir = path.dirname(pagePath);
  [
    ['../../utils/api.js', api],
    ['../../utils/auth.js', auth],
    ['../../utils/tenant.js', tenant],
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

test('报名管理页会补充退款展示字段', async () => {
  const pageConfig = loadActivityParticipantsPage({
    api: {
      getActivityParticipants: async () => ({
        total: 1,
        items: [
          {
            id: 11,
            participant_name: '退款参与者',
            payment_status: 2,
            payment_order_no: 'PO_REFUND_001',
            refund_status: 4,
            refund_fail_reason: '余额不足',
            review_status: 2,
            review_reason: '审核拒绝退款',
          },
        ],
      }),
    },
    auth: {
      isAdmin: () => true,
    },
    tenant: {
      applyPageOptions() {},
    },
  });

  const page = createPageInstance(pageConfig, { activityId: 1001 });
  await page.loadParticipants();

  assert.equal(page.data.total, 1);
  assert.equal(page.data.participants[0].refund_status_text, '退款失败');
  assert.equal(page.data.participants[0].refund_action_text, '重试退款');
  assert.equal(page.data.participants[0].can_refund, true);
  assert.equal(page.data.participants[0].refund_reason_text, '余额不足');
});

test('点击退款会调用退款接口并刷新列表', async () => {
  let refundArgs = null;
  let reloadCalls = 0;

  const pageConfig = loadActivityParticipantsPage({
    api: {
      createPaymentRefund: async (...args) => {
        refundArgs = args;
        return { refund_status: 2 };
      },
    },
    auth: {
      isAdmin: () => true,
    },
    tenant: {
      applyPageOptions() {},
    },
    wxMock: {
      showModal(options) {
        if (options && typeof options.success === 'function') {
          options.success({ confirm: true });
        }
      },
    },
  });

  const page = createPageInstance(pageConfig, {
    activityId: 1001,
    participants: [
      {
        id: 11,
        participant_name: '退款参与者',
        payment_status: 2,
        payment_order_no: 'PO_REFUND_001',
        refund_status: 1,
        refund_latest_id: null,
        review_status: 2,
        review_reason: '审核拒绝退款',
        can_refund: true,
        refund_action_text: '执行退款',
      },
    ],
  });
  page.loadParticipants = async function loadParticipantsStub() {
    reloadCalls += 1;
    this.setData({ refundingParticipantId: null });
  };

  page.onRefund({
    currentTarget: {
      dataset: {
        id: 11,
      },
    },
  });

  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(refundArgs);
  assert.equal(refundArgs[0], 'PO_REFUND_001');
  assert.equal(refundArgs[1], '审核拒绝退款');
  assert.equal(refundArgs[2], 'refund-PO_REFUND_001-1');
  assert.equal(reloadCalls, 1);
  assert.equal(page.data.refundingParticipantId, null);
});
