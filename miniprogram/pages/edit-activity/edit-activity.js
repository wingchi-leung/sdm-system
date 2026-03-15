const api = require('../../utils/api');
const auth = require('../../utils/auth');

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
  },

  onLoad(options) {
    if (!auth.isAdmin()) {
      wx.showToast({ title: '请先使用管理员账号登录', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    if (options.id) {
      this.setData({ id: options.id });
      this.loadActivity(options.id);
    }
  },

  async loadActivity(id) {
    try {
      const activity = await api.getActivity(id);
      // 解析开始时间
      let startDate = '';
      let startTime = '';
      if (activity.start_time) {
        const startDt = new Date(activity.start_time);
        startDate = this.formatDate(startDt);
        startTime = this.formatTime(startDt);
      }
      // 解析结束时间
      let endDate = '';
      let endTime = '';
      if (activity.end_time) {
        const endDt = new Date(activity.end_time);
        endDate = this.formatDate(endDt);
        endTime = this.formatTime(endDt);
      }
      this.setData({
        activityName: activity.activity_name,
        tag: activity.tag || '',
        startDate,
        startTime,
        endDate,
        endTime,
        activityTypeName: activity.activity_type_name || '',
      });
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

  onNameInput(e) {
    this.setData({ activityName: e.detail.value });
  },

  onTagInput(e) {
    this.setData({ tag: e.detail.value });
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

  async submit() {
    const { id, activityName, tag, startDate, startTime, endDate, endTime, activityTypeName } = this.data;

    if (!activityName.trim()) {
      wx.showToast({ title: '请输入活动名称', icon: 'none' });
      return;
    }

    if (!startDate || !startTime) {
      wx.showToast({ title: '请选择开始时间', icon: 'none' });
      return;
    }

    const startDateTime = new Date(`${startDate}T${startTime}:00`);
    const updateData = {
      activity_name: activityName.trim(),
      start_time: startDateTime.toISOString(),
      tag: tag.trim() || null,
    };

    if (endDate && endTime) {
      const endDateTime = new Date(`${endDate}T${endTime}:00`);
      updateData.end_time = endDateTime.toISOString();
    }

    if (activityTypeName.trim()) {
      updateData.activity_type_name = activityTypeName.trim();
    }

    console.log('提交更新数据:', updateData);
    this.setData({ submitting: true });

    try {
      const result = await api.updateActivity(id, updateData);
      console.log('更新返回结果:', result);
      wx.showToast({ title: '更新成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1000);
    } catch (err) {
      console.error('更新失败:', err);
      wx.showToast({ title: err.message || '更新失败', icon: 'none' });
      this.setData({ submitting: false });
    }
  },
});