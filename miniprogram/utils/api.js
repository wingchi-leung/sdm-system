/**
 * API 封装 - 与后端 backend /api/v1 对接
 * 真机/体验版请修改 baseUrl 为实际服务器地址（需在小程序后台配置 request 合法域名）
 */
const baseUrl = 'http://172.20.10.6:8000/api/v1';

function getToken() {
  return wx.getStorageSync('access_token') || '';
}

function getHeader(useAuth = false) {
  const header = { 'Content-Type': 'application/json' };
  if (useAuth) {
    const token = getToken();
    if (token) header['Authorization'] = 'Bearer ' + token;
  }
  return header;
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
  const { skip = 0, limit = 100, status } = opts;
  let url = `${baseUrl}/activities?skip=${skip}&limit=${limit}`;
  if (status != null) url += `&status=${status}`;
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'GET',
      header: getHeader(),
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
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/activities/unstarted/`,
      method: 'GET',
      header: getHeader(),
      success: (res) => {
        if (res.statusCode === 200) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 管理员登录 */
function adminLogin(username, password) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/auth/login`,
      method: 'POST',
      header: getHeader(),
      data: { username, password },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else reject(new ApiError(res.statusCode, res.data?.detail || res.data));
      },
      fail: (err) => reject(err),
    });
  });
}

/** 普通用户登录 */
function userLogin(phone, password) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/auth/user-login`,
      method: 'POST',
      header: getHeader(),
      data: { phone, password },
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
  const data = { name, phone, password };
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

/** 活动报名 */
function registerParticipant({ activity_id, participant_name, phone, identity_number }) {
  const data = { activity_id, participant_name, phone };
  if (identity_number) data.identity_number = identity_number;
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/participants/`,
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
}) {
  const data = {
    activity_name,
    tag: tag || '',
    start_time: typeof start_time === 'string' ? start_time : (start_time && start_time.toISOString ? start_time.toISOString() : start_time),
    participants: participants || [],
    suggested_fee: suggested_fee || 0,
    require_payment: require_payment || 0,
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
      url: `${baseUrl}/auth/wechat-login`,
      method: 'POST',
      header: getHeader(),
      data: { code: code || '' },
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
  const m = message;
  this.message = typeof m === 'string' ? m : (m && m.detail) ? (Array.isArray(m.detail) ? (m.detail[0] && m.detail[0].msg) || String(m.detail) : m.detail) : (m && m.msg) || String(m);
}
ApiError.prototype.toString = function () {
  return 'ApiError(' + this.statusCode + '): ' + this.message;
};

/** 获取活动详情 */
function getActivity(activityId) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/activities/${activityId}`,
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
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/users/bind-info`,
      method: 'PUT',
      header: getHeader(true),
      data: bindInfo,
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

/** 手机号授权登录：传入 getPhoneNumber 返回的 code */
function phoneLogin(code) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/auth/phone-login`,
      method: 'POST',
      header: getHeader(),
      data: { code: code || '' },
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
  const { tenantCode = 'default', skip = 0, limit = 20, keyword } = opts;
  let url = `${baseUrl}/users/admin/all?tenant_code=${tenantCode}&skip=${skip}&limit=${limit}`;
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
function createPaymentOrder({ activity_id, participant_name, phone, identity_number, actual_fee }) {
  const data = { activity_id, participant_name, phone, actual_fee };
  if (identity_number) data.identity_number = identity_number;
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/payments/create`,
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

/** 查询支付订单状态 */
function queryPaymentOrder(orderNo) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}/payments/order/${orderNo}`,
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
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const data = JSON.parse(res.data);
          resolve(data);
        } else {
          try {
            const data = JSON.parse(res.data);
            reject(new ApiError(res.statusCode, data.detail || '上传失败'));
          } catch (e) {
            reject(new ApiError(res.statusCode, '上传失败'));
          }
        }
      },
      fail: (err) => reject(err),
    });
  });
}

module.exports = {
  baseUrl,
  getToken,
  isUnsafeBaseUrl,
  getActivities,
  getEnrollableActivities,
  getUnstartedActivities,
  adminLogin,
  userLogin,
  registerUser,
  getUserProfile,
  registerParticipant,
  createActivity,
  wechatLogin,
  phoneLogin,
  getActivity,
  updateActivity,
  deleteActivity,
  getActivityParticipants,
  updateActivityStatus,
  getActivityCheckins,
  getActivityStatistics,
  getUserDetail,
  bindUserInfo,
  checkBindStatus,
  getAllUsersForAdmin,
  createPaymentOrder,
  queryPaymentOrder,
  uploadPoster,
  ApiError,
};
