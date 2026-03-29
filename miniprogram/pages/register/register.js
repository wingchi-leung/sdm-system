const api = require('../../utils/api');
const auth = require('../../utils/auth');

Page({
  data: {
    activityId: null,
    activity: null,
    // 用户信息（从用户资料获取，不可编辑）
    userInfo: null,
    name: '',
    phone: '',
    sex: '',
    age: '',
    occupation: '',
    email: '',
    industry: '',
    identityType: '',
    identityNumber: '',
    // 问卷字段（用户填写）
    whyJoin: '',
    channel: '',
    expectation: '',
    activityUnderstanding: '',
    hasQuestions: '',
    submitting: false,
    error: null,
    loading: true,
    // 支付相关
    requirePayment: false,
    suggestedFee: 0,
    suggestedFeeYuan: '0.00',
    actualFee: '',
    actualFeeYuan: '',
    // 证件类型选项
    identityTypeOptions: [
      { value: 'mainland', label: '中国大陆身份证' },
      { value: 'hongkong', label: '香港身份证' },
      { value: 'taiwan', label: '台湾身份证' },
      { value: 'foreign', label: '其他证件' },
    ],
    identityTypeLabel: '',
    // 报名情况
    enrollmentInfo: null,
    isFull: false,
    remainingQuota: null,
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
    this.loadUserProfile();
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

      // 加载报名情况
      this.loadEnrollmentInfo(activityId);
    } catch (err) {
      wx.showToast({ title: '加载活动失败', icon: 'none' });
      this.setData({ loading: false });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  // 加载报名情况
  async loadEnrollmentInfo(activityId) {
    try {
      const info = await api.getEnrollmentInfo(activityId);
      this.setData({
        enrollmentInfo: info,
        isFull: info.is_full,
        remainingQuota: info.remaining_quota,
      });
    } catch (err) {
      console.log('获取报名情况失败:', err);
    }
  },

  // 加载用户资料
  async loadUserProfile() {
    try {
      const profile = await api.getUserProfile();
      // 获取证件类型显示文本
      const identityTypeLabel = this.getIdentityTypeLabel(profile.identity_type);

      this.setData({
        userInfo: profile,
        name: profile.name || '',
        phone: profile.phone || '',
        sex: profile.sex === 'M' ? '男' : profile.sex === 'F' ? '女' : '',
        age: profile.age ? String(profile.age) : '',
        occupation: profile.occupation || '',
        email: profile.email || '',
        industry: profile.industry || '',
        identityType: profile.identity_type || '',
        identityNumber: profile.identity_number || '',
        identityTypeLabel,
      });
    } catch (err) {
      // 用户未登录或获取资料失败，不填充
      console.log('获取用户资料失败:', err);
    }
  },

  // 获取证件类型显示文本
  getIdentityTypeLabel(type) {
    const options = this.data.identityTypeOptions;
    const found = options.find(o => o.value === type);
    return found ? found.label : '';
  },

  // 问卷输入处理
  onWhyJoinInput(e) {
    this.setData({ whyJoin: e.detail.value, error: null });
  },

  onChannelInput(e) {
    this.setData({ channel: e.detail.value, error: null });
  },

  onExpectationInput(e) {
    this.setData({ expectation: e.detail.value, error: null });
  },

  onUnderstandingInput(e) {
    this.setData({ activityUnderstanding: e.detail.value, error: null });
  },

  onQuestionsInput(e) {
    this.setData({ hasQuestions: e.detail.value, error: null });
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
    const { name, phone, whyJoin, channel, expectation, requirePayment, actualFee, suggestedFee } = this.data;

    if (!name || !name.trim()) {
      this.setData({ error: '请输入姓名' });
      return false;
    }
    if (!phone || !phone.trim()) {
      this.setData({ error: '请输入手机号' });
      return false;
    }
    // 问卷字段验证
    if (!whyJoin || !whyJoin.trim()) {
      this.setData({ error: '请填写参与原因' });
      return false;
    }
    if (!channel || !channel.trim()) {
      this.setData({ error: '请填写了解渠道' });
      return false;
    }
    if (!expectation || !expectation.trim()) {
      this.setData({ error: '请填写学习期望' });
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

  // 构建报名数据
  buildParticipantData() {
    const {
      activity, name, phone, identityNumber, identityType,
      sex, age, occupation, email, industry,
      whyJoin, channel, expectation, activityUnderstanding, hasQuestions,
      userInfo
    } = this.data;

    // 转换性别格式（显示为男/女，提交为 M/F）
    let sexCode = '';
    if (sex === '男') sexCode = 'M';
    else if (sex === '女') sexCode = 'F';

    return {
      activity_id: activity.id,
      participant_name: name.trim(),
      phone: phone.trim(),
      identity_number: identityNumber || undefined,
      identity_type: identityType || undefined,
      // 用户信息
      sex: sexCode || undefined,
      age: age ? parseInt(age) : undefined,
      occupation: occupation || undefined,
      email: email || undefined,
      industry: industry || undefined,
      user_id: userInfo ? userInfo.id : undefined,
      // 问卷
      why_join: whyJoin.trim(),
      channel: channel.trim(),
      expectation: expectation.trim(),
      activity_understanding: activityUnderstanding.trim() || undefined,
      has_questions: hasQuestions.trim() || undefined,
    };
  },

  // 普通报名（无需支付）
  doRegister() {
    const participantData = this.buildParticipantData();

    api
      .registerParticipant(participantData)
      .then((result) => {
        // 检查是否进入候补
        const isWaitlist = result.enroll_status === 2;
        if (isWaitlist) {
          wx.showToast({ title: '已进入候补', icon: 'none' });
        } else {
          wx.showToast({ title: '报名成功', icon: 'success' });
        }
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
    const { activity, actualFee } = this.data;
    const participantData = this.buildParticipantData();

    // 1. 创建支付订单
    api
      .createPaymentOrder({
        ...participantData,
        actual_fee: actualFee,
      })
      .then((orderData) => {
        // 检查是否进入候补（候补不需要支付）
        if (orderData.enroll_status === 2) {
          wx.showToast({ title: '已进入候补', icon: 'none' });
          setTimeout(() => {
            wx.navigateBack();
          }, 1200);
          return;
        }

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
        if (orderData) {
          wx.showToast({ title: '支付成功', icon: 'success' });
          setTimeout(() => {
            wx.navigateBack();
          }, 1200);
        }
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

    const { requirePayment, isFull } = this.data;

    // 如果已满员，候补不需要支付
    if (isFull) {
      this.doRegister();
    } else if (requirePayment) {
      // 需要支付
      this.doPaymentRegister();
    } else {
      // 无需支付，直接报名
      this.doRegister();
    }
  },
});