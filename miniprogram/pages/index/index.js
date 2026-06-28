const api = require('../../utils/api');
const auth = require('../../utils/auth');
const image = require('../../utils/image');
const { resolveActivityPostersOrFallback } = require('../../utils/image-safe');
const tenant = require('../../utils/tenant');
const { syncTabBarSelected } = require('../../utils/tab-bar');
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
    dateGroups: [],
    loading: true,
    error: null,
    isAdmin: false,
    isUser: false,
    canCreateActivity: false,
    headerAvatarUrl: '',
    headerAvatarText: '用',
    todayLabel: '探索',
    weekdayLabelCn: '',
    weekdayLabelEn: '',
    todayDateShort: '',
    communityUnreadCount: 0,
  },

  _redirectingToLogin: false,
  _loadSeq: 0,

  resetPageState(overrides = {}) {
    this.setData({
      loading: true,
      error: null,
      activities: [],
      visibleActivities: [],
      dateGroups: [],
      headerAvatarUrl: '',
      todayLabel: '探索',
      weekdayLabelCn: this.getWeekdayLabelCn(new Date()),
      weekdayLabelEn: this.getWeekdayLabelEn(new Date()),
      todayDateShort: this.getTodayDateShort(new Date()),
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
      if (auth.handleSessionExpired(e)) return;
      // 忽略同步失败，保留本地缓存作为兜底
    }
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    this.ensureLoggedIn();
  },

  onShow() {
    if (!this.ensureLoggedIn()) return;
    syncTabBarSelected(this);
    this.syncAdminCapabilities().finally(() => {
      this.resolveAdminState();
      this.load();
      this.loadCommunityUnreadCount();
    });
  },

  async loadCommunityUnreadCount() {
    try {
      const res = await api.getCommunityNotificationUnreadCount();
      this.setData({ communityUnreadCount: Number(res.unread_count || 0) });
    } catch (_) {
      this.setData({ communityUnreadCount: 0 });
    }
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    const loadSeq = this._loadSeq + 1;
    this._loadSeq = loadSeq;
    this.resetPageState();
    this.resolveAdminState();
    // 超级管理员按管理视角看全量活动；其他账号按用户视角展示。
    const useAdminView = auth.isSuperAdmin();
    const activityTask = api.getEnrollableActivities({ asUserView: !useAdminView });
    const registrationTask = auth.isUser()
      ? api.getMyParticipantActivities()
      : Promise.resolve({ items: [] });
      const profileTask = auth.isUser()
      ? api.getUserProfile().catch((err) => {
          if (auth.handleSessionExpired(err)) return null;
          return null;
        })
      : Promise.resolve(null);
    return Promise.all([activityTask, registrationTask])
      .then(async ([res, registrationRes]) => {
        if (this._loadSeq !== loadSeq) return;
        if (!auth.isLoggedIn()) return;
        const registrationMap = {};
        (registrationRes?.items || []).forEach((item) => {
          registrationMap[item.id] = item;
        });
        let items = (res.items || []).map((a) => {
          const dateDisplay = this.formatDateForDisplay(a.start_time);
          const timeRangeDisplay = this.formatTimeRange(a.start_time, a.end_time);
          const registration = registrationMap[a.id];
          const hasPendingPayment = !!registration && Number(registration.payment_status) === 1;
          const hasRegistered = !!registration && !hasPendingPayment;
          return {
            ...a,
            start_time_display: a.start_time ? this.formatTime(a.start_time) : '',
            time_range_display: timeRangeDisplay,
            status_text: a.status === 1 ? '未开始' : a.status === 2 ? '进行中' : '已结束',
            activity_name_en: this.resolveActivityNameEn(a),
            date_day: dateDisplay.day,
            date_month: dateDisplay.month,
            date_key: dateDisplay.key,
            date_group_label: dateDisplay.groupLabel,
            weekday_label: dateDisplay.weekdayLabel,
            date_label: dateDisplay.dateLabel,
            is_today: dateDisplay.isToday,
            has_registered: hasRegistered,
            registration_status_text: registration
              ? (hasPendingPayment
                ? '报名处理中'
                : (registration.enroll_status === 2 ? '候补中' : '已报名'))
              : '',
            location_display: this.formatLocation(a.location),
            location_display_en: this.formatLocationEn(a.location),
            participant_display: this.formatParticipantText(a),
            summary_text: this.buildActivitySummary(a),
          };
        });
        items = await resolveActivityPostersOrFallback(image, items, '首页活动列表');
        items.sort((a, b) => {
          const aTime = a.start_time ? new Date(a.start_time).getTime() : 0;
          const bTime = b.start_time ? new Date(b.start_time).getTime() : 0;
          return bTime - aTime;
        });
        const dateGroups = this.buildDateGroups(items);

        this.setData({
          activities: items,
          visibleActivities: items,
          dateGroups,
          loading: false,
          headerAvatarUrl: '',
          weekdayLabelCn: this.getWeekdayLabelCn(new Date()),
          weekdayLabelEn: this.getWeekdayLabelEn(new Date()),
          todayDateShort: this.getTodayDateShort(new Date()),
        });

        if (!auth.isUser()) return;
        profileTask
          .then(async (profile) => {
            if (this._loadSeq !== loadSeq || !profile) return;
            try {
              const headerAvatarUrl = await resolveAvatarDisplayUrl(
                profile.avatar_url,
                profile.update_time
              );
              if (this._loadSeq !== loadSeq) return;
              this.setData({ headerAvatarUrl });
            } catch (_) {
              // 头像只是增强展示，失败时保留首字母兜底
            }
          })
          .catch((err) => {
            if (auth.handleSessionExpired(err)) return;
            // 头像请求失败不影响活动列表首屏
          });
      })
      .catch((err) => {
        if (this._loadSeq !== loadSeq) return;
        const msg = formatLoadError(err);
        this.setData({
          error: msg,
          loading: false,
          activities: [],
          visibleActivities: [],
          dateGroups: [],
          headerAvatarUrl: '',
          weekdayLabelCn: this.getWeekdayLabelCn(new Date()),
          weekdayLabelEn: this.getWeekdayLabelEn(new Date()),
          todayDateShort: this.getTodayDateShort(new Date()),
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

  goCommunityNotifications() {
    wx.navigateTo({ url: '/pages/community-notifications/community-notifications' });
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

  formatLocationEn(location) {
    const value = location ? String(location).trim() : '';
    if (!value) return 'Online';
    if (value === '线上活动') return 'Online';
    return '';
  },

  resolveActivityNameEn(activity) {
    const fields = [
      activity.activity_name_en,
      activity.name_en,
      activity.title_en,
      activity.activity_type_name_en,
    ];
    const candidate = fields.find((value) => value && String(value).trim());
    return candidate ? String(candidate).trim() : '';
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
        groupLabel: '未设置日期',
        isToday: false,
      };
    }
    const d = new Date(iso);
    const day = d.getDate();
    const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    const month = months[d.getMonth()];
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return {
      day,
      month,
      key,
      weekdayLabel: weekdays[d.getDay()],
      dateLabel: `${String(d.getMonth() + 1).padStart(2, '0')}.${String(day).padStart(2, '0')}`,
      groupLabel: `${d.getMonth() + 1}月${day}日`,
      isToday: key === todayKey,
    };
  },

  buildDateGroups(items) {
    const groupMap = new Map();
    const groups = [];
    items.forEach((item) => {
      const key = item.date_key || `unknown-${groups.length}`;
      if (!groupMap.has(key)) {
        const group = {
          key,
          date_label: item.date_group_label || item.date_label || '未设置日期',
          weekday_label: item.weekday_label || '',
          activities: [],
        };
        groupMap.set(key, group);
        groups.push(group);
      }
      groupMap.get(key).activities.push(item);
    });
    return groups;
  },

  getWeekdayLabelCn(date) {
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return weekdays[date.getDay()] || '';
  },

  getTodayDateCn(date) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  },

  getTodayDateShort(date) {
    return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  },

  getWeekdayLabelEn(date) {
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return weekdays[date.getDay()] || '';
  },

  onShareAppMessage() {
    return {
      title: '探索',
      path: tenant.appendTenantToUrl('/pages/index/index'),
    };
  },
});
