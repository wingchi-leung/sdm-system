const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAvatarCacheBustedUrl,
  getBuiltinAvatarList,
  getBuiltinAvatarPath,
  isBuiltinAvatarKey,
} = require('../utils/avatar');

test('默认头像列表固定为 4 个', () => {
  const list = getBuiltinAvatarList();
  assert.equal(list.length, 4);
  assert.equal(list[0].key, 'builtin:avatar-1');
});

test('内置头像 key 可以映射到本地资源路径', () => {
  assert.equal(isBuiltinAvatarKey('builtin:avatar-3'), true);
  assert.equal(getBuiltinAvatarPath('builtin:avatar-3'), '/assets/avatars/avatar-3.svg');
});

test('自定义头像可以按版本号拼接缓存参数', () => {
  assert.equal(
    buildAvatarCacheBustedUrl('/uploads/avatars/user-a.jpg', '2026-06-13T21:44:00Z'),
    '/uploads/avatars/user-a.jpg?v=2026-06-13T21%3A44%3A00Z',
  );
  assert.equal(buildAvatarCacheBustedUrl('builtin:avatar-1', '2026-06-13'), 'builtin:avatar-1');
});
