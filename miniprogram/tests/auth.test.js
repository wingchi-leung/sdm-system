const test = require('node:test');
const assert = require('node:assert/strict');

function loadAuthWithStorage(initialStorage = {}) {
  const storage = { ...initialStorage };
  global.wx = {
    getStorageSync(key) {
      return storage[key];
    },
    setStorageSync(key, value) {
      storage[key] = value;
    },
    removeStorageSync(key) {
      delete storage[key];
    },
  };

  const authPath = require.resolve('../utils/auth');
  delete require.cache[authPath];
  return {
    auth: require('../utils/auth'),
    storage,
  };
}

function loadAuthWithUi() {
  const calls = {
    toast: 0,
    reLaunch: 0,
  };
  global.wx = {
    getStorageSync() {
      return '';
    },
    setStorageSync() {},
    removeStorageSync() {},
    showToast() {
      calls.toast += 1;
    },
    reLaunch() {
      calls.reLaunch += 1;
    },
  };

  const authPath = require.resolve('../utils/auth');
  delete require.cache[authPath];
  return {
    auth: require('../utils/auth'),
    calls,
  };
}

test('保存普通用户登录态时会清理上一个账号的临时绑定信息', () => {
  const { auth, storage } = loadAuthWithStorage({
    require_bind_info: true,
    wechat_phone: '13800000000',
    admin_level: 'super',
  });

  auth.saveUserToken({
    accessToken: 'token-user',
    userId: 88,
    userName: '普通用户',
  });

  assert.equal(storage.access_token, 'token-user');
  assert.equal(storage.user_role, 'user');
  assert.equal(storage.user_id, 88);
  assert.equal(storage.user_name, '普通用户');
  assert.equal(storage.require_bind_info, undefined);
  assert.equal(storage.wechat_phone, undefined);
  assert.equal(storage.admin_level, undefined);
});

test('保存管理员登录态和退出登录时都会清理用户侧残留数据', () => {
  const { auth, storage } = loadAuthWithStorage({
    require_bind_info: true,
    wechat_phone: '13800000000',
    user_id: 99,
    user_name: '旧用户',
  });

  auth.saveAdminToken('token-admin', {
    auth: {
      is_super_admin: true,
      permissions: ['user.view'],
    },
  });

  assert.equal(storage.user_id, undefined);
  assert.equal(storage.user_name, undefined);
  assert.equal(storage.require_bind_info, undefined);
  assert.equal(storage.wechat_phone, undefined);

  auth.logout();

  assert.equal(storage.access_token, undefined);
  assert.equal(storage.user_role, undefined);
  assert.equal(storage.admin_permissions, undefined);
  assert.equal(storage.require_bind_info, undefined);
  assert.equal(storage.wechat_phone, undefined);
});

test('redirectToLogin 会提示并直接跳转登录页', () => {
  const { auth, calls } = loadAuthWithUi();

  auth.redirectToLogin('请先登录');

  assert.equal(calls.toast, 1);
  assert.equal(calls.reLaunch, 1);
});

test('handleSessionExpired 会识别 401 和 404 并触发重新登录', () => {
  const { auth, calls } = loadAuthWithUi();

  assert.equal(auth.isSessionExpiredError({ statusCode: 401 }), true);
  assert.equal(auth.isSessionExpiredError({ statusCode: 404 }), true);
  assert.equal(auth.isSessionExpiredError({ statusCode: 403 }), false);

  const handled = auth.handleSessionExpired({ statusCode: 401 }, '登录已过期，请重新登录');
  assert.equal(handled, true);
  assert.equal(calls.reLaunch, 1);
});
