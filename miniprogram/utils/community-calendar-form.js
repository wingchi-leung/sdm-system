const api = require('./api');
const tenant = require('./tenant');

const EVENT_TYPE_OPTIONS = [
  { label: '活动', value: 'activity' },
  { label: '会议', value: 'meeting' },
  { label: '提醒', value: 'reminder' },
  { label: '截止时间', value: 'deadline' },
  { label: '周期安排', value: 'routine' },
];

function decodeDisplayText(value) {
  const text = value == null ? '' : String(value);
  if (!text) return '';
  try {
    return decodeURIComponent(text);
  } catch (_) {
    return text;
  }
}

function pad(number) {
  return String(number).padStart(2, '0');
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTimeKey(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function combineDateAndTime(dateKey, timeKey) {
  if (!dateKey || !timeKey) return '';
  return `${dateKey}T${timeKey}:00`;
}

function getInitialTimeState() {
  const now = new Date();
  const start = new Date(now.getTime() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    startDate: formatDateKey(start),
    startTime: formatTimeKey(start),
    endDate: formatDateKey(end),
    endTime: formatTimeKey(end),
  };
}

function buildEventTypeIndex(value) {
  const normalized = String(value || '').trim();
  const index = EVENT_TYPE_OPTIONS.findIndex((item) => item.value === normalized);
  return index >= 0 ? index : 0;
}

function createCalendarFormPage(mode) {
  const isEditMode = mode === 'edit';
  return {
    data: {
      channelId: null,
      channelName: '',
      channelRole: 'member',
      eventId: null,
      pageTitle: isEditMode ? '编辑日历事件' : '新建日历事件',
      submitText: isEditMode ? '保存修改' : '创建事件',
      loading: true,
      submitting: false,
      error: null,
      title: '',
      eventTypeOptions: EVENT_TYPE_OPTIONS,
      eventTypeIndex: 0,
      eventTypeValue: EVENT_TYPE_OPTIONS[0].value,
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
      location: '',
      activityId: '',
      content: '',
      coverUrl: '',
      coverPreviewUrl: '',
    },

    onLoad(options) {
      tenant.applyPageOptions(options);
      const channelId = Number(options.channelId || 0);
      if (!channelId) {
        this.setData({ loading: false, error: '缺少社区参数' });
        return;
      }
      const timeState = getInitialTimeState();
      this.setData({
        channelId,
        channelName: decodeDisplayText(options.channelName),
        channelRole: decodeDisplayText(options.channelRole || 'member'),
        eventId: isEditMode ? Number(options.id || 0) || null : null,
        eventTypeIndex: 0,
        eventTypeValue: EVENT_TYPE_OPTIONS[0].value,
        ...timeState,
      });
      if (isEditMode) {
        this.loadDetail();
      } else {
        this.setData({ loading: false });
      }
    },

    async loadDetail() {
      if (!this.data.eventId) {
        this.setData({ loading: false, error: '缺少事件 ID' });
        return;
      }
      this.setData({ loading: true, error: null });
      try {
        const data = await api.getCommunityChannelCalendarEventDetail(this.data.channelId, this.data.eventId);
        const start = new Date(data.start_time);
        const end = data.end_time ? new Date(data.end_time) : null;
        this.setData({
          loading: false,
          title: data.title || '',
          eventTypeIndex: buildEventTypeIndex(data.event_type),
          eventTypeValue: data.event_type || EVENT_TYPE_OPTIONS[0].value,
          startDate: formatDateKey(start),
          startTime: formatTimeKey(start),
          endDate: end ? formatDateKey(end) : '',
          endTime: end ? formatTimeKey(end) : '',
          location: data.location || '',
          activityId: data.activity_id ? String(data.activity_id) : '',
          content: data.content || '',
          coverUrl: data.cover_url || '',
          coverPreviewUrl: data.cover_url ? api.getImageUrl(data.cover_url) : '',
        });
      } catch (err) {
        this.setData({ loading: false, error: err.message || '加载事件失败' });
      }
    },

    onTitleInput(e) {
      this.setData({ title: e.detail.value });
    },

    onEventTypeChange(e) {
      const eventTypeIndex = Number(e.detail.value || 0);
      const eventTypeValue = EVENT_TYPE_OPTIONS[eventTypeIndex]?.value || EVENT_TYPE_OPTIONS[0].value;
      this.setData({ eventTypeIndex, eventTypeValue });
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

    onLocationInput(e) {
      this.setData({ location: e.detail.value });
    },

    onActivityIdInput(e) {
      this.setData({ activityId: e.detail.value });
    },

    onContentInput(e) {
      this.setData({ content: e.detail.value });
    },

    async onChooseCover() {
      try {
        const res = await new Promise((resolve, reject) => {
          wx.chooseMedia({
            count: 1,
            mediaType: ['image'],
            sourceType: ['album'],
            sizeType: ['compressed'],
            success: resolve,
            fail: reject,
          });
        });
        const file = (res.tempFiles || [])[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
          wx.showToast({ title: '封面图不能超过5MB', icon: 'none' });
          return;
        }
        wx.showLoading({ title: '上传中…', mask: true });
        const upload = await api.uploadCommunityImage(file.tempFilePath);
        wx.hideLoading();
        this.setData({
          coverUrl: upload.url,
          coverPreviewUrl: api.getImageUrl(upload.url),
        });
      } catch (err) {
        wx.hideLoading();
        if (err && err.errMsg && String(err.errMsg).includes('cancel')) return;
        wx.showToast({ title: '封面图上传失败', icon: 'none' });
      }
    },

    validateForm() {
      if (!String(this.data.title || '').trim()) {
        return '请输入事件标题';
      }
      if (!this.data.startDate || !this.data.startTime) {
        return '请选择开始时间';
      }
      const start = combineDateAndTime(this.data.startDate, this.data.startTime);
      const end = this.data.endDate && this.data.endTime
        ? combineDateAndTime(this.data.endDate, this.data.endTime)
        : '';
      if (end && new Date(end).getTime() < new Date(start).getTime()) {
        return '结束时间不能早于开始时间';
      }
      return '';
    },

    buildPayload() {
      const payload = {
        title: String(this.data.title || '').trim(),
        event_type: this.data.eventTypeValue,
        content: String(this.data.content || '').trim() || null,
        location: String(this.data.location || '').trim() || null,
        cover_url: String(this.data.coverUrl || '').trim() || null,
        start_time: combineDateAndTime(this.data.startDate, this.data.startTime),
        end_time: this.data.endDate && this.data.endTime
          ? combineDateAndTime(this.data.endDate, this.data.endTime)
          : null,
      };
      const activityId = Number(this.data.activityId || 0);
      if (activityId > 0) {
        payload.activity_id = activityId;
      }
      return payload;
    },

    async onSubmit() {
      if (this.data.submitting) return;
      const validationError = this.validateForm();
      if (validationError) {
        wx.showToast({ title: validationError, icon: 'none' });
        return;
      }

      this.setData({ submitting: true });
      try {
        const payload = this.buildPayload();
        if (isEditMode) {
          await api.updateCommunityChannelCalendarEvent(this.data.channelId, this.data.eventId, payload);
        } else {
          await api.createCommunityChannelCalendarEvent(this.data.channelId, payload);
        }
        wx.showToast({ title: isEditMode ? '已保存' : '已创建', icon: 'success' });
        setTimeout(() => {
          if (typeof wx.navigateBack === 'function') {
            wx.navigateBack();
          }
        }, 600);
      } catch (err) {
        wx.showToast({ title: err.message || '提交失败', icon: 'none' });
      } finally {
        this.setData({ submitting: false });
      }
    },
  };
}

module.exports = {
  createCalendarFormPage,
};
