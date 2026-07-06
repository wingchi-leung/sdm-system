const tenant = require('../../utils/tenant');

Page({
  onLoad(options) {
    tenant.applyPageOptions(options);
    const targetUrl = tenant.appendTenantToUrl('/pages/community-post-create/community-post-create', {
      ...options,
      mode: 'channel_announcement',
    });

    if (typeof wx.redirectTo === 'function') {
      wx.redirectTo({
        url: targetUrl,
        fail: () => {
          if (typeof wx.navigateTo === 'function') {
            wx.navigateTo({ url: targetUrl });
          }
        },
      });
    }
  },
});
