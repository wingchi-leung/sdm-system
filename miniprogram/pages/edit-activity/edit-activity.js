const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');

const MAX_POSTER_SIZE = 5 * 1024 * 1024; // 5MB
const POSTER_UPLOAD_NOTICE_KEY = 'notice_poster_upload_ack_v1';

Page({
  data: {
    id: null,
    activityName: '',
    tag: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    activityTypeName: '',
    submitting: false,
    // 海报和地点
    posterUrl: '',
    posterLocalPath: '',
    location: '',
    uploading: false,
    // 公开设置
    isPublic: false,
  },

  resetSensitiveData() {
    this.setData({
      activityName: '',
      tag: '',
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
      activityTypeName: '',
      posterUrl: '',
      posterLocalPath: '',
      location: '',
      submitting: false,
      uploading: false,
      isPublic: false,
    });
  },

  ensureAdminAccess() {
    if (!auth.isLoggedIn()) {
      this.resetSensitiveData();
      auth.redirectToLogin('请先使用管理员账号登录');
      return false;
    }
    if (auth.isAdmin()) return true;
    this.resetSensitiveData();
    wx.showToast({ title: '请先使用管理员账号登录', icon: 'none' });
    setTimeout(() => wx.navigateBack(), 1500);
    return false;
  },

  onLoad(options) {
    this.tagTouched = false;
    tenant.applyPageOptions(options);
    if (!this.ensureAdminAccess()) return;
    if (options.id) {
      this.setData({ id: options.id });
      this.loadActivity(options.id);
    }
  },

  onShow() {
    if (!this.data.id) return;
    this.ensureAdminAccess();
  },

  async loadActivity(id) {
    try {
      const activity = await api.getActivity(id);
      // 解析开始时间
      let startDate = '';
      let startTime = '';
      if (activity.start_time) {
        const startParts = this.parseDateTimeParts(activity.start_time);
        startDate = startParts.date;
        startTime = startParts.time;
      }
      // 解析结束时间
      let endDate = '';
      let endTime = '';
      if (activity.end_time) {
        const endParts = this.parseDateTimeParts(activity.end_time);
        endDate = endParts.date;
        endTime = endParts.time;
      }
      this.setData({
        activityName: activity.activity_name,
        tag: activity.tag || '',
        startDate,
        startTime,
        endDate,
        endTime,
        activityTypeName: activity.activity_type_name || '',
        posterUrl: api.getImageUrl(activity.poster_url) || '',
        location: activity.location || '',
        isPublic: activity.is_public === 1,
      });
      this.tagTouched = !!(activity.tag || '').trim();
    } catch (err) {
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
    }
  },

  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  formatTime(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  },

  // 后端返回无时区的本地时间，直接按字符串回填 picker，避免 Date 做时区换算。
  parseDateTimeParts(value) {
    const text = String(value || '');
    const match = text.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
    if (match) {
      return { date: match[1], time: match[2] };
    }
    const date = new Date(text);
    if (isNaN(date.getTime())) {
      return { date: '', time: '' };
    }
    return { date: this.formatDate(date), time: this.formatTime(date) };
  },

  // 构造本地时间 ISO 字符串（不带时区转换）
  toLocalISOString(dateStr, timeStr) {
    return `${dateStr}T${timeStr}:00`;
  },

  onNameInput(e) {
    this.setData({ activityName: e.detail.value });
  },

  onTagInput(e) {
    const tag = e.detail.value;
    this.tagTouched = !!(tag || '').trim();
    this.setData({ tag });
  },

  onTypeNameInput(e) {
    this.setData({ activityTypeName: e.detail.value });
  },

  onStartDateChange(e) {
    this.setData({ startDate: e.detail.value });
  },

  onStartTimeChange(e) {
    this.setData({ startTime: e.detail.value });
  },

  onEndDateChange(e) {
    this.setData({ endDate: e.detail.value });
  },

  onEndTimeChange(e) {
    this.setData({ endTime: e.detail.value });
  },

  // 地点输入
  onLocationInput(e) {
    this.setData({ location: e.detail.value });
  },

  // 公开设置
  onIsPublicChange(e) {
    this.setData({ isPublic: e.detail.value });
  },

  // 选择海报
  onChoosePoster() {
    const openAlbum = () => {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album'],
        sizeType: ['compressed'],
        success: (res) => {
          const tempFile = res.tempFiles[0];
          // 检查文件大小
          if (tempFile.size > MAX_POSTER_SIZE) {
            wx.showToast({ title: '图片不能超过5MB', icon: 'none' });
            return;
          }
          this.setData({
            posterLocalPath: tempFile.tempFilePath,
            error: null,
          });
        },
        fail: () => {
          wx.showToast({ title: '未选择海报', icon: 'none' });
        },
      });
    };

    if (wx.getStorageSync(POSTER_UPLOAD_NOTICE_KEY)) {
      openAlbum();
      return;
    }

    wx.showModal({
      title: '用途说明',
      content: '将从相册选择图片，仅用于活动海报上传。',
      confirmText: '继续选择',
      success: (res) => {
        if (!res.confirm) return;
        wx.setStorageSync(POSTER_UPLOAD_NOTICE_KEY, 1);
        openAlbum();
      },
    });
  },

  // 删除海报
  onRemovePoster() {
    this.setData({
      posterLocalPath: '',
      posterUrl: '',
    });
  },

  refreshPreviousPage() {
    const pages = getCurrentPages();
    const previousPage = pages[pages.length - 2];
    if (!previousPage) {
      return;
    }

    if (typeof previousPage.loadActivity === 'function' && previousPage.data && previousPage.data.activityId) {
      previousPage.loadActivity(previousPage.data.activityId);
      return;
    }

    if (typeof previousPage.refreshList === 'function') {
      previousPage.refreshList();
      return;
    }

    if (typeof previousPage.loadActivities === 'function') {
      previousPage.loadActivities(true);
    }
  },

  async submit() {
    if (!auth.isAdmin()) {
      this.ensureAdminAccess();
      return;
    }
    const { id, activityName, tag, startDate, startTime, endDate, endTime, activityTypeName, location } = this.data;

    if (!activityName.trim()) {
      wx.showToast({ title: '请输入活动名称', icon: 'none' });
      return;
    }

    if (!startDate || !startTime) {
      wx.showToast({ title: '请选择开始时间', icon: 'none' });
      return;
    }

    // 验证开始时间必须早于结束时间
    if (endDate && endTime) {
      const start = new Date(`${startDate}T${startTime}`);
      const end = new Date(`${endDate}T${endTime}`);
      if (start >= end) {
        wx.showToast({ title: '开始时间必须早于结束时间', icon: 'none' });
        return;
      }
    }

    this.setData({ submitting: true });

    try {
      // 先上传新海报（如果有）
      let posterUrl = this.data.posterUrl;
      if (this.data.posterLocalPath) {
        try {
          wx.showLoading({ title: '上传海报中' });
          const uploadResult = await api.uploadPoster(this.data.posterLocalPath);
          posterUrl = uploadResult.url;
        } catch (err) {
          wx.showToast({ title: err.message || '海报上传失败', icon: 'none' });
          this.setData({ submitting: false });
          return;
        } finally {
          wx.hideLoading();
        }
      }

      const updateData = {
        activity_name: activityName.trim(),
        start_time: this.toLocalISOString(startDate, startTime),
        tag: tag.trim() || activityTypeName.trim() || null,
        poster_url: posterUrl || null,
        location: (location || '').trim() || null,
      };

      if (endDate && endTime) {
        updateData.end_time = this.toLocalISOString(endDate, endTime);
      }

      if (activityTypeName.trim()) {
        updateData.activity_type_name = activityTypeName.trim();
      }

      updateData.is_public = this.data.isPublic ? 1 : 0;

      await api.updateActivity(id, updateData);
      const latestActivity = await api.getActivity(id);
      const latestPosterUrl = api.getImageUrl(latestActivity.poster_url) || '';

      if (this.data.posterLocalPath && !latestPosterUrl) {
        throw new Error('海报上传成功，但活动海报地址未保存成功');
      }

      this.setData({
        posterUrl: latestPosterUrl,
        posterLocalPath: '',
        submitting: false,
      });
      this.refreshPreviousPage();
      wx.showToast({ title: '更新成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1000);
    } catch (err) {
      wx.showToast({ title: err.message || '更新失败', icon: 'none' });
      this.setData({ submitting: false });
    }
  },
});
