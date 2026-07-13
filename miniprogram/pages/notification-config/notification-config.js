const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');

const TARGET_SCENES = ['registration_received', 'review_result'];

function safeParsePayload(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) {
    return {};
  }
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('消息体模板必须是 JSON 对象');
  }
  return parsed;
}

function normalizeSceneItem(item) {
  const payloadTemplateJson = item.payload_template_json || {};
  return {
    scene: item.scene,
    name: item.name || '',
    description: item.description || '',
    enabled: !!item.enabled,
    templateId: item.template_id || '',
    pagePath: item.page_path || '',
    payloadTemplateText: JSON.stringify(payloadTemplateJson, null, 2),
    saving: false,
  };
}

Page({
  data: {
    loading: true,
    error: '',
    scenes: [],
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    if (!auth.isAdmin()) {
      auth.redirectToLogin('请先使用管理员账号登录');
      return;
    }
    this.loadSceneConfigs();
  },

  async loadSceneConfigs() {
    this.setData({
      loading: true,
      error: '',
    });

    try {
      const items = await api.getNotificationSceneConfigs();
      const scenes = (items || [])
        .filter((item) => TARGET_SCENES.includes(item.scene))
        .map(normalizeSceneItem);
      this.setData({
        scenes,
        loading: false,
      });
    } catch (err) {
      this.setData({
        loading: false,
        error: err && err.message ? err.message : '通知配置加载失败',
      });
    }
  },

  updateSceneField(index, field, value) {
    const scenes = this.data.scenes.slice();
    const scene = scenes[index];
    if (!scene) {
      return;
    }
    scenes[index] = {
      ...scene,
      [field]: value,
    };
    this.setData({
      scenes,
      error: '',
    });
  },

  onEnabledChange(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.updateSceneField(index, 'enabled', !!e.detail.value);
  },

  onNameInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.updateSceneField(index, 'name', e.detail.value || '');
  },

  onDescriptionInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.updateSceneField(index, 'description', e.detail.value || '');
  },

  onTemplateIdInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.updateSceneField(index, 'templateId', e.detail.value || '');
  },

  onPagePathInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.updateSceneField(index, 'pagePath', e.detail.value || '');
  },

  onPayloadTemplateInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.updateSceneField(index, 'payloadTemplateText', e.detail.value || '');
  },

  async saveScene(e) {
    const index = Number(e.currentTarget.dataset.index);
    const scene = this.data.scenes[index];
    if (!scene || scene.saving) {
      return;
    }

    let payload;
    try {
      payload = {
        name: (scene.name || '').trim(),
        description: (scene.description || '').trim(),
        enabled: !!scene.enabled,
        template_id: (scene.templateId || '').trim() || null,
        page_path: (scene.pagePath || '').trim() || null,
        payload_template_json: safeParsePayload(scene.payloadTemplateText),
      };
      if (!payload.name) {
        throw new Error('请填写场景名称');
      }
    } catch (err) {
      this.setData({ error: err.message || '通知配置格式错误' });
      return;
    }

    const scenes = this.data.scenes.slice();
    scenes[index] = {
      ...scene,
      saving: true,
    };
    this.setData({
      scenes,
      error: '',
    });

    try {
      const updated = await api.updateNotificationSceneConfig(scene.scene, payload);
      scenes[index] = {
        ...normalizeSceneItem(updated),
        saving: false,
      };
      this.setData({
        scenes,
        error: '',
      });
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (err) {
      scenes[index] = {
        ...scene,
        saving: false,
      };
      this.setData({
        scenes,
        error: err && err.message ? err.message : '保存失败',
      });
    }
  },
});
