/**
 * 从接口返回中提取尽量可读的错误文案。
 */
function extractErrorMessage(payload) {
  if (payload == null) {
    return '';
  }

  if (typeof payload === 'string') {
    return payload.trim();
  }

  if (typeof payload.detail === 'string') {
    return payload.detail.trim();
  }

  if (Array.isArray(payload.detail)) {
    const firstItem = payload.detail[0];
    if (firstItem && typeof firstItem.msg === 'string') {
      return firstItem.msg.trim();
    }
    return String(payload.detail);
  }

  if (typeof payload.msg === 'string') {
    return payload.msg.trim();
  }

  if (typeof payload.message === 'string') {
    return payload.message.trim();
  }

  return '';
}

function looksLikeHtmlPayload(payload) {
  if (typeof payload !== 'string') {
    return false;
  }

  const normalized = payload.trim().toLowerCase();
  return normalized.startsWith('<!doctype html') || normalized.startsWith('<html');
}

function isCloudflareTunnelError(statusCode, payload) {
  if (!looksLikeHtmlPayload(payload)) {
    return false;
  }

  const normalized = payload.toLowerCase();
  return normalized.includes('cloudflare tunnel error') ||
    normalized.includes('error code: 1033') ||
    normalized.includes('api.chronono.org');
}

function normalizeApiErrorMessage(statusCode, payload) {
  const directMessage = extractErrorMessage(payload);
  if (directMessage && !looksLikeHtmlPayload(directMessage)) {
    return directMessage;
  }

  if (isCloudflareTunnelError(statusCode, payload)) {
    return '开发环境接口暂时不可用，请先启动本地后端 127.0.0.1:8000，或恢复 Cloudflare Tunnel 后重试';
  }

  if (looksLikeHtmlPayload(payload) || looksLikeHtmlPayload(directMessage)) {
    return '服务器返回了异常页面，请检查接口地址或代理配置';
  }

  if (statusCode >= 500) {
    return '服务器开小差了，请稍后重试';
  }

  if (statusCode === 404) {
    return '请求的接口不存在，请检查后端服务配置';
  }

  return directMessage || '请求失败，请稍后重试';
}

/**
 * 兜底规范化运行时错误（wx.request fail / Promise reject object 等）。
 */
function normalizeRuntimeErrorMessage(error, fallbackMessage = '请求失败，请稍后重试') {
  if (error == null) {
    return fallbackMessage;
  }

  if (typeof error === 'string') {
    const trimmed = error.trim();
    return trimmed || fallbackMessage;
  }

  const fromMessage = typeof error.message === 'string' ? error.message.trim() : '';
  if (fromMessage && fromMessage !== '[object Object]') {
    return fromMessage;
  }

  const extracted = extractErrorMessage(error);
  if (extracted && extracted !== '[object Object]') {
    return extracted;
  }

  const fromErrMsg = typeof error.errMsg === 'string' ? error.errMsg.trim() : '';
  if (fromErrMsg) {
    return fromErrMsg;
  }

  return fallbackMessage;
}

module.exports = {
  extractErrorMessage,
  looksLikeHtmlPayload,
  isCloudflareTunnelError,
  normalizeApiErrorMessage,
  normalizeRuntimeErrorMessage,
};
