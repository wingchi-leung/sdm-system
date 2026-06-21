const api = require('../../utils/api');
const tenant = require('../../utils/tenant');

function decodeDisplayText(value) {
  const text = value == null ? '' : String(value);
  if (!text) return '';
  try {
    return decodeURIComponent(text);
  } catch (_) {
    return text;
  }
}

function getTodayParts() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
  };
}

function formatDayLabel(dateKey) {
  if (!dateKey) return '';
  const [year, month, day] = dateKey.split('-');
  return `${year}年${Number(month)}月${Number(day)}日`;
}

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${m}-${day} ${h}:${min}`;
}

Page({
  data: {
    channelId: null,
    channelName: '',
    channelRole: 'member',
    loading: true,
    error: null,
    showCreateButton: false,
    currentYear: 0,
    currentMonth: 0,
    selectedDate: '',
    eventDates: [],
    monthSummary: null,
    events: [],
    selectedEvents: [],
    total: 0,
    selectedDayLabel: '',
    latestEvent: null,
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    const channelId = Number(options.channelId || 0);
    if (!channelId) {
      this.setData({ loading: false, error: '缺少社区参数' });
      return;
    }
    const today = getTodayParts();
    this.setData({
      channelId,
      channelName: decodeDisplayText(options.channelName),
      channelRole: decodeDisplayText(options.channelRole || 'member'),
      currentYear: today.year,
      currentMonth: today.month,
      selectedDate: today.date,
      selectedDayLabel: formatDayLabel(today.date),
      showCreateButton: decodeDisplayText(options.channelRole || 'member') === 'admin',
    });
    this.loadMonthData(today.year, today.month, today.date);
  },

  onShow() {
    if (this.data.channelId) {
      this.loadMonthData(this.data.currentYear, this.data.currentMonth, this.data.selectedDate);
    }
  },

  async loadMonthData(year, month, selectedDate = '') {
    if (!this.data.channelId) return;
    this.setData({ loading: true, error: null });
    try {
      const [summary, list] = await Promise.all([
        api.getCommunityChannelCalendarMonthSummary(this.data.channelId, year, month),
        api.getCommunityChannelCalendarEvents(this.data.channelId, {
          year,
          month,
          skip: 0,
          limit: 100,
        }),
      ]);

      const normalizedEvents = (list.items || []).map((item) => ({
        ...item,
        start_time_display: formatDateTime(item.start_time),
        end_time_display: formatDateTime(item.end_time),
        date_key: String(item.start_time || '').slice(0, 10),
      }));

      const nextSelectedDate = selectedDate || `${year}-${String(month).padStart(2, '0')}-01`;
      const selectedEvents = await this.loadDayEvents(nextSelectedDate, normalizedEvents);
      const latestEvent = summary.latest
        ? {
            ...summary.latest,
            start_time_display: formatDateTime(summary.latest.start_time),
            date_key: String(summary.latest.start_time || '').slice(0, 10),
          }
        : null;

      this.setData({
        loading: false,
        currentYear: year,
        currentMonth: month,
        monthSummary: summary,
        events: normalizedEvents,
        eventDates: (summary.day_counts || []).map((item) => item.date),
        total: Number(summary.total || 0),
        latestEvent,
        selectedDate: nextSelectedDate,
        selectedDayLabel: formatDayLabel(nextSelectedDate),
        selectedEvents,
      });
    } catch (err) {
      this.setData({
        loading: false,
        error: err.message || '加载日历失败',
      });
    }
  },

  onMonthChange(e) {
    const { year, month } = e.detail || {};
    if (!year || !month) return;
    this.loadMonthData(Number(year), Number(month), `${year}-${String(month).padStart(2, '0')}-01`);
  },

  onTodayTap(e) {
    const { year, month, date } = e.detail || {};
    if (!year || !month || !date) return;
    this.loadMonthData(Number(year), Number(month), date);
  },

  onSelectDate(e) {
    const date = String(e.detail?.date || '');
    if (!date) return;
    this.loadDayForSelection(date);
  },

  async loadDayForSelection(date) {
    if (!this.data.channelId || !date) return;
    this.setData({
      selectedDate: date,
      selectedDayLabel: formatDayLabel(date),
    });
    try {
      const selectedEvents = await this.loadDayEvents(date);
      this.setData({ selectedEvents });
    } catch (err) {
      wx.showToast({ title: err.message || '加载当天事件失败', icon: 'none' });
    }
  },

  async loadDayEvents(date, fallbackEvents = null) {
    if (!this.data.channelId || !date) return [];
    try {
      const result = await api.getCommunityChannelCalendarEvents(this.data.channelId, {
        date,
        skip: 0,
        limit: 100,
      });
      return (result.items || []).map((item) => ({
        ...item,
        start_time_display: formatDateTime(item.start_time),
        end_time_display: formatDateTime(item.end_time),
        date_key: String(item.start_time || '').slice(0, 10),
      }));
    } catch (err) {
      if (Array.isArray(fallbackEvents)) {
        return fallbackEvents.filter((item) => item.date_key === date);
      }
      throw err;
    }
  },

  onOpenDetail(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (!id) return;
    wx.navigateTo({
      url: tenant.appendTenantToUrl('/pages/community-calendar-detail/community-calendar-detail', {
        channelId: this.data.channelId,
        channelName: this.data.channelName,
        channelRole: this.data.channelRole,
        id,
      }),
    });
  },

  onCreate() {
    if (!this.data.showCreateButton) {
      wx.showToast({ title: '仅频道管理员可新建事件', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: tenant.appendTenantToUrl('/pages/community-calendar-create/community-calendar-create', {
        channelId: this.data.channelId,
        channelName: this.data.channelName,
        channelRole: this.data.channelRole,
      }),
    });
  },
});
