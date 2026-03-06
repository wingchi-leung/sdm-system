const api = require('../../utils/api');
const auth = require('../../utils/auth');

const DEFAULT_ACTIVITY_TYPES = ['参', '健康锻炼'];

Page({
  data: {
    activityName: '',
    activityTypeName: '',
    activityTypeIndex: -1,
    activityTypeOptions: [],
    isSuperAdmin: false,
    isTypeAdmin: false,
    tag: '',
    startDate: '',
    startTime: '',
    submitting: false,
    error: null,
  },

  onLoad() {
    if (!auth.isAdmin()) {
      wx.showToast({ title: '请先使用管理员账号登录', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    const isSuperAdmin = auth.isSuperAdmin();
    const isTypeAdmin = auth.isActivityTypeAdmin();
    const allowedTypes = auth.getAdminActivityTypes();

    if (isTypeAdmin && allowedTypes.length === 0) {
      wx.showToast({ title: '当前账号未授权任何活动类型', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    if (isTypeAdmin) {
      const initial = allowedTypes[0] || {};
      this.setData({
        isSuperAdmin,
        isTypeAdmin,
        activityTypeOptions: allowedTypes,
        activityTypeIndex: 0,
        activityTypeName: initial.name || '',
      });
      return;
    }

    // 超级管理员：可自由填写，也可快速从常见类型中选择
    const defaults = DEFAULT_ACTIVITY_TYPES.map((name) => ({ id: null, name, code: '' }));
    this.setData({
      isSuperAdmin,
      isTypeAdmin,
      activityTypeOptions: defaults,
      activityTypeIndex: 0,
      activityTypeName: defaults[0] ? defaults[0].name : '',
    });
  },

  onNameInput(e) {
    this.setData({ activityName: e.detail.value, error: null });
  },

  onTagInput(e) {
    this.setData({ tag: e.detail.value, error: null });
  },

  onActivityTypeInput(e) {
    this.setData({ activityTypeName: e.detail.value, activityTypeIndex: -1, error: null });
  },

  onActivityTypeChange(e) {
    const idx = Number(e.detail.value);
    const options = this.data.activityTypeOptions || [];
    const selected = options[idx] || {};
    this.setData({
      activityTypeIndex: idx,
      activityTypeName: selected.name || '',
      error: null,
    });
  },

  onDateChange(e) {
    this.setData({ startDate: e.detail.value, error: null });
  },

  onTimeChange(e) {
    this.setData({ startTime: e.detail.value, error: null });
  },

  getSelectedActivityType() {
    const options = this.data.activityTypeOptions || [];
    const idx = this.data.activityTypeIndex;
    if (idx >= 0 && options[idx]) return options[idx];
    const typedName = (this.data.activityTypeName || '').trim();
    if (!typedName) return null;
    return { id: null, name: typedName, code: '' };
  },

  submit() {
    const { activityName, startDate, startTime } = this.data;
    const tag = (this.data.tag || '').trim();
    const activityType = this.getSelectedActivityType();
    if (!activityName || !activityName.trim()) {
      this.setData({ error: '请输入活动名称' });
      return;
    }
    if (!activityType || !(activityType.name || '').trim()) {
      this.setData({ error: '请选择活动类型' });
      return;
    }
    if (!auth.canManageActivityType(activityType)) {
      this.setData({ error: '当前账号无该活动类型的发布权限' });
      return;
    }
    if (!startDate || !startTime) {
      this.setData({ error: '请选择开始时间' });
      return;
    }
    const start_time = new Date(startDate + 'T' + startTime + ':00');
    if (isNaN(start_time.getTime())) {
      this.setData({ error: '时间格式有误' });
      return;
    }
    this.setData({ submitting: true, error: null });
    api
      .createActivity({
        activity_name: activityName.trim(),
        tag: tag || activityType.name || '',
        start_time: start_time.toISOString(),
        activity_type_id: activityType.id,
        activity_type_name: activityType.name || '',
        participants: [],
      })
      .then(() => {
        wx.showToast({ title: '发布成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1000);
      })
      .catch((err) => {
        const msg = err && err.message ? err.message : String(err);
        this.setData({ error: msg, submitting: false });
      });
  },
});
