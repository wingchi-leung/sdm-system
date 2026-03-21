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
    endDate: '',
    endTime: '',
    submitting: false,
    error: null,
    // 支付相关
    requirePayment: false,
    suggestedFeeYuan: '',
    suggestedFee: 0,
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

  onEndDateChange(e) {
    this.setData({ endDate: e.detail.value, error: null });
  },

  onEndTimeChange(e) {
    this.setData({ endTime: e.detail.value, error: null });
  },

  // 支付相关
  onRequirePaymentChange(e) {
    const checked = e.detail.value;
    this.setData({
      requirePayment: checked,
      // 如果取消支付，清空费用
      suggestedFeeYuan: checked ? this.data.suggestedFeeYuan : '',
      suggestedFee: checked ? this.data.suggestedFee : 0,
      error: null,
    });
  },

  onSuggestedFeeInput(e) {
    const value = e.detail.value;
    const feeYuan = parseFloat(value) || 0;
    const feeFen = Math.round(feeYuan * 100);
    this.setData({
      suggestedFeeYuan: value,
      suggestedFee: feeFen,
      error: null,
    });
  },

  onSuggestedFeeBlur() {
    // 失焦时格式化金额
    const feeYuan = parseFloat(this.data.suggestedFeeYuan) || 0;
    const feeFen = Math.round(feeYuan * 100);
    this.setData({
      suggestedFeeYuan: feeYuan > 0 ? feeYuan.toFixed(2) : '',
      suggestedFee: feeFen,
    });
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
    const { activityName, startDate, startTime, endDate, endTime, requirePayment, suggestedFee } = this.data;
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
    if (!endDate || !endTime) {
      this.setData({ error: '请选择结束时间' });
      return;
    }
    const start_time = new Date(startDate + 'T' + startTime + ':00');
    const end_time = new Date(endDate + 'T' + endTime + ':00');
    if (isNaN(start_time.getTime()) || isNaN(end_time.getTime())) {
      this.setData({ error: '时间格式有误' });
      return;
    }
    if (start_time >= end_time) {
      this.setData({ error: '开始时间必须早于结束时间' });
      return;
    }

    // 验证支付金额
    if (requirePayment && suggestedFee <= 0) {
      this.setData({ error: '请输入建议费用' });
      return;
    }

    this.setData({ submitting: true, error: null });
    api
      .createActivity({
        activity_name: activityName.trim(),
        tag: tag || activityType.name || '',
        start_time: start_time.toISOString(),
        end_time: end_time.toISOString(),
        activity_type_id: activityType.id,
        activity_type_name: activityType.name || '',
        participants: [],
        suggested_fee: requirePayment ? suggestedFee : 0,
        require_payment: requirePayment ? 1 : 0,
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