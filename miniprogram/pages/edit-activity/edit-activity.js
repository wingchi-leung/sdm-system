const api = require('../../utils/api');
const auth = require('../../utils/auth');

Page({
  data: {
    id: null,
    activityName: '',
    tag: '',
    startTime: '',
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
      const startTime = activity.start_time ? activity.start_time.slice(0, 16) : '';
      const endTime = activity.end_time ? activity.end_time.slice(0, 16) : '';
      this.setData({
        activityName: activity.activity_name,
        tag: activity.tag || '',
        startTime,
        endTime,
        activityTypeName: activity.activity_type_name || '',
      });
    } catch (err) {
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
    }
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

  onStartTimeChange(e) {
    this.setData({ startTime: e.detail.value });
  },

  onEndTimeChange(e) {
    this.setData({ endTime: e.detail.value });
  },

  async submit() {
    const { id, activityName, tag, startTime, endTime, activityTypeName } = this.data;

    if (!activityName.trim()) {
      wx.showToast({ title: '请输入活动名称', icon: 'none' });
      return;
    }

    if (!startTime) {
      wx.showToast({ title: '请选择开始时间', icon: 'none' });
      return;
    }

    const updateData = {
      activity_name: activityName.trim(),
      start_time: new Date(startTime).toISOString(),
      tag: tag.trim() || null,
    };

    if (endTime) {
      updateData.end_time = new Date(endTime).toISOString();
    }

    if (activityTypeName.trim()) {
      updateData.activity_type_name = activityTypeName.trim();
    }

    this.setData({ submitting: true });

    try {
      await api.updateActivity(id, updateData);
      wx.showToast({ title: '更新成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1000);
    } catch (err) {
      wx.showToast({ title: err.message || '更新失败', icon: 'none' });
      this.setData({ submitting: false });
    }
  },
});