/**
 * API 封装 - 与后端 backend /api/v1 对接
 * 配置统一在 config/index.js 中管理，修改IP只需改一处
 */
const config = require('../config/index');
const tenant = require('./tenant');
const auth = require('./auth');
const { normalizeApiErrorMessage } = require('./request-error');
const { encryptWithPublicKey } = require('./rsa');
const baseUrl = config.baseUrl;
const staticBaseUrl = config.staticBaseUrl;
let cachedSensitiveBundle = null;

function getTenantCode() {
  return tenant.getTenantCode();
}

function getToken() {
  return wx.getStorageSync('access_token') || '';
}

/**
 * 获取完整的图片URL
 * 处理后端返回的相对路径或完整URL
 * @param {string} url - 图片URL（可能是相对路径或完整URL）
 * @returns {string} 完整的可访问URL
 */
function getImageUrl(url) {
  if (!url) return '';
  // 已经是完整URL，直接返回
  if (url.startsWith('http://') || url.startsWith('https://')) {
    if (url.startsWith('http://localhost:') || url.startsWith('https://localhost:') || url.startsWith('http://127.0.0.1:') || url.startsWith('https://127.0.0.1:')) {
      try {
        const pathStart = url.indexOf('/uploads/');
        if (pathStart >= 0) {
          return staticBaseUrl + url.substring(pathStart);
        }
      } catch (e) {
        return url;
      }
    }
    return url;
  }
  // 相对路径，拼接静态资源基础URL
  return staticBaseUrl + (url.startsWith('/') ? url : '/' + url);
}

function getHeader(useAuth = false) {
  const header = { 'Content-Type': 'application/json' };
  if (useAuth) {
    const token = getToken();
    if (token) header['Authorization'] = 'Bearer ' + token;
  }
  return header;
}

function requestWithBody({ url, method, useAuth = false, data }) {
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      header: getHeader(useAuth),
      data,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }
        reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

function withTenant(url) {
  const joiner = url.includes('?') ? '&' : '?';
  return `${url}${joiner}tenant_code=${encodeURIComponent(getTenantCode())}`;
}

function resolveAsUserViewFlag(asUserView) {
  if (asUserView === true) return 1;
  if (asUserView === false) return 0;
  return auth.isAdmin() ? 0 : 1;
}

