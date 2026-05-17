const tenant = require('../../utils/tenant');

Page({
  onLoad(options) {
    tenant.applyPageOptions(options);
  },
});

