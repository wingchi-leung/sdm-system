const api = require('../../utils/api');
const auth = require('../../utils/auth');
const image = require('../../utils/image');
const tenant = require('../../utils/tenant');
const { resolveAvatarDisplayUrl } = require('../../utils/avatar');

/** 把接口/网络错误转成可读文案，避免显示 [object Object] */
function formatLoadError(err) {
  if (!err) return '加载失败，请重试';
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  if (err.errMsg) return err.errMsg; // 微信 wx.request 失败时的字段
  const s = String(err);
  if (s === '[object Object]') {
    return '无法连接服务器，请确认：1) 后端已启动（端口 8000）；2) 开发者工具已勾选「不校验合法域名」';
  }
  return s;
}

Page({
  data: {
    activities: [],
    visibleActivities: [],
    loading: true,
    error: null,
    isAdmin: false,
    isUser: false,
    canCreateActivity: false,
    headerAvatarUrl: '',
    headerAvatarText: '用',
    todayLabel: '今天',
    weekdayLabelCn: '',
    todayDateCn: '',
  },

  _redirectingToLogin: false,

  resetPageState(overrides = {}) {
    this.setData({
      loading: true,
      error: null,
      activities: [],
      visibleActivities: [],
      headerAvatarUrl: '',
      todayLabel: '今天',
      weekdayLabelCn: this.getWeekdayLabelCn(new Date()),
      todayDateCn: this.getTodayDateCn(new Date()),
      ...overrides,
    });
  },

  ensureLoggedIn() {
    if (auth.isLoggedIn()) {
      this._redirectingToLogin = false;
      return true;
    }

    this.resetPageState({
      loading: false,
      isAdmin: false,
      isUser: false,
      canCreateActivity: false,
      headerAvatarText: '用',
    });

    if (this._redirectingToLogin) {
      return false;
    }

    this._redirectingToLogin = true;
    const redirectUrl = tenant.appendTenantToUrl('/pages/index/index');
    wx.showToast({ title: '请先登录', icon: 'none' });
    setTimeout(() => {
      wx.navigateTo({
        url: tenant.appendTenantToUrl('/pages/login/login', { redirect: redirectUrl }),
      });
    }, 300);
    return false;
  },

  resolveAdminState() {
    const isAdmin = auth.isAdmin();
    const isUser = auth.isUser();
    const canCreateActivity = auth.isSuperAdmin() || auth.getAdminActivityTypes().length > 0;
    this.setData({
      isAdmin,
      isUser,
      canCreateActivity,
      headerAvatarUrl: isUser ? this.data.headerAvatarUrl : '',
      headerAvatarText: auth.getUserName() ? String(auth.getUserName()).slice(0, 1) : '用',
    });
  },

  async syncAdminCapabilities() {
    if (!auth.isAdmin()) return;
    try {
      const snapshot = await api.getAuthSnapshot();
      auth.updateAdminMeta(snapshot || {});
    } catch (e) {
      // 忽略同步失败，保留本地缓存作为兜底
    }
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    if (!this.ensureLoggedIn()) return;
    this.syncAdminCapabilities().finally(() => {
      this.resolveAdminState();
      this.load();
    });
  },

  onShow() {
    if (!this.ensureLoggedIn()) return;
    this.syncAdminCapabilities().finally(() => {
      this.resolveAdminState();
      this.load();
    });
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    this.resetPageState();
    this.resolveAdminState();
    const tasks = [api.getEnrollableActivities()];
    if (auth.isUser()) {
      tasks.push(api.getMyParticipantActivities());
      tasks.push(api.getUserProfile());
    }
    return Promise.all(tasks)
      .then(async ([res, registrationRes, profile]) => {
        const registrationMap = {};
        (registrationRes?.items || []).forEach((item) => {
          registrationMap[item.id] = item;
        });
        let items = (res.items || []).map((a) => {
          const dateDisplay = this.formatDateForDisplay(a.start_time);
          const timeRangeDisplay = this.formatTimeRange(a.start_time, a.end_time);
          const registration = registrationMap[a.id];
          return {
            ...a,
            start_time_display: a.start_time ? this.formatTime(a.start_time) : '',
            time_range_display: timeRangeDisplay,
            status_text: a.status === 1 ? '未开始' : a.status === 2 ? '进行中' : '已结束',
            date_day: dateDisplay.day,
            date_month: dateDisplay.month,
            date_key: dateDisplay.key,
            weekday_label: dateDisplay.weekdayLabel,
            date_label: dateDisplay.dateLabel,
            is_today: dateDisplay.isToday,
            has_registered: !!registration,
            registration_status_text: registration
              ? (registration.enroll_status === 2 ? '候补中' : '已报名')
              : '',
            location_display: this.formatLocation(a.location),
            participant_display: this.formatParticipantText(a),
            summary_text: this.buildActivitySummary(a),
          };
        });
        items = await image.resolveActivityPosters(items);
        items.sort((a, b) => {
          const aTime = a.start_time ? new Date(a.start_time).getTime() : 0;
          const bTime = b.start_time ? new Date(b.start_time).getTime() : 0;
          return aTime - bTime;
        });

        const headerAvatarUrl = auth.isUser()
          ? await resolveAvatarDisplayUrl(profile && profile.avatar_url)
          : '';
        this.setData({
          activities: items,
          visibleActivities: items,
          loading: false,
          headerAvatarUrl,
          weekdayLabelCn: this.getWeekdayLabelCn(new Date()),
          todayDateCn: this.getTodayDateCn(new Date()),
        });
      })
      .catch((err) => {
        const msg = formatLoadError(err);
        this.setData({
          error: msg,
          loading: false,
          activities: [],
          visibleActivities: [],
          headerAvatarUrl: '',
          weekdayLabelCn: this.getWeekdayLabelCn(new Date()),
          todayDateCn: this.getTodayDateCn(new Date()),
        });
      });
  },

  onRefresh() {
    this.load();
  },

  onShowAllActivities() {},

  goDetail(e) {
    const a = e.currentTarget.dataset.activity;
    if (!a) return;
    // 只传递ID，详情页重新获取数据
    wx.navigateTo({
      url: tenant.appendTenantToUrl('/pages/activity-detail/activity-detail', { id: a.id }),
    });
  },

  goCreateActivity() {
    wx.navigateTo({ url: tenant.appendTenantToUrl('/pages/create-activity/create-activity') });
  },

  goMine() {
    wx.switchTab({ url: '/pages/mine/mine' });
  },

  statusText(status) {
    const map = { 1: '未开始', 2: '进行中', 3: '已结束' };
    return map[status] || '未知';
  },

  formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${m}月${day}日 ${h}:${min}`;
  },

  formatTimeRange(startIso, endIso) {
    if (!startIso) return '';
    const start = new Date(startIso);
    const startHour = String(start.getHours()).padStart(2, '0');
    const startMinute = String(start.getMinutes()).padStart(2, '0');
    const startText = `${startHour}:${startMinute}`;
    if (!endIso) return startText;
    const end = new Date(endIso);
    const endHour = String(end.getHours()).padStart(2, '0');
    const endMinute = String(end.getMinutes()).padStart(2, '0');
    return `${startText}-${endHour}:${endMinute}`;
  },

  formatLocation(location) {
    const value = location ? String(location).trim() : '';
    return value || '线上活动';
  },

  formatParticipantText(activity) {
    const count = Number(activity.current_participants || activity.participant_count || activity.registered_count || 0);
    if (count > 0) {
      return `${count} 人参加`;
    }
    return '开放报名中';
  },

  buildActivitySummary(activity) {
    const candidate = [
      activity.summary,
      activity.description,
      activity.content,
      activity.intro,
    ].find((value) => value && String(value).trim());
    if (candidate) {
      return String(candidate).trim().replace(/\s+/g, ' ').slice(0, 30);
    }
    const locationText = this.formatLocation(activity.location);
    return locationText === '线上活动'
      ? ''
      : `${locationText}`;
  },

  // 格式化日期为大号数字显示
  formatDateForDisplay(iso) {
    if (!iso) {
      return {
        day: '--',
        month: '未知',
        key: '',
        weekdayLabel: '',
        dateLabel: '--.--',
        isToday: false,
      };
    }
    const d = new Date(iso);
    const day = d.getDate();
    const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    const month = months[d.getMonth()];
    const weekdays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const today = new Date();
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return {
      day,
      month,
      key,
      weekdayLabel: weekdays[d.getDay()],
      dateLabel: `${String(d.getMonth() + 1).padStart(2, '0')}.${String(day).padStart(2, '0')}`,
      isToday: key === todayKey,
    };
  },

  buildDateTabs(items) {
    const tabMap = new Map();
    items.forEach((item) => {
      if (!item.date_key || tabMap.has(item.date_key)) return;
      tabMap.set(item.date_key, {
        key: item.date_key,
        dateLabel: item.date_label,
        weekdayLabel: item.weekday_label,
        markerLabel: item.is_today ? 'TODAY' : '',
      });
    });
    return Array.from(tabMap.values());
  },

  resolveSelectedDateKey(dateTabs) {
    if (!dateTabs.length) return '';
    if (this.data.selectedDateKey && dateTabs.some((tab) => tab.key === this.data.selectedDateKey)) {
      return this.data.selectedDateKey;
    }
    const todayTab = dateTabs.find((tab) => tab.markerLabel === 'TODAY');
    return todayTab ? todayTab.key : dateTabs[0].key;
  },

  filterActivitiesByDate(items, dateKey) {
    if (!dateKey) return items;
    return items.filter((item) => item.date_key === dateKey);
  },

  getWeekdayLabelCn(date) {
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return weekdays[date.getDay()] || '';
  },

  getTodayDateCn(date) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  },

  onShareAppMessage() {
    return {
      title: '活动列表',
      path: tenant.appendTenantToUrl('/pages/index/index'),
    };
  },
});
