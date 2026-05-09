const test = require('node:test');
const assert = require('node:assert/strict');

function loadAuth() {
  const store = {};
  global.wx = {
    getStorageSync(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : '';
    },
    setStorageSync(key, value) {
      store[key] = value;
    },
    removeStorageSync(key) {
      delete store[key];
    },
  };

  const authPath = require.resolve('../utils/auth');
  delete require.cache[authPath];
  return { auth: require('../utils/auth'), store };
}

test('pending bind user keeps token but is not treated as logged in', () => {
  const { auth, store } = loadAuth();

  auth.saveUserToken({
    accessToken: 'token-user',
    userId: 12,
    userName: '微信用户',
  });
  auth.markRequireBindInfo('13800138000');

  assert.equal(store.access_token, 'token-user');
  assert.equal(store.wechat_phone, '13800138000');
  assert.equal(auth.hasPendingBindInfo(), true);
  assert.equal(auth.isLoggedIn(), false);
  assert.equal(auth.isUser(), false);
});

test('clearing bind requirement restores normal user login state', () => {
  const { auth } = loadAuth();

  auth.saveUserToken({
    accessToken: 'token-user',
    userId: 12,
    userName: '微信用户',
  });
  auth.markRequireBindInfo('13800138000');
  auth.clearRequireBindInfo();

  assert.equal(auth.hasPendingBindInfo(), false);
  assert.equal(auth.isLoggedIn(), true);
  assert.equal(auth.isUser(), true);
});

test('admin login clears stale bind requirement', () => {
  const { auth } = loadAuth();

  auth.saveUserToken({
    accessToken: 'token-user',
    userId: 12,
    userName: '微信用户',
  });
  auth.markRequireBindInfo('13800138000');
  auth.saveAdminToken('token-admin', {
    auth: { is_admin: true, is_super_admin: true },
  });

  assert.equal(auth.hasPendingBindInfo(), false);
  assert.equal(auth.isLoggedIn(), true);
  assert.equal(auth.isAdmin(), true);
});
