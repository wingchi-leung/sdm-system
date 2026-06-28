const test = require('node:test');
const assert = require('node:assert/strict');

const avatarModulePath = require.resolve('../utils/avatar');
const imageModulePath = require.resolve('../utils/image');

const {
  buildAvatarCacheBustedUrl,
  getBuiltinAvatarList,
  getBuiltinAvatarPath,
  isBuiltinAvatarKey,
  resolveAvatarDisplayUrl,
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

test('自定义头像保持原始地址，避免额外缓存分裂', () => {
  assert.equal(
    buildAvatarCacheBustedUrl('/uploads/avatars/user-a.jpg', '2026-06-13T21:44:00Z'),
    '/uploads/avatars/user-a.jpg',
  );
  assert.equal(buildAvatarCacheBustedUrl('builtin:avatar-1', '2026-06-13'), 'builtin:avatar-1');
});

test('图片模块缺少 resolveDisplayUrl 时头像解析也应有兜底', async () => {
  const originalAvatar = require.cache[avatarModulePath];
  const originalImage = require.cache[imageModulePath];
  delete require.cache[avatarModulePath];
  require.cache[imageModulePath] = {
    id: imageModulePath,
    filename: imageModulePath,
    loaded: true,
    exports: {},
  };

  try {
    const freshAvatar = require('../utils/avatar');
    const resolved = await freshAvatar.resolveAvatarDisplayUrl('/uploads/avatars/user-b.jpg', '2026-06-21');
    assert.equal(resolved, '/uploads/avatars/user-b.jpg');
  } finally {
    if (originalAvatar) {
      require.cache[avatarModulePath] = originalAvatar;
    } else {
      delete require.cache[avatarModulePath];
    }
    if (originalImage) {
      require.cache[imageModulePath] = originalImage;
    } else {
      delete require.cache[imageModulePath];
    }
  }
});
