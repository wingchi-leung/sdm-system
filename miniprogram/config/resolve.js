/**
 * 解析小程序当前环境下应使用的接口配置。
 */
function resolveConfig({ currentEnv, isDevtools, devtoolsApiMode, selected }) {
  if (currentEnv === 'production') {
    return selected;
  }

  if (isDevtools) {
    const useLocalDevtools = devtoolsApiMode === 'local';
    return {
      baseUrl: useLocalDevtools ? selected.localBaseUrl : selected.remoteBaseUrl,
      staticBaseUrl: useLocalDevtools ? selected.localStaticBaseUrl : selected.remoteStaticBaseUrl,
      tenantCode: selected.tenantCode,
      debug: selected.debug,
    };
  }

  return {
    baseUrl: selected.remoteBaseUrl,
    staticBaseUrl: selected.remoteStaticBaseUrl,
    tenantCode: selected.tenantCode,
    debug: selected.debug,
  };
}

module.exports = {
  resolveConfig,
};
