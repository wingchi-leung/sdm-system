const REGISTRATION_SUCCESS_SCENE = 'registration_success';

const DEFAULT_REGISTRATION_NOTIFICATION_TEMPLATE = {
  thing1: { value: '{{activity_name}}' },
  phrase2: { value: '报名成功' },
  time3: { value: '{{start_time}}' },
};

function getDefaultRegistrationNotificationForm() {
  return {
    enabled: false,
    templateId: '',
    pagePath: 'pages/my-activities/my-activities',
    payloadTemplateText: JSON.stringify(DEFAULT_REGISTRATION_NOTIFICATION_TEMPLATE, null, 2),
  };
}

function normalizeRegistrationNotificationConfig(config) {
  const defaults = getDefaultRegistrationNotificationForm();
  if (!config || typeof config !== 'object') {
    return defaults;
  }
  return {
    enabled: !!config.enabled,
    templateId: config.template_id || '',
    pagePath: config.page_path || defaults.pagePath,
    payloadTemplateText: JSON.stringify(
      config.payload_template_json && Object.keys(config.payload_template_json).length
        ? config.payload_template_json
        : DEFAULT_REGISTRATION_NOTIFICATION_TEMPLATE,
      null,
      2,
    ),
  };
}

function buildRegistrationNotificationPayload(form) {
  const normalized = form || getDefaultRegistrationNotificationForm();
  const enabled = !!normalized.enabled;
  const templateId = (normalized.templateId || '').trim();
  const pagePath = (normalized.pagePath || '').trim();
  let payloadTemplateJson = {};

  try {
    payloadTemplateJson = JSON.parse(normalized.payloadTemplateText || '{}');
  } catch (_) {
    throw new Error('消息体模板必须是合法 JSON');
  }

  if (!enabled) {
    return {
      enabled: false,
      template_id: templateId || null,
      page_path: pagePath || null,
      payload_template_json: payloadTemplateJson,
    };
  }

  if (!templateId) {
    throw new Error('启用报名成功通知时必须填写模板 ID');
  }
  if (!pagePath) {
    throw new Error('启用报名成功通知时必须填写跳转页面');
  }

  return {
    enabled: true,
    template_id: templateId,
    page_path: pagePath,
    payload_template_json: payloadTemplateJson,
  };
}

module.exports = {
  REGISTRATION_SUCCESS_SCENE,
  DEFAULT_REGISTRATION_NOTIFICATION_TEMPLATE,
  getDefaultRegistrationNotificationForm,
  normalizeRegistrationNotificationConfig,
  buildRegistrationNotificationPayload,
};
