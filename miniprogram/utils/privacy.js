/**
 * 隐私授权工具：
 * - 首次进入时触发微信隐私授权弹窗
 * - 在敏感能力调用前可显式再次确认授权状态
 */
function ensurePrivacyAuthorization() {
  return new Promise((resolve, reject) => {
    if (!wx || typeof wx.getPrivacySetting !== 'function' || typeof wx.requirePrivacyAuthorize !== 'function') {
      resolve(true);
      return;
    }

    wx.getPrivacySetting({
      success: (res) => {
        if (!res || res.needAuthorization !== true) {
          resolve(true);
          return;
        }
        wx.requirePrivacyAuthorize({
          success: () => resolve(true),
          fail: (err) => reject(err || new Error('未完成隐私授权')),
        });
      },
      fail: () => {
        // 查询失败不阻断，避免影响低版本环境
        resolve(true);
      },
    });
  });
}

module.exports = {
  ensurePrivacyAuthorization,
};

