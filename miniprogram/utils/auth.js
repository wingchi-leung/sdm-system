/**
 * 登录态管理 - 与 Flutter AuthService 行为一致
 * 支持 admin（管理员）与 user（普通用户）双角色
 * 管理员进一步支持：super / activity_type_admin（按活动类型授权）
 */
const KEY_TOKEN = 'access_token';
const KEY_ROLE = 'user_role';
const KEY_USER_ID = 'user_id';
const KEY_USER_NAME = 'user_name';
const KEY_ADMIN_LEVEL = 'admin_level'; // super | activity_type_admin
const KEY_ADMIN_ACTIVITY_TYPES = 'admin_activity_types'; // [{ id, name, code }]

function normalizeText(v) {
  return (v == null ? '' : String(v)).trim();
}

function normalizeActivityType(item) {
  if (item == null) return null;
  if (typeof item === 'string') {
    const name = normalizeText(item);
    if (!name) return null;
    return { id: null, name, code: '' };
  }
  const idRaw = item.id != null ? item.id : item.activity_type_id;
  const idNum = idRaw != null && idRaw !== '' ? Number(idRaw) : null;
  const id = Number.isFinite(idNum) ? idNum : null;
  const name = normalizeText(item.name || item.type_name || item.activity_type_name || item.tag);
  const code = normalizeText(item.code || item.type_code);
  if (!name && !code && id == null) return null;
  return { id, name, code };
}

function normalizeActivityTypes(list) {
  const arr = Array.isArray(list) ? list : [];
  const normalized = arr
    .map(normalizeActivityType)
    .filter(Boolean);
  const uniq = [];
  const seen = {};
  normalized.forEach((item) => {
    const key = `${item.id != null ? item.id : 'n'}|${item.name}|${item.code}`;
    if (seen[key]) return;
    seen[key] = true;
    uniq.push(item);
  });
  return uniq;
}

function getToken() {
  return wx.getStorageSync(KEY_TOKEN) || null;
}

function getRole() {
  return wx.getStorageSync(KEY_ROLE) || null;
}

function getUserId() {
  const v = wx.getStorageSync(KEY_USER_ID);
  return v != null && v !== '' ? parseInt(v, 10) : null;
}

function getUserName() {
  return wx.getStorageSync(KEY_USER_NAME) || null;
}

function getAdminLevel() {
  return wx.getStorageSync(KEY_ADMIN_LEVEL) || null;
}

function getAdminActivityTypes() {
  const list = wx.getStorageSync(KEY_ADMIN_ACTIVITY_TYPES);
  return normalizeActivityTypes(Array.isArray(list) ? list : []);
}

function isLoggedIn() {
  const t = getToken();
  return t != null && t !== '';
}

function isAdmin() {
  return isLoggedIn() && getRole() === 'admin';
}

function isUser() {
  return isLoggedIn() && getRole() === 'user';
}

function isSuperAdmin() {
  const level = getAdminLevel();
  return isAdmin() && (level === 'super' || !level);
}

function isActivityTypeAdmin() {
  return isAdmin() && getAdminLevel() === 'activity_type_admin';
}

function canManageActivityType(activity) {
  if (!isAdmin()) return false;
  if (isSuperAdmin()) return true;
  if (!isActivityTypeAdmin()) return false;

  const allowed = getAdminActivityTypes();
  if (!allowed.length) return false;
  const current = normalizeActivityType(activity);
  if (!current) return false;

  if (current.id != null) {
    return allowed.some((a) => a.id != null && a.id === current.id);
  }
  const name = normalizeText(current.name).toLowerCase();
  const code = normalizeText(current.code).toLowerCase();
  return allowed.some((a) => {
    const n = normalizeText(a.name).toLowerCase();
    const c = normalizeText(a.code).toLowerCase();
    return (name && n && name === n) || (code && c && code === c);
  });
}

function pickFromLoginResponse(res, keys) {
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (res && Object.prototype.hasOwnProperty.call(res, key) && res[key] != null) {
      return res[key];
    }
  }
  return undefined;
}

function parseAdminMeta(res) {
  const isSuperRaw = pickFromLoginResponse(res, ['is_super_admin', 'super_admin']);
  let adminLevel = null;
  if (isSuperRaw != null) {
    adminLevel = Number(isSuperRaw) === 1 || isSuperRaw === true ? 'super' : 'activity_type_admin';
  }
  const typeRaw = normalizeText(
    pickFromLoginResponse(res, ['admin_level', 'admin_type', 'scope'])
  ).toLowerCase();
  if (typeRaw) {
    if (typeRaw === 'super' || typeRaw === 'super_admin') adminLevel = 'super';
    if (
      typeRaw === 'activity_type_admin' ||
      typeRaw === 'activity_admin' ||
      typeRaw === 'type_admin'
    ) {
      adminLevel = 'activity_type_admin';
    }
  }
  const activityTypes = normalizeActivityTypes(
    pickFromLoginResponse(res, [
      'activity_types',
      'managed_activity_types',
      'allowed_activity_types',
      'authorized_activity_types',
    ])
  );
  if (!adminLevel) {
    // 兼容当前后端：未返回分级字段时，保持原行为（管理员默认视作超级管理员）
    adminLevel = 'super';
  }
  return { adminLevel, activityTypes };
}

/** 保存管理员登录结果 */
function saveAdminToken(accessToken, meta = null) {
  wx.setStorageSync(KEY_TOKEN, accessToken);
  wx.setStorageSync(KEY_ROLE, 'admin');
  wx.removeStorageSync(KEY_USER_ID);
  wx.removeStorageSync(KEY_USER_NAME);
  const parsed = parseAdminMeta(meta || {});
  wx.setStorageSync(KEY_ADMIN_LEVEL, parsed.adminLevel);
  wx.setStorageSync(KEY_ADMIN_ACTIVITY_TYPES, parsed.activityTypes);
}

/** 保存普通用户登录结果 */
function saveUserToken({ accessToken, userId, userName }) {
  wx.setStorageSync(KEY_TOKEN, accessToken);
  wx.setStorageSync(KEY_ROLE, 'user');
  wx.setStorageSync(KEY_USER_ID, userId);
  wx.setStorageSync(KEY_USER_NAME, userName || '');
  wx.removeStorageSync(KEY_ADMIN_LEVEL);
  wx.removeStorageSync(KEY_ADMIN_ACTIVITY_TYPES);
}

function logout() {
  wx.removeStorageSync(KEY_TOKEN);
  wx.removeStorageSync(KEY_ROLE);
  wx.removeStorageSync(KEY_USER_ID);
  wx.removeStorageSync(KEY_USER_NAME);
  wx.removeStorageSync(KEY_ADMIN_LEVEL);
  wx.removeStorageSync(KEY_ADMIN_ACTIVITY_TYPES);
}

module.exports = {
  normalizeActivityType,
  parseAdminMeta,
  getToken,
  getRole,
  getUserId,
  getUserName,
  getAdminLevel,
  getAdminActivityTypes,
  isLoggedIn,
  isAdmin,
  isUser,
  isSuperAdmin,
  isActivityTypeAdmin,
  canManageActivityType,
  saveAdminToken,
  saveUserToken,
  logout,
};
