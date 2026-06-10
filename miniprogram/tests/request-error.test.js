const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isCloudflareTunnelError,
  normalizeApiErrorMessage,
  normalizeRuntimeErrorMessage,
} = require('../utils/request-error');

test('识别 Cloudflare Tunnel HTML 错页', () => {
  const payload = '<!doctype html><html><head><title>Cloudflare Tunnel error | api.chronono.org</title></head><body>Error code: 1033</body></html>';
  assert.equal(isCloudflareTunnelError(530, payload), true);
});

test('Cloudflare Tunnel 错页返回友好中文提示', () => {
  const payload = '<!doctype html><html><head><title>Cloudflare Tunnel error | api.chronono.org</title></head><body>Error code: 1033</body></html>';
  assert.equal(
    normalizeApiErrorMessage(530, payload),
    '开发环境接口暂时不可用，请先启动本地后端 127.0.0.1:8000，或恢复 Cloudflare Tunnel 后重试'
  );
});

test('普通后端 detail 错误继续保留原文', () => {
  assert.equal(
    normalizeApiErrorMessage(400, { detail: '手机号不能为空' }),
    '手机号不能为空'
  );
});

test('运行时对象错误可提取 message，避免显示 [object Object]', () => {
  assert.equal(
    normalizeRuntimeErrorMessage({ message: '[object Object]', detail: '登录凭证失效' }, '登录失败'),
    '登录凭证失效'
  );
});
