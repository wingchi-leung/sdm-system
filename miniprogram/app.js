// SDM 活动报名小程序 - 入口
const tenant = require('./utils/tenant');
const privacy = require('./utils/privacy');
const config = require('./config/index');

App({
  onLaunch(options) {
    tenant.applyLaunchOptions(options);
    privacy.ensurePrivacyAuthorization().catch(() => {});
    this.loadCustomFont();
    // 可选：从 storage 恢复登录态，由各页按需读取
  },
  onShow(options) {
    tenant.applyLaunchOptions(options);
  },
  globalData: {
    channelListDirty: false,
  },

  /**
   * 动态注册落尘无衬 P0 (Lorchin Sans P0)
   * 走 staticBaseUrl + /uploads/fonts/LorchinSansP0.woff2,
   * 与后端 uploads 静态挂载复用,首屏回落 PingFang SC,字体到位后自动替换。
   * 失败时静默兜底,不影响主流程。
   */
  loadCustomFont() {
    if (!wx.loadFontFace) return;
    const base = (config && config.staticBaseUrl) || '';
    const fontUrl = base + '/uploads/fonts/LorchinSansP0.woff2';
    wx.loadFontFace({
      family: 'LorchinSansP0',
      source: `url("${fontUrl}")`,
      desc: {
        style: 'normal',
        weight: 'normal',
        variant: 'normal',
      },
      success: () => {
        if (config && config.debug) {
          console.log('[font] LorchinSansP0 loaded:', fontUrl);
        }
      },
      fail: (err) => {
        // 静默兜底,活动页会落到 PingFang SC
        if (config && config.debug) {
          console.warn('[font] LorchinSansP0 load failed:', err, fontUrl);
        }
      },
    });
  },
});
