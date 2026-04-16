// SDM 活动报名小程序 - 入口
const tenant = require('./utils/tenant');

App({
  onLaunch(options) {
    tenant.applyLaunchOptions(options);
    // 可选：从 storage 恢复登录态，由各页按需读取
  },
  onShow(options) {
    tenant.applyLaunchOptions(options);
  },
  globalData: {}
});
