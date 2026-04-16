/**
 * 小程序租户上下文管理
 * 支持默认租户、启动参数、分享链接和扫码 scene 动态切换。
 */
const config = require('../config/index');

const KEY_TENANT_CODE = 'current_tenant_code';
const DEFAULT_TENANT_CODE = config.tenantCode || 'default';

const AUTH_KEYS = [
  'access_token',
  'user_role',
  'user_id',
  'user_name',
  'admin_level',
  'admin_activity_types',
  'require_bind_info',
  'wechat_phone',
  'pending_payment_order',
];

function normalizeTenantCode(code) {
  const text = code == null ? '' : String(code).trim();
  if (!text) return '';
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(text)) return '';
  return text;
}

function clearLoginState() {
  AUTH_KEYS.forEach((key) => wx.removeStorageSync(key));
}

function getTenantCode() {
  return normalizeTenantCode(wx.getStorageSync(KEY_TENANT_CODE)) || DEFAULT_TENANT_CODE;
}

function setTenantCode(code, options = {}) {
  const nextCode = normalizeTenantCode(code);
  if (!nextCode) return getTenantCode();

  const previousCode = getTenantCode();
  if (previousCode !== nextCode) {
    wx.setStorageSync(KEY_TENANT_CODE, nextCode);
    if (options.clearAuth !== false) {
      clearLoginState();
    }
  }
  return nextCode;
}

function parseQueryString(query) {
  const result = {};
  const text = query == null ? '' : String(query).replace(/^\?/, '');
  if (!text) return result;
  text.split('&').forEach((pair) => {
    if (!pair) return;
    const parts = pair.split('=');
    const key = decodeURIComponent(parts[0] || '').trim();
    const value = decodeURIComponent(parts.slice(1).join('=') || '').trim();
    if (key) result[key] = value;
  });
  return result;
}

function parseScene(scene) {
  const decoded = decodeURIComponent(scene || '');
  if (!decoded) return {};
  if (decoded.includes('=') || decoded.includes('&')) {
    return parseQueryString(decoded);
  }
  return { tenant_code: decoded };
}

function pickTenantCode(options) {
  const opts = options || {};
  const direct = opts.tenant_code || opts.tenantCode || opts.t;
  if (direct) return direct;

  const sceneParams = parseScene(opts.scene);
  return sceneParams.tenant_code || sceneParams.tenantCode || sceneParams.t || '';
}

function applyPageOptions(options) {
  const code = pickTenantCode(options);
  if (code) setTenantCode(code);
  return getTenantCode();
}

function applyLaunchOptions(options) {
  const query = options && options.query ? options.query : {};
  applyPageOptions(query);
  return getTenantCode();
}

function buildQuery(params) {
  const parts = [];
  Object.keys(params || {}).forEach((key) => {
    const value = params[key];
    if (value === undefined || value === null || value === '') return;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  });
  return parts.join('&');
}

function appendTenantToUrl(url, extraParams = {}) {
  const joiner = url.includes('?') ? '&' : '?';
  const query = buildQuery({
    ...extraParams,
    tenant_code: getTenantCode(),
  });
  return query ? `${url}${joiner}${query}` : url;
}

module.exports = {
  DEFAULT_TENANT_CODE,
  getTenantCode,
  setTenantCode,
  applyLaunchOptions,
  applyPageOptions,
  appendTenantToUrl,
};