function getSensitiveRsaPublicKey() {
  if (cachedSensitiveBundle && cachedSensitiveBundle.public_key && cachedSensitiveBundle.kid) {
    return Promise.resolve(cachedSensitiveBundle);
  }
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/users/security/rsa-public-key`,
      method: 'GET',
      header: getHeader(),
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.public_key) {
          cachedSensitiveBundle = {
            kid: String(res.data.kid || 'v1'),
            public_key: res.data.public_key,
          };
          resolve(cachedSensitiveBundle);
          return;
        }
        reject(new ApiError(res.statusCode, res.data?.detail || '获取加密公钥失败'));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 是否非加密连接（用于登录页安全提示） */
function isUnsafeBaseUrl() {
  try {
    const u = baseUrl;
    if (!u.startsWith('http://')) return false;
    if (u.includes('localhost') || u.includes('127.0.0.1')) return false;
    return true;
  } catch (_) {
    return false;
  }
}

/** 活动列表：可传 status 筛选，不传则全部 */
function getActivities(opts = {}) {
  const { skip = 0, limit = 100, status, asUserView } = opts;
  const asUserViewFlag = resolveAsUserViewFlag(asUserView);
  let url = withTenant(`${baseUrl}/activities?skip=${skip}&limit=${limit}&as_user_view=${asUserViewFlag}`);
  if (status != null) url += `&status=${status}`;
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'GET',
      header: getHeader(true),
      success: (res) => {
        if (res.statusCode === 200) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 可报名活动：未开始(1) + 进行中(2) */
function getEnrollableActivities() {
  return getActivities({}).then((data) => {
    const items = (data.items || []).filter((a) => a.status === 1 || a.status === 2);
    return { items, total: items.length };
  });
}

/** 未开始活动（接口） */
function getUnstartedActivities() {
  const asUserViewFlag = resolveAsUserViewFlag(undefined);
  return new Promise((resolve, reject) => {
    wx.request({
      url: withTenant(`${baseUrl}/activities/unstarted/?as_user_view=${asUserViewFlag}`),
      method: 'GET',
      header: getHeader(true),
      success: (res) => {
        if (res.statusCode === 200) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 管理员登录（统一密码登录） */
function adminLogin(username, password) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/auth/login`,
      method: 'POST',
      header: getHeader(),
      data: { identifier: username, password, tenant_code: getTenantCode() },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 普通用户登录（统一密码登录） */
function userLogin(phone, password) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/auth/login`,
      method: 'POST',
      header: getHeader(),
      data: { identifier: phone, password, tenant_code: getTenantCode() },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 用户注册 */
function registerUser({ name, phone, password, email }) {
  const data = { name, phone, password, tenant_code: getTenantCode() };
  if (email) data.email = email;
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/users/register`,
      method: 'POST',
      header: getHeader(),
      data,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 获取当前用户信息（需 user token） */
function getUserProfile() {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/users/me`,
      method: 'GET',
      header: getHeader(true),
      success: (res) => {
        if (res.statusCode === 200) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 更新当前用户头像 */
function updateUserAvatar(avatarUrl) {
  const url = `${baseUrl}/users/avatar`;
  const payload = { avatar_url: avatarUrl };
  return requestWithBody({
    url,
    method: 'PUT',
    useAuth: true,
    data: payload,
  }).catch((err) => {
    if (!err || err.statusCode !== 405) {
      throw err;
    }
    return requestWithBody({
      url,
      method: 'POST',
      useAuth: true,
      data: payload,
    });
  });
}

/** 活动报名 */
function registerParticipant(data) {
  // 过滤掉 undefined 的字段
  const filteredData = {};
  for (const key in data) {
    if (data[key] !== undefined) {
      filteredData[key] = data[key];
    }
  }
  return getSensitiveRsaPublicKey().then((bundle) => {
    const payload = { ...filteredData };
    if (payload.phone) {
      payload.phone_encrypted = encryptWithPublicKey(payload.phone, bundle.public_key);
      delete payload.phone;
    }
    if (payload.identity_number) {
      payload.identity_number_encrypted = encryptWithPublicKey(payload.identity_number, bundle.public_key);
      delete payload.identity_number;
    }
    payload.encryption_kid = bundle.kid;
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${baseUrl}/participants/`,
        method: 'POST',
        header: getHeader(true),
        data: payload,
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
          else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
        },
        fail: (err) => reject(err),
      });
    });
  });
}

