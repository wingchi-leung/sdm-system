const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');
const {
  REGISTRATION_SUCCESS_SCENE,
  getDefaultRegistrationNotificationForm,
  normalizeRegistrationNotificationConfig,
  buildRegistrationNotificationPayload,
} = require('../../utils/activity-notification');

Page({
  data: {
    activityId: null,
    activityName: '',
    loading: true,
    saving: false,
    error: null,
    form: getDefaultRegistrationNotificationForm(),
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    if (!auth.isAdmin()) {
      auth.redirectToLogin('请先使用管理员账号登录');
      return;
    }
    const activityId = Number(options.id || 0);
    if (!activityId) {
      wx.showToast({ title: '缺少活动参数', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1200);
      return;
    }
    this.setData({ activityId });
    this.loadPageData(activityId);
  },

  async loadPageData(activityId) {
    this.setData({ loading: true, error: null });
    try {
      const [activity, config] = await Promise.all([
        api.getActivity(activityId),
        api.getActivityNotificationConfig(activityId, REGISTRATION_SUCCESS_SCENE),
      ]);
      this.setData({
        activityName: activity.activity_name || '',
        form: normalizeRegistrationNotificationConfig(config),
        loading: false,
      });
    } catch (err) {
      this.setData({
        loading: false,
        error: err && err.message ? err.message : '通知配置加载失败',
      });
    }
  },

  onEnabledChange(e) {
    this.setData({
      form: {
        ...this.data.form,
        enabled: !!e.detail.value,
      },
      error: null,
    });
  },

  onTemplateIdInput(e) {
    this.setData({
      form: {
        ...this.data.form,
        templateId: e.detail.value || '',
      },
      error: null,
    });
  },

  onPagePathInput(e) {
    this.setData({
      form: {
        ...this.data.form,
        pagePath: e.detail.value || '',
      },
      error: null,
    });
  },

  onPayloadTemplateInput(e) {
    this.setData({
      form: {
        ...this.data.form,
        payloadTemplateText: e.detail.value || '',
      },
      error: null,
    });
  },

  async save() {
    if (this.data.saving || !this.data.activityId) {
      return;
    }

    let payload = null;
    try {
      payload = buildRegistrationNotificationPayload(this.data.form);
    } catch (err) {
      this.setData({ error: err.message || '通知配置格式错误' });
      return;
    }

    this.setData({ saving: true, error: null });
    try {
      const updated = await api.updateActivityNotificationConfig(
        this.data.activityId,
        REGISTRATION_SUCCESS_SCENE,
        payload,
      );
      this.setData({
        saving: false,
        form: normalizeRegistrationNotificationConfig(updated),
      });
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (err) {
      this.setData({
        saving: false,
        error: err && err.message ? err.message : '保存失败',
      });
    }
  },
});
