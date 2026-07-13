/**
 * 环境配置文件
 * 支持多环境：开发环境、生产环境
 */

const { resolveConfig } = require('./resolve');

const LOCAL_DEV_HOST = 'http://127.0.0.1:8000';
const TUNNEL_HOST = 'https://api.chronono.org';
const PROD_HOST = 'https://api.chronono.org';

// 开发者工具调试模式：
// - 'local': 走本机/局域网后端（默认，便于本机联调）
// - 'remote': 走 Cloudflare Tunnel / Docker 暴露的 HTTPS 后端
const DEVTOOLS_API_MODE = 'local';

// 环境配置
const ENV = {
  // 开发环境：本地开发，可使用 HTTP
  development: {
    localBaseUrl: `${LOCAL_DEV_HOST}/api/v1`,
    localStaticBaseUrl: LOCAL_DEV_HOST,
    remoteBaseUrl: `${TUNNEL_HOST}/api/v1`,
    remoteStaticBaseUrl: TUNNEL_HOST,
    tenantCode: 'default',
    debug: true,
  },
  // 生产环境：必须使用 HTTPS
  production: {
    baseUrl: `${PROD_HOST}/api/v1`,
    staticBaseUrl: PROD_HOST,
    tenantCode: 'default',
    debug: false,
  }
};

// 根据小程序版本选择环境
// develop: 开发版, trial: 体验版, release: 正式版
function getEnv() {
  const envVersion = typeof __wxConfig !== 'undefined' ? __wxConfig.envVersion : 'develop';
  if (envVersion === 'release') {
    return 'production';
  }
  return 'development';
}

function isDevtools() {
  try {
    if (typeof wx.getDeviceInfo === 'function') {
      const deviceInfo = wx.getDeviceInfo();
      return deviceInfo && deviceInfo.platform === 'devtools';
    }
    if (typeof wx.getSystemInfoSync === 'function') {
      const systemInfo = wx.getSystemInfoSync();
      return systemInfo.platform === 'devtools';
    }
    return false;
  } catch (err) {
    return false;
  }
}

const currentEnv = getEnv();
const selected = ENV[currentEnv];

function getResolvedConfig() {
  return resolveConfig({
    currentEnv,
    isDevtools: isDevtools(),
    devtoolsApiMode: DEVTOOLS_API_MODE,
    selected,
  });
}

const resolved = getResolvedConfig();

module.exports = {
  baseUrl: resolved.baseUrl,
  staticBaseUrl: resolved.staticBaseUrl,
  tenantCode: resolved.tenantCode,
  debug: resolved.debug,
  env: currentEnv,
  isProduction: currentEnv === 'production',
  isDevtools: isDevtools(),
};
