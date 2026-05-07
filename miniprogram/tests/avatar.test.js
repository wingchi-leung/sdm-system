const test = require('node:test');
const assert = require('node:assert/strict');

const {
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