/** 获取当前登录用户实时权限快照 */
function getAuthSnapshot() {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/auth/me`,
      method: 'GET',
      header: getHeader(true),
      success: (res) => {
        if (res.statusCode === 200) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 创建活动（需管理员 token） */
function createActivity({
  activity_name,
  tag,
  start_time,
  end_time,
  participants,
  activity_type_id,
  activity_type_name,
  suggested_fee,
  require_payment,
  poster_url,
  location,
  max_participants,
  is_public,
}) {
  const data = {
    activity_name,
    tag: tag || '',
    start_time: typeof start_time === 'string' ? start_time : (start_time && start_time.toISOString ? start_time.toISOString() : start_time),
    participants: participants || [],
    suggested_fee: suggested_fee || 0,
    require_payment: require_payment || 0,
    is_public: is_public === 1 ? 1 : 0,
  };
  if (end_time) {
    data.end_time = typeof end_time === 'string' ? end_time : (end_time && end_time.toISOString ? end_time.toISOString() : end_time);
  }
  if (activity_type_id != null && activity_type_id !== '') {
    data.activity_type_id = activity_type_id;
  }
  if (activity_type_name != null && String(activity_type_name).trim()) {
    data.activity_type_name = String(activity_type_name).trim();
  }
  if (poster_url) {
    data.poster_url = poster_url;
  }
  if (location !== undefined) {
    data.location = location || null;
  }
  if (max_participants != null && max_participants > 0) {
    data.max_participants = max_participants;
  }
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/activities/`,
      method: 'POST',
      header: getHeader(true),
      data,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 微信授权登录：传入 wx.login() 得到的 code */
function wechatLogin(code) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/auth/wechat`,
      method: 'POST',
      header: getHeader(),
      data: { code: code || '', tenant_code: getTenantCode(), mode: 'openid' },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

function ApiError(code, message) {
  this.statusCode = code;
  this.message = normalizeApiErrorMessage(code, message);
}
ApiError.prototype.toString = function () {
  return 'ApiError(' + this.statusCode + '): ' + this.message;
};

/** 获取活动详情 */
function getActivity(activityId) {
  const asUserViewFlag = resolveAsUserViewFlag(undefined);
  return new Promise((resolve, reject) => {
    wx.request({
      url: withTenant(`${baseUrl}/activities/${activityId}?as_user_view=${asUserViewFlag}`),
      method: 'GET',
      header: getHeader(true),
      success: (res) => {
        if (res.statusCode === 200) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 获取当前用户对活动的权限 */
function getActivityPermissions(activityId) {
  const asUserViewFlag = resolveAsUserViewFlag(undefined);
  return new Promise((resolve, reject) => {
    wx.request({
      url: withTenant(`${baseUrl}/activities/${activityId}/my-permissions?as_user_view=${asUserViewFlag}`),
      method: 'GET',
      header: getHeader(true),
      success: (res) => {
        if (res.statusCode === 200) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 获取活动报名情况（剩余名额等） */
function getEnrollmentInfo(activityId) {
  const asUserViewFlag = resolveAsUserViewFlag(undefined);
  return new Promise((resolve, reject) => {
    wx.request({
      url: withTenant(`${baseUrl}/activities/${activityId}/enrollment-info?as_user_view=${asUserViewFlag}`),
      method: 'GET',
      header: getHeader(true),
      success: (res) => {
        if (res.statusCode === 200) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 获取当前管理员可用于发布活动的活动类型 */
function getAvailableActivityTypes() {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/activity-types/available`,
      method: 'GET',
      header: getHeader(true),
      success: (res) => {
        if (res.statusCode === 200) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 获取当前用户报名过的活动 */
function getMyParticipantActivities(activityId) {
  let url = `${baseUrl}/participants/me/activities`;
  if (activityId != null) {
    url += `?activity_id=${encodeURIComponent(activityId)}`;
  }
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'GET',
      header: getHeader(true),
      success: (res) => {
        if (res.statusCode === 200) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 获取活动社区文章列表 */
function getCommunityPosts(activityId, opts = {}) {
  const { skip = 0, limit = 20 } = opts;
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/community/posts?activity_id=${encodeURIComponent(activityId)}&skip=${skip}&limit=${limit}`,
      method: 'GET',
      header: getHeader(true),
      success: (res) => {
        if (res.statusCode === 200) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 获取社区文章详情 */
function getCommunityPostDetail(postId) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/community/posts/${postId}`,
      method: 'GET',
      header: getHeader(true),
      success: (res) => {
        if (res.statusCode === 200) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 创建社区文章 */
function createCommunityPost(data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/community/posts`,
      method: 'POST',
      header: getHeader(true),
      data,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 获取文章评论列表 */
function getCommunityComments(postId, opts = {}) {
  const { skip = 0, limit = 50 } = opts;
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/community/posts/${postId}/comments?skip=${skip}&limit=${limit}`,
      method: 'GET',
      header: getHeader(true),
      success: (res) => {
        if (res.statusCode === 200) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 发表评论 */
function createCommunityComment(postId, content) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/community/posts/${postId}/comments`,
      method: 'POST',
      header: getHeader(true),
      data: { content },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 更新活动信息 */
function updateActivity(activityId, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/activities/${activityId}`,
      method: 'PUT',
      header: getHeader(true),
      data,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 删除活动 */
function deleteActivity(activityId) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/activities/${activityId}`,
      method: 'DELETE',
      header: getHeader(true),
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 获取活动报名人员列表 */
function getActivityParticipants(activityId, skip = 0, limit = 10) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/participants/${activityId}/?skip=${skip}&limit=${limit}`,
      method: 'GET',
      header: getHeader(true),
      success: (res) => {
        if (res.statusCode === 200) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 更新活动状态（需管理员权限） */
function updateActivityStatus(activityId, status) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/activities/${activityId}/status?status=${status}`,
      method: 'PUT',
      header: getHeader(true),
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 获取活动签到记录（需管理员权限） */
function getActivityCheckins(activityId, skip = 0, limit = 100) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/activities/${activityId}/checkins/?skip=${skip}&limit=${limit}`,
      method: 'GET',
      header: getHeader(true),
      success: (res) => {
        if (res.statusCode === 200) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 获取活动报名统计（需管理员权限） */
function getActivityStatistics(activityId) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/activities/${activityId}/statistics/`,
      method: 'GET',
      header: getHeader(true),
      success: (res) => {
        if (res.statusCode === 200) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 获取用户详情（需管理员权限） */
function getUserDetail(userId) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/users/${userId}`,
      method: 'GET',
      header: getHeader(true),
      success: (res) => {
        if (res.statusCode === 200) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 绑定用户信息 */
function bindUserInfo(bindInfo) {
  return getSensitiveRsaPublicKey()
    .then((bundle) => {
      const payload = { ...bindInfo };
      if (payload.phone) {
        payload.phone_encrypted = encryptWithPublicKey(payload.phone, bundle.public_key);
        delete payload.phone;
      }
      if (payload.identity_number) {
        payload.identity_number_encrypted = encryptWithPublicKey(payload.identity_number, bundle.public_key);
        delete payload.identity_number;
      }
      payload.encryption_kid = bundle.kid;
      return new Promise((resolve, reject) => {
        wx.request({
          url: `${baseUrl}/users/bind-info`,
          method: 'PUT',
          header: getHeader(true),
          data: payload,
          success: (res) => {
            if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
            else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
          },
          fail: (err) => reject(err),
        });
      });
    })
    .catch((err) => {
      return Promise.reject(err);
    });
}

/** 绑定用户信息（静默实名认证：后端同时验证姓名+证件号是否匹配微信实名） */
function bindUserInfoWithRealname(bindInfo) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/users/bind-info`,
      method: 'PUT',
      header: getHeader(true),
      data: bindInfo,
      extra: { realname_verify: true },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 检查绑定状态 */
function checkBindStatus() {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/users/check-bind-status`,
      method: 'GET',
      header: getHeader(true),
      success: (res) => {
        if (res.statusCode === 200) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 手机号授权登录：传入 getPhoneNumber 返回的 code 和 wx.login 返回的 login_code */
function phoneLogin(code, loginCode) {
  const data = { code: code || '', tenant_code: getTenantCode(), mode: 'phone' };
  if (loginCode) data.login_code = loginCode;
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/auth/wechat`,
      method: 'POST',
      header: getHeader(),
      data,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 获取所有用户列表（超级管理员专用） */
function getAllUsersForAdmin(opts = {}) {
  const { tenantCode: queryTenantCode = getTenantCode(), skip = 0, limit = 20, keyword } = opts;
  let url = `${baseUrl}/users/admin/all?tenant_code=${encodeURIComponent(queryTenantCode)}&skip=${skip}&limit=${limit}`;
  if (keyword) url += `&keyword=${encodeURIComponent(keyword)}`;
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'GET',
      header: getHeader(true),
      success: (res) => {
        if (res.statusCode === 200) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 创建支付订单 */
function createPaymentOrder(payload) {
  const data = {};
  Object.keys(payload || {}).forEach((key) => {
    if (payload[key] !== undefined) {
      data[key] = payload[key];
    }
  });
  return getSensitiveRsaPublicKey().then((bundle) => {
    const requestPayload = { ...data };
    if (requestPayload.phone) {
      requestPayload.phone_encrypted = encryptWithPublicKey(requestPayload.phone, bundle.public_key);
      delete requestPayload.phone;
    }
    if (requestPayload.identity_number) {
      requestPayload.identity_number_encrypted = encryptWithPublicKey(requestPayload.identity_number, bundle.public_key);
      delete requestPayload.identity_number;
    }
    requestPayload.encryption_kid = bundle.kid;
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${baseUrl}/payments/create`,
        method: 'POST',
        header: getHeader(true),
        data: requestPayload,
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
          else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
        },
        fail: (err) => reject(err),
      });
    });
  });
}

/** 查询支付订单状态 */
function queryPaymentOrder(orderNo) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/payments/order/${encodeURIComponent(orderNo)}`,
      method: 'GET',
      header: getHeader(true),
      success: (res) => {
        if (res.statusCode === 200) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 上传活动海报 */
function uploadPoster(filePath) {
  return new Promise((resolve, reject) => {
    const token = getToken();
    if (!token) {
      reject(new ApiError(401, '请先登录'));
      return;
    }
    wx.uploadFile({
      url: `${baseUrl}/uploads/poster`,
      filePath: filePath,
      name: 'file',
      header: {
        'Authorization': `Bearer ${token}`,
      },
      success: (res) => {
        let data = null;
        if (typeof res.data === 'string') {
          try {
            data = JSON.parse(res.data);
          } catch (e) {
            reject(new ApiError(res.statusCode, '服务器返回格式异常'));
            return;
          }
        } else {
          data = res.data;
        }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new ApiError(res.statusCode, data?.detail || data?.message || '上传失败'));
        }
      },
      fail: (err) => reject(err),
    });
  });
}

/** 上传用户头像 */
function uploadAvatar(filePath) {
  return new Promise((resolve, reject) => {
    const token = getToken();
    if (!token) {
      reject(new ApiError(401, '请先登录'));
      return;
    }
    wx.uploadFile({
      url: `${baseUrl}/uploads/avatar`,
      filePath,
      name: 'file',
      header: {
        'Authorization': `Bearer ${token}`,
      },
      success: (res) => {
        let data = null;
        if (typeof res.data === 'string') {
          try {
            data = JSON.parse(res.data);
          } catch (e) {
            reject(new ApiError(res.statusCode, '服务器返回格式异常'));
            return;
          }
        } else {
          data = res.data;
        }

        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new ApiError(res.statusCode, data?.detail || data?.message || '上传失败'));
        }
      },
      fail: (err) => reject(err),
    });
  });
}

/** 拉黑用户 */
function blockUser(userId, reason) {
  const data = reason ? { reason } : {};
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/users/${userId}/block`,
      method: 'POST',
      header: getHeader(true),
      data,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 解除拉黑用户 */
function unblockUser(userId) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/users/${userId}/unblock`,
      method: 'POST',
      header: getHeader(true),
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 微信实名校验：传入授权 code + 姓名 + 证件号，后端调用官方接口核验 */
function verifyRealname(payload) {
  return getSensitiveRsaPublicKey().then((bundle) => {
    const requestPayload = { ...payload };
    if (requestPayload.cred_id) {
      requestPayload.cred_id_encrypted = encryptWithPublicKey(requestPayload.cred_id, bundle.public_key);
      delete requestPayload.cred_id;
    }
    requestPayload.encryption_kid = bundle.kid;
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${baseUrl}/realname-auth/verify`,
        method: 'POST',
        header: getHeader(true),
        data: requestPayload,
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
          else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
        },
        fail: (err) => reject(err),
      });
    });
  });
}

module.exports = {
  baseUrl,
  staticBaseUrl,
  getTenantCode,
  getToken,
  getImageUrl,
  isUnsafeBaseUrl,
  getActivities,
  getAvailableActivityTypes,
  getEnrollableActivities,
  getUnstartedActivities,
  adminLogin,
  userLogin,
  getAuthSnapshot,
  registerUser,
  getUserProfile,
  updateUserAvatar,
  registerParticipant,
  createActivity,
  wechatLogin,
  phoneLogin,
  getActivity,
  getActivityPermissions,
  getEnrollmentInfo,
  getMyParticipantActivities,
  getCommunityPosts,
  getCommunityPostDetail,
  createCommunityPost,
  getCommunityComments,
  createCommunityComment,
  updateActivity,
  deleteActivity,
  getActivityParticipants,
  updateActivityStatus,
  getActivityCheckins,
  getActivityStatistics,
  getUserDetail,
  bindUserInfo,
  bindUserInfoWithRealname,
  checkBindStatus,
  getAllUsersForAdmin,
  createPaymentOrder,
  queryPaymentOrder,
  uploadPoster,
  uploadAvatar,
  blockUser,
  unblockUser,
  verifyRealname,
  ApiError,
};
