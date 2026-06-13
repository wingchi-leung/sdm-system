const image = require('./image');

const BUILTIN_AVATARS = [
  { key: 'builtin:avatar-1', label: '默认头像 1', path: '/assets/avatars/avatar-1.svg' },
  { key: 'builtin:avatar-2', label: '默认头像 2', path: '/assets/avatars/avatar-2.svg' },
  { key: 'builtin:avatar-3', label: '默认头像 3', path: '/assets/avatars/avatar-3.svg' },
  { key: 'builtin:avatar-4', label: '默认头像 4', path: '/assets/avatars/avatar-4.svg' },
];

function getDefaultAvatarKey() {
  return BUILTIN_AVATARS[0].key;
}

function getDefaultAvatarPath() {
  return BUILTIN_AVATARS[0].path;
}

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

function isSupportedCustomAvatarUrl(value) {
  const text = value == null ? '' : String(value).trim();
  if (!text) return false;
  if (text.startsWith('/uploads/avatars/')) {
    return true;
  }
  if (text.startsWith('http://') || text.startsWith('https://')) {
    return /\/uploads\/avatars\//.test(text);
  }
  return false;
}

function normalizeAvatarValue(avatarUrl) {
  const text = avatarUrl == null ? '' : String(avatarUrl).trim();
  if (!text) {
    return getDefaultAvatarKey();
  }
  if (isBuiltinAvatarKey(text) || text.startsWith('/assets/')) {
    return text;
  }
  if (isSupportedCustomAvatarUrl(text)) {
    return text;
  }
  return getDefaultAvatarKey();
}

function buildAvatarCacheBustedUrl(avatarUrl, cacheVersion) {
  const text = normalizeAvatarValue(avatarUrl);
  if (!text || isBuiltinAvatarKey(text) || text.startsWith('/assets/')) {
    return text;
  }
  const version = cacheVersion == null ? '' : String(cacheVersion).trim();
  if (!version) {
    return text;
  }
  const separator = text.includes('?') ? '&' : '?';
  return `${text}${separator}v=${encodeURIComponent(version)}`;
}

async function resolveAvatarDisplayUrl(avatarUrl, cacheVersion) {
  const text = normalizeAvatarValue(avatarUrl);
  if (!text) {
    return getDefaultAvatarPath();
  }
  if (isBuiltinAvatarKey(text)) {
    return getBuiltinAvatarPath(text);
  }
  if (text.startsWith('/assets/')) {
    return text;
  }
  return image.resolveDisplayUrl(buildAvatarCacheBustedUrl(text, cacheVersion));
}

module.exports = {
  BUILTIN_AVATARS,
  getDefaultAvatarKey,
  getDefaultAvatarPath,
  getBuiltinAvatarList,
  isBuiltinAvatarKey,
  getBuiltinAvatarPath,
  isSupportedCustomAvatarUrl,
  normalizeAvatarValue,
  buildAvatarCacheBustedUrl,
  resolveAvatarDisplayUrl,
};
