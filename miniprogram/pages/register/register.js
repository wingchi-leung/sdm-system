const api = require("../../utils/api");
const auth = require("../../utils/auth");

const PENDING_ORDER_KEY = 'pending_payment_order'; // Storage key for pending payment

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
    paymentOrderNo: '',
    // 基本信息折叠状态
    basicInfoExpanded: false,
    requireBindInfo: false,
    recoverPendingPayment: false,
  },

  /** 切换基本信息折叠状态 */
  toggleBasicInfo() {
    this.setData({ basicInfoExpanded: !this.data.basicInfoExpanded });
  },

  onLoad(options) {
    const activityId = options.id;
    if (!activityId) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    // 未登录直接跳转登录页，不继续加载
    if (!auth.isLoggedIn()) {
      const redirectUrl = `/pages/register/register?id=${activityId}`;
      wx.showToast({ title: '请先登录后再报名', icon: 'none' });
      setTimeout(() => {
        wx.navigateTo({
          url: `/pages/login/login?redirect=${encodeURIComponent(redirectUrl)}`,
        });
      }, 300);
      return;
    }

    if (auth.isAdmin()) {
      wx.showToast({ title: '管理员账号不能直接报名，请使用用户身份登录', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1200);
      return;
    }

    // 恢复未完成的支付订单号（应对用户关闭小程序再重开的场景）
    try {
      const stored = wx.getStorageSync(PENDING_ORDER_KEY);
      if (stored && stored.activityId === activityId && stored.orderNo) {
        this.setData({
          paymentOrderNo: stored.orderNo,
          recoverPendingPayment: true,
        });
      }
    } catch (_) {
      // Storage 读取失败不影响主流程
    }

    this.setData({ activityId, loading: true, error: null });
    this.initPage(activityId);
  },

  async initPage(activityId) {
    try {
      await Promise.all([
        this.loadActivity(activityId),
        this.ensureProfileBound(),
      ]);
    } catch (err) {
      if (err && err.stopFlow) {
        return;
      }
      const message = err && err.message ? err.message : '页面初始化失败';
      this.setData({ error: message });
      wx.showToast({ title: message, icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    } finally {
      this.setData({ loading: false });
    }
  },

  ensureLoggedIn(activityId) {
    if (auth.isLoggedIn()) {
      return true;
    }
    const redirectUrl = `/pages/register/register?id=${activityId}`;
    wx.showToast({ title: '请先登录后再报名', icon: 'none' });
    setTimeout(() => {
      wx.navigateTo({
        url: `/pages/login/login?redirect=${encodeURIComponent(redirectUrl)}`,
      });
    }, 300);
    return false;
  },

  // 加载活动详情
  async loadActivity(activityId) {
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
    });

    this.loadEnrollmentInfo(activityId);
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
    const profile = await api.getUserProfile();
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
  },

  async ensureProfileBound() {
    const bindStatus = await api.checkBindStatus();
    if (bindStatus && bindStatus.require_bind_info) {
      this.setData({
        requireBindInfo: true,
        error: '请先完善个人资料后再报名',
      });
      wx.showToast({ title: '请先完善个人资料', icon: 'none' });
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/bind-user-info/bind-user-info' });
      }, 500);
      const stopError = new Error('require_bind_info');
      stopError.stopFlow = true;
      throw stopError;
    }

    this.setData({ requireBindInfo: false });
    await this.loadUserProfile();
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
    const {
      name,
      phone,
      whyJoin,
      channel,
      expectation,
      requirePayment,
      actualFee,
      suggestedFee,
      loading,
      requireBindInfo,
    } = this.data;

    // 用户资料还在加载中
    if (loading) {
      this.setData({ error: '页面加载中，请稍候再试' });
      return false;
    }
    if (requireBindInfo) {
      this.setData({ error: '请先完善个人资料后再报名' });
      return false;
    }
    if (!name || !name.trim()) {
      this.setData({ error: '用户信息未完善，请先完善个人资料' });
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
    if (requirePayment && !this.data.isFull) {
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

  /**
   * 将待支付订单号持久化到 Storage，供小程序关闭后恢复
   * @param {string} orderNo - 订单号，传空字符串表示清除
   */
  _persistPendingOrder(orderNo) {
    const { activityId } = this.data;
    try {
      if (orderNo) {
        wx.setStorageSync(PENDING_ORDER_KEY, { activityId, orderNo });
      } else {
        wx.removeStorageSync(PENDING_ORDER_KEY);
      }
    } catch (_) {
      // Storage 操作失败不影响主流程
    }
  },

  // 支付报名
  doPaymentRegister() {
    const { actualFee } = this.data;
    const participantData = this.buildParticipantData();

    // 1. 创建支付订单
    api
      .createPaymentOrder({
        ...participantData,
        actual_fee: actualFee,
      })
      .then((orderData) => {
        const orderNo = orderData.order_no || '';
        this.setData({ paymentOrderNo: orderNo });
        // 持久化订单号，防止用户关闭小程序后丢失
        this._persistPendingOrder(orderNo);

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
            success: () => resolve(orderData.order_no),
            fail: (err) => reject(err),
          });
        });
      })
      .then((orderNo) => {
        return this.confirmPaymentResult(orderNo);
      })
      .then((orderDetail) => {
        const message = orderDetail && orderDetail.participant_enroll_status === 2
          ? '支付成功，已进入候补'
          : '报名成功';
        // 支付成功，清除持久化的订单号
        this._persistPendingOrder('');
        this.setData({
          paymentOrderNo: '',
          submitting: false,
          recoverPendingPayment: false,
        });
        wx.showToast({ title: message, icon: 'success' });
        setTimeout(() => {
          wx.navigateBack();
        }, 1200);
      })
      .catch((err) => {
        // 处理错误
        let msg = '支付失败';
        const { paymentOrderNo } = this.data;
        if (err && err.errMsg && err.errMsg.includes('cancel')) {
          msg = '已取消支付';
        } else if (err && err.code === 'PAYMENT_CONFIRM_TIMEOUT') {
          msg = '支付已受理，报名确认中。可点击"继续支付"恢复当前订单';
          this.setData({ recoverPendingPayment: true });
        } else if (err && err.message) {
          msg = err.message;
        } else if (err && err.errMsg) {
          msg = err.errMsg;
        }
        if (paymentOrderNo && !msg.includes('订单号')) {
          msg = `${msg}（订单号：${paymentOrderNo}）`;
        }
        this.setData({ error: msg, submitting: false });
      });
  },

  confirmPaymentResult(orderNo, attempt = 0) {
    const maxAttempts = 8;
    if (!orderNo) {
      return Promise.reject(new Error('缺少订单号，无法确认支付结果'));
    }

    return api.queryPaymentOrder(orderNo)
      .then((orderDetail) => {
        if (orderDetail.status === 1) {
          return orderDetail;
        }
        if (orderDetail.status === 2) {
          throw new Error('支付失败，请重新发起支付');
        }
        if (orderDetail.status === 3) {
          throw new Error('订单已关闭，请重新报名');
        }
        if (attempt >= maxAttempts) {
          const timeoutError = new Error('支付结果确认超时');
          timeoutError.code = 'PAYMENT_CONFIRM_TIMEOUT';
          throw timeoutError;
        }
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            this.confirmPaymentResult(orderNo, attempt + 1)
              .then(resolve)
              .catch(reject);
          }, 1500);
        });
      });
  },

  submit() {
    // 防抖：如果正在提交，直接返回
    if (this.data.submitting) {
      return;
    }

    if (!auth.isLoggedIn()) {
      wx.showToast({ title: '请先登录后再报名', icon: 'none' });
      return;
    }

    if (!this.validateForm()) {
      // 滚动到错误提示，让用户看到原因
      wx.pageScrollTo({ selector: '.error-box', duration: 300 });
      return;
    }

    const nextState = {
      submitting: true,
      error: null,
    };
    if (!this.data.recoverPendingPayment) {
      nextState.paymentOrderNo = '';
    }
    this.setData(nextState);

    const { requirePayment } = this.data;

    // 付费活动未满员时走支付；满员时直接提交候补，候补转正时再处理费用
    if (requirePayment && !this.data.isFull) {
      this.doPaymentRegister();
    } else {
      this.doRegister();
    }
  },
});
