const test = require('node:test');
const assert = require('node:assert/strict');
function loadApiWithMocks({ wxMock, rsaMock }) {
  global.wx = wxMock;
  const apiPath = require.resolve('../utils/api');
  const configPath = require.resolve('../config/index');
  const rsaPath = require.resolve('../utils/rsa');
  delete require.cache[apiPath];
  delete require.cache[configPath];
  delete require.cache[rsaPath];
  require.cache[rsaPath] = {
    id: rsaPath,
    filename: rsaPath,
    loaded: true,
    exports: rsaMock,
  };
  return require('../utils/api');
}

test('bindUserInfo 会发送加密字段而不是明文字段', async () => {
  const calls = [];
  const api = loadApiWithMocks({
    rsaMock: {
      encryptWithPublicKey(value) {
        return `enc(${value})`;
      },
    },
    wxMock: {
      getSystemInfoSync() {
        return { platform: 'devtools' };
      },
      getStorageSync(key) {
        if (key === 'access_token') return 'token-demo';
        return '';
      },
      request(options) {
        calls.push({ url: options.url, method: options.method, data: options.data });
        if (options.url.includes('/users/security/rsa-public-key')) {
          options.success({ statusCode: 200, data: { kid: 'v2', public_key: 'mock-public-key' } });
          return;
        }
        options.success({ statusCode: 200, data: { success: true } });
      },
    },
  });

  await api.bindUserInfo({
    name: '张三',
    sex: 'male',
    age: 25,
    occupation: '工程师',
    phone: '13800138000',
    industry: 'IT',
  });

  const bindCall = calls.find((item) => item.url.includes('/users/bind-info'));
  assert.ok(bindCall, '应调用 bind-info 接口');
  assert.equal(bindCall.data.phone, undefined);
  assert.equal(bindCall.data.encryption_kid, 'v2');
  assert.equal(bindCall.data.phone_encrypted, 'enc(13800138000)');
});

test('registerParticipant 会发送加密字段而不是明文字段', async () => {
  const calls = [];
  const api = loadApiWithMocks({
    rsaMock: {
      encryptWithPublicKey(value) {
        return `enc(${value})`;
      },
    },
    wxMock: {
      getSystemInfoSync() {
        return { platform: 'devtools' };
      },
      getStorageSync(key) {
        if (key === 'access_token') return 'token-demo';
        return '';
      },
      request(options) {
        calls.push({ url: options.url, method: options.method, data: options.data });
        if (options.url.includes('/users/security/rsa-public-key')) {
          options.success({ statusCode: 200, data: { kid: 'v2', public_key: 'mock-public-key' } });
          return;
        }
        options.success({ statusCode: 200, data: { id: 1 } });
      },
    },
  });

  await api.registerParticipant({
    activity_id: 1,
    participant_name: '张三',
    phone: '13800138000',
  });

  const call = calls.find((item) => item.url.includes('/participants/'));
  assert.ok(call, '应调用 participants 接口');
  assert.equal(call.data.phone, undefined);
  assert.equal(call.data.encryption_kid, 'v2');
  assert.equal(call.data.phone_encrypted, 'enc(13800138000)');
});

test('createPaymentOrder 会发送加密字段而不是明文字段', async () => {
  const calls = [];
  const api = loadApiWithMocks({
    rsaMock: {
      encryptWithPublicKey(value) {
        return `enc(${value})`;
      },
    },
    wxMock: {
      getSystemInfoSync() {
        return { platform: 'devtools' };
      },
      getStorageSync(key) {
        if (key === 'access_token') return 'token-demo';
        return '';
      },
      request(options) {
        calls.push({ url: options.url, method: options.method, data: options.data });
        if (options.url.includes('/users/security/rsa-public-key')) {
          options.success({ statusCode: 200, data: { kid: 'v2', public_key: 'mock-public-key' } });
          return;
        }
        options.success({ statusCode: 200, data: { order_no: 'A001' } });
      },
    },
  });

  await api.createPaymentOrder({
    activity_id: 1,
    actual_fee: 100,
    participant_name: '张三',
    phone: '13800138000',
  });

  const call = calls.find((item) => item.url.includes('/payments/create'));
  assert.ok(call, '应调用 payments/create 接口');
  assert.equal(call.data.phone, undefined);
  assert.equal(call.data.encryption_kid, 'v2');
  assert.equal(call.data.phone_encrypted, 'enc(13800138000)');
});
