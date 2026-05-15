const api = require("../../utils/api");
const auth = require("../../utils/auth");
const image = require('../../utils/image');
const tenant = require("../../utils/tenant");
const {
  buildPendingOrderStorageKey,
  buildOrderHistoryStorageKey,
  upsertOrderRecord,
} = require('../../utils/payment-order');

Page({
  data: {
    activityId: null,
    activity: null,
    // 用户信息（从用户资料获取，不可编辑）
    userInfo: null,
    name: '',
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
    tenant.applyPageOptions(options);
    const activityId = options.id;
    if (!activityId) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    // 未登录直接跳转登录页，不继续加载
    if (!auth.isLoggedIn()) {
      const redirectUrl = tenant.appendTenantToUrl('/pages/register/register', { id: activityId });
      wx.showToast({ title: '请先登录后再报名', icon: 'none' });
      setTimeout(() => {
        wx.navigateTo({
          url: tenant.appendTenantToUrl('/pages/login/login', { redirect: redirectUrl }),
        });
      }, 300);
      return;
    }

    if (auth.isSuperAdmin()) {
      wx.showToast({ title: '超级管理员账号不能直接报名', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1200);
      return;
    }

    // 恢复未完成的支付订单号（应对用户关闭小程序再重开的场景）
    try {
      const stored = wx.getStorageSync(buildPendingOrderStorageKey(
        tenant.getTenantCode(),
        auth.getUserId()
      ));
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
    const redirectUrl = tenant.appendTenantToUrl('/pages/register/register', { id: activityId });
    wx.showToast({ title: '请先登录后再报名', icon: 'none' });
    setTimeout(() => {
      wx.navigateTo({
        url: tenant.appendTenantToUrl('/pages/login/login', { redirect: redirectUrl }),
      });
    }, 300);
    return false;
  },

  // 加载活动详情
  async loadActivity(activityId) {
    const activity = await api.getActivity(activityId);
    const posterUrl = await image.resolveDisplayUrl(activity.poster_url);

    // 检查是否需要支付
    const requirePayment = activity.require_payment === 1;
    const suggestedFee = activity.suggested_fee || 0;
    const suggestedFeeYuan = (suggestedFee / 100).toFixed(2);

    this.setData({
      activity: {
        ...activity,
        poster_url: posterUrl,
      },
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
    } catch (_) {
      this.setData({
        enrollmentInfo: null,
      });
    }
  },

  // 加载用户资料
  async loadUserProfile() {
    const profile = await api.getUserProfile();

    this.setData({
      userInfo: profile,
      name: profile.name || '',
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
        wx.redirectTo({ url: tenant.appendTenantToUrl('/pages/bind-user-info/bind-user-info') });
      }, 500);
      const stopError = new Error('require_bind_info');
      stopError.stopFlow = true;
      throw stopError;
    }

    this.setData({ requireBindInfo: false });
    await this.loadUserProfile();
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
      activity, name,
      whyJoin, channel, expectation, activityUnderstanding, hasQuestions
    } = this.data;

    return {
      activity_id: activity.id,
      participant_name: name.trim(),
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
    const { activityId, activity, actualFee } = this.data;
    const tenantCode = tenant.getTenantCode();
    const userId = auth.getUserId();
    try {
      if (orderNo) {
        const payload = {
          activityId,
          activityName: activity ? activity.activity_name : '',
          actualFee: actualFee || 0,
          orderNo,
          createTime: new Date().toISOString(),
          updateTime: new Date().toISOString(),
        };
        wx.setStorageSync(buildPendingOrderStorageKey(tenantCode, userId), payload);
        this._upsertOrderHistory({
          order_no: orderNo,
          activity_id: activityId,
          activity_name: payload.activityName,
          actual_fee: payload.actualFee,
          status: 0,
          create_time: payload.createTime,
          update_time: payload.updateTime,
        });
      } else {
        wx.removeStorageSync(buildPendingOrderStorageKey(tenantCode, userId));
      }
    } catch (_) {
      // Storage 操作失败不影响主流程
    }
  },

  _upsertOrderHistory(record) {
    const historyKey = buildOrderHistoryStorageKey(tenant.getTenantCode(), auth.getUserId());
    try {
      const current = wx.getStorageSync(historyKey) || [];
      const next = upsertOrderRecord(current, record);
      wx.setStorageSync(historyKey, next);
    } catch (_) {
      // 本地订单历史仅作为用户侧展示，不阻断主流程
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
        if (!orderNo) {
          throw new Error('支付订单创建异常，请重新发起支付');
        }
        this.setData({ paymentOrderNo: orderNo });
        // 持久化订单号，防止用户关闭小程序后丢失
        this._persistPendingOrder(orderNo);

        // 2. 获取支付参数
        const paymentParams = orderData.payment_params;
        if (
          !paymentParams ||
          !paymentParams.timeStamp ||
          !paymentParams.nonceStr ||
          !paymentParams.package ||
          !paymentParams.paySign
        ) {
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
            success: () => resolve(orderNo),
            fail: (err) => reject(err),
          });
        });
      })
      .then((orderNo) => {
        return this.confirmPaymentResult(orderNo);
      })
      .then((orderDetail) => {
        const successOrderNo = orderDetail && orderDetail.order_no
          ? orderDetail.order_no
          : this.data.paymentOrderNo;
        const message = orderDetail && orderDetail.participant_enroll_status === 2
          ? '支付成功，已进入候补'
          : '报名成功';
        // 支付成功，清除持久化的订单号
        this._persistPendingOrder('');
        this._upsertOrderHistory({
          order_no: successOrderNo,
          activity_id: this.data.activityId,
          activity_name: this.data.activity ? this.data.activity.activity_name : '',
          actual_fee: this.data.actualFee || 0,
          status: 1,
          update_time: orderDetail && orderDetail.update_time ? orderDetail.update_time : new Date().toISOString(),
        });
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
        if (paymentOrderNo) {
          this._upsertOrderHistory({
            order_no: paymentOrderNo,
            activity_id: this.data.activityId,
            activity_name: this.data.activity ? this.data.activity.activity_name : '',
            actual_fee: this.data.actualFee || 0,
            status: err && err.errMsg && err.errMsg.includes('cancel') ? 0 : 2,
            update_time: new Date().toISOString(),
          });
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
    if (auth.isSuperAdmin()) {
      wx.showToast({ title: '超级管理员账号不能直接报名', icon: 'none' });
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
