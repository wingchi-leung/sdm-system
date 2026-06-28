function fallbackItems(items) {
  return Array.isArray(items) ? items : [];
}

async function resolveActivityPostersOrFallback(imageModule, items, contextLabel = '活动列表') {
  const resolver = imageModule && imageModule.resolveActivityPosters;
  if (typeof resolver !== 'function') {
    // 模块导出异常时先兜底，避免页面直接崩溃
    console.warn('[image] resolveActivityPosters unavailable', {
      context: contextLabel,
      keys: imageModule ? Object.keys(imageModule) : [],
    });
    return fallbackItems(items);
  }

  try {
    return await resolver(items);
  } catch (err) {
    console.warn('[image] resolveActivityPosters failed', {
      context: contextLabel,
      message: err && err.message ? err.message : String(err),
    });
    return fallbackItems(items);
  }
}

module.exports = {
  resolveActivityPostersOrFallback,
};
