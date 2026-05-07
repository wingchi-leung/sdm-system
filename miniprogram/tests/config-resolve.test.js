const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveConfig } = require('../config/resolve');

const selected = {
  localBaseUrl: 'http://127.0.0.1:8000/api/v1',
  localStaticBaseUrl: 'http://127.0.0.1:8000',
  remoteBaseUrl: 'https://api.chronono.org/api/v1',
  remoteStaticBaseUrl: 'https://api.chronono.org',
  tenantCode: 'default',
  debug: true,
};

test('开发者工具默认使用本地接口', () => {
  const resolved = resolveConfig({
    currentEnv: 'development',
    isDevtools: true,
    devtoolsApiMode: 'local',
    selected,
  });

  assert.equal(resolved.baseUrl, selected.localBaseUrl);
  assert.equal(resolved.staticBaseUrl, selected.localStaticBaseUrl);
});

test('真机开发版继续使用远程 HTTPS 接口', () => {
  const resolved = resolveConfig({
    currentEnv: 'development',
    isDevtools: false,
    devtoolsApiMode: 'local',
    selected,
  });

  assert.equal(resolved.baseUrl, selected.remoteBaseUrl);
  assert.equal(resolved.staticBaseUrl, selected.remoteStaticBaseUrl);
});

test('正式版始终使用生产配置', () => {
  const productionSelected = {
    baseUrl: 'https://api.chronono.org/api/v1',
    staticBaseUrl: 'https://api.chronono.org',
    tenantCode: 'default',
    debug: false,
  };

  const resolved = resolveConfig({
    currentEnv: 'production',
    isDevtools: true,
    devtoolsApiMode: 'local',
    selected: productionSelected,
  });

  assert.deepEqual(resolved, productionSelected);
});
