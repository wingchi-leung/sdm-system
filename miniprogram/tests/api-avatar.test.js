const test = require('node:test');
const assert = require('node:assert/strict');

function loadApiWithWx(wxMock) {
  global.wx = wxMock;
  const apiPath = require.resolve('../utils/api');
  const configPath = require.resolve('../config/index');
  delete require.cache[apiPath];
  delete require.cache[configPath];
  return require('../utils/api');
}

test('更新头像遇到 405 时会自动回退到 POST', async () => {
  const calls = [];
  const api = loadApiWithWx({
    getSystemInfoSync() {
      return { platform: 'devtools' };
    },
    getStorageSync(key) {
      if (key === 'access_token') return 'token-demo';
      return '';
    },
    request(options) {
      calls.push({ method: options.method, url: options.url, data: options.data });
      if (options.method === 'PUT') {
        options.success({ statusCode: 405, data: { detail: 'Method Not Allowed' } });
        return;
      }
      options.success({ statusCode: 200, data: { avatar_url: options.data.avatar_url } });
    },
  });

  const result = await api.updateUserAvatar('builtin:avatar-4');

  assert.equal(calls.length, 2);
  assert.equal(calls[0].method, 'PUT');
  assert.equal(calls[1].method, 'POST');
  assert.equal(result.avatar_url, 'builtin:avatar-4');
});

test('查询支付订单时会编码订单号路径片段', async () => {
  const calls = [];
  const api = loadApiWithWx({
    getSystemInfoSync() {
      return { platform: 'devtools' };
    },
    getStorageSync(key) {
      if (key === 'access_token') return 'token-demo';
      if (key === 'current_tenant_code') return 'default';
      return '';
    },
    request(options) {
      calls.push({ method: options.method, url: options.url });
      options.success({ statusCode: 200, data: { order_no: 'ORDER/1?x=1', status: 0 } });
    },
  });

  await api.queryPaymentOrder('ORDER/1?x=1');

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/payments\/order\/ORDER%2F1%3Fx%3D1$/);
});
