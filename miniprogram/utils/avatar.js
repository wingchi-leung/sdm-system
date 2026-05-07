const image = require('./image');

const BUILTIN_AVATARS = [
  { key: 'builtin:avatar-1', label: '默认头像 1', path: '/assets/avatars/avatar-1.svg' },
  { key: 'builtin:avatar-2', label: '默认头像 2', path: '/assets/avatars/avatar-2.svg' },
  { key: 'builtin:avatar-3', label: '默认头像 3', path: '/assets/avatars/avatar-3.svg' },
  { key: 'builtin:avatar-4', label: '默认头像 4', path: '/assets/avatars/avatar-4.svg' },
];

function getBuiltinAvatarList() {
  return BUILTIN_AVATARS.map((item) => ({ ...item }));
}

function isBuiltinAvatarKey(value) {
  const text = value == null ? '' : String(value).trim();
  return BUILTIN_AVATARS.some((item) => item.key === text);
}

function getBuiltinAvatarPath(value) {
  const text = value == null ? '' : String(value).trim();
  const matched = BUILTIN_AVATARS.find((item) => item.key === text);
  return matched ? matched.path : '';
}

async function resolveAvatarDisplayUrl(avatarUrl) {
  const text = avatarUrl == null ? '' : String(avatarUrl).trim();
  if (!text) {
    return BUILTIN_AVATARS[0].path;
  }
  if (isBuiltinAvatarKey(text)) {
    return getBuiltinAvatarPath(text);
  }
  if (text.startsWith('/assets/')) {
    return text;
  }
  return image.resolveDisplayUrl(text);
}

module.exports = {
  BUILTIN_AVATARS,
  getBuiltinAvatarList,
  isBuiltinAvatarKey,
  getBuiltinAvatarPath,
  resolveAvatarDisplayUrl,
};
