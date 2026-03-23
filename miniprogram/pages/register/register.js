const api = require('../../utils/api');
const auth = require('../../utils/auth');

Page({
  data: {
    activityId: null,
    activity: null,
    name: '',
    phone: '',
    identityNumber: '',
    submitting: false,
    error: null,
    loading: true,
    // 支付相关
    requirePayment: false,
    suggestedFee: 0,
    suggestedFeeYuan: '0.00',
    actualFee: '',
    actualFeeYuan: '',
  },

  onLoad(options) {
    const activityId = options.id;
    if (!activityId) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    this.setData({ activityId });
    this.loadActivity(activityId);
  },

  // 加载活动详情
  async loadActivity(activityId) {
    try {
      const activity = await api.getActivity(activityId);

      // 检查是否需要支付
      const requirePayment = activity.require_payment === 1;
      const suggestedFee = activity.suggested_fee || 0;
      const suggestedFeeYuan = (suggestedFee / 100).toFixed(2);

      this.setData({
        activity,
        requirePayment,
        suggestedFee,
        suggestedFeeYuan,
        actualFee: suggestedFee,
        actualFeeYuan: suggestedFeeYuan,
        loading: false,
      });
    } catch (err) {
      wx.showToast({ title: '加载活动失败', icon: 'none' });
      this.setData({ loading: false });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value, error: null });
  },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value, error: null });
  },

  onIdInput(e) {
    this.setData({ identityNumber: e.detail.value, error: null });
  },

  onFeeInput(e) {
    const value = e.detail.value;
    // 验证输入是否为有效数字
    const feeYuan = parseFloat(value) || 0;
    const feeFen = Math.round(feeYuan * 100);

    this.setData({
      actualFeeYuan: value,
      actualFee: feeFen,
      error: null,
    });
  },

  onFeeBlur() {
    // 失焦时格式化金额
    const feeYuan = parseFloat(this.data.actualFeeYuan) || 0;
    const feeFen = Math.round(feeYuan * 100);
    this.setData({
      actualFeeYuan: feeYuan.toFixed(2),
      actualFee: feeFen,
    });
  },

  // 验证表单
  validateForm() {
    const { name, phone, requirePayment, actualFee, suggestedFee } = this.data;

    if (!name || !name.trim()) {
      this.setData({ error: '请输入姓名' });
      return false;
    }
    if (!phone || !phone.trim()) {
      this.setData({ error: '请输入手机号' });
      return false;
    }

    // 如果需要支付，验证金额
    if (requirePayment) {
      if (!actualFee || actualFee < suggestedFee) {
        this.setData({ error: `支付金额不能低于 ${this.data.suggestedFeeYuan} 元` });
        return false;
      }
    }

    return true;
  },

  // 普通报名（无需支付）
  doRegister() {
    const { activity, name, phone, identityNumber } = this.data;

    api
      .registerParticipant({
        activity_id: activity.id,
        participant_name: name.trim(),
        phone: phone.trim(),
        identity_number: identityNumber || undefined,
      })
      .then(() => {
        wx.showToast({ title: '报名成功', icon: 'success' });
        setTimeout(() => {
          wx.navigateBack();
        }, 1200);
      })
      .catch((err) => {
        const msg = err && err.message ? err.message : String(err);
        this.setData({ error: msg, submitting: false });
      });
  },

  // 支付报名
  doPaymentRegister() {
    const { activity, name, phone, identityNumber, actualFee } = this.data;

    // 1. 创建支付订单
    api
      .createPaymentOrder({
        activity_id: activity.id,
        participant_name: name.trim(),
        phone: phone.trim(),
        identity_number: identityNumber || undefined,
        actual_fee: actualFee,
      })
      .then((orderData) => {
        // 2. 获取支付参数
        const paymentParams = orderData.payment_params;
        if (!paymentParams) {
          throw new Error('获取支付参数失败');
        }

        // 3. 调用微信支付
        return new Promise((resolve, reject) => {
          wx.requestPayment({
            timeStamp: paymentParams.timeStamp,
            nonceStr: paymentParams.nonceStr,
            package: paymentParams.package,
            signType: paymentParams.signType,
            paySign: paymentParams.paySign,
            success: () => resolve(orderData),
            fail: (err) => reject(err),
          });
        });
      })
      .then((orderData) => {
        // 4. 支付成功
        wx.showToast({ title: '支付成功', icon: 'success' });
        setTimeout(() => {
          wx.navigateBack();
        }, 1200);
      })
      .catch((err) => {
        // 处理错误
        let msg = '支付失败';
        if (err && err.errMsg && err.errMsg.includes('cancel')) {
          msg = '已取消支付';
        } else if (err && err.message) {
          msg = err.message;
        } else if (err && err.errMsg) {
          msg = err.errMsg;
        }
        this.setData({ error: msg, submitting: false });
      });
  },

  submit() {
    // 防抖：如果正在提交，直接返回
    if (this.data.submitting) {
      return;
    }

    if (!this.validateForm()) {
      return;
    }

    this.setData({ submitting: true, error: null });

    const { requirePayment } = this.data;

    if (requirePayment) {
      // 需要支付
      this.doPaymentRegister();
    } else {
      // 无需支付，直接报名
      this.doRegister();
    }
  },
});