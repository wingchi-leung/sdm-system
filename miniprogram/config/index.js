/**
 * 环境配置文件
 * 支持多环境：开发环境、生产环境
 */

// 环境配置
const ENV = {
  // 开发环境：本地开发，可使用 HTTP
  development: {
    baseUrl: 'http://172.20.10.6:8000/api/v1', // 请根据实际情况修改
    staticBaseUrl: 'http://172.20.10.6:8000', // 静态资源基础URL
    tenantCode: 'default',
    debug: true,
  },
  // 生产环境：必须使用 HTTPS
  production: {
    baseUrl: 'https://api.sdm-system.com/api/v1',
    staticBaseUrl: 'https://api.sdm-system.com',
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

const currentEnv = getEnv();
const selected = ENV[currentEnv];

module.exports = {
  baseUrl: selected.baseUrl,
  staticBaseUrl: selected.staticBaseUrl,
  tenantCode: selected.tenantCode,
  debug: selected.debug,
  env: currentEnv,
  isProduction: currentEnv === 'production',
};
