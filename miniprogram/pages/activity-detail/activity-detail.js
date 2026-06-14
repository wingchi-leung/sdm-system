const api = require('../../utils/api');
const auth = require('../../utils/auth');
const image = require('../../utils/image');
const tenant = require('../../utils/tenant');
const contentUtils = require('../../utils/community-content');

Page({
  data: {
    activityId: null,
    activity: null,
    statusBarHeight: 0,
    posterLoadFailed: false,
    canEnroll: false,
    hasRegistered: false,
    hasPendingPayment: false,
    registrationStatusText: '',
    actionTipText: '',
    isAdmin: false,
    showAdminPanel: false,
    loading: true,
    error: null,
    statusOptions: [
      { value: 1, label: '未开始' },
      { value: 2, label: '进行中' },
      { value: 3, label: '已结束' },
    ],
    communityPosts: [],
    communityLoading: false,
    communityError: null,
    showCommunitySection: false,
    permissions: null,
  },

  isFirstLoad: true,
  _redirectingToLogin: false,

  ensureLoggedIn(activityId) {
    if (auth.isLoggedIn()) {
      this._redirectingToLogin = false;
      return true;
    }

    this.setData({
      loading: false,
      error: '请先登录后查看活动',
      activity: null,
      canEnroll: false,
      hasRegistered: false,
      hasPendingPayment: false,
      registrationStatusText: '',
      actionTipText: '',
      showAdminPanel: false,
      showCommunitySection: false,
      communityPosts: [],
      communityLoading: false,
      communityError: null,
    });

    if (this._redirectingToLogin) {
      return false;
    }

    this._redirectingToLogin = true;
    const redirectUrl = tenant.appendTenantToUrl('/pages/activity-detail/activity-detail', {
      id: activityId,
    });
    wx.showToast({ title: '请先登录后查看活动', icon: 'none' });
    setTimeout(() => {
      wx.navigateTo({
        url: tenant.appendTenantToUrl('/pages/login/login', { redirect: redirectUrl }),
      });
    }, 300);
    return false;
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    const activityId = options.id;
    if (!activityId) {
      this.setData({ error: '参数错误', loading: false });
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    let statusBarHeight = 0;
    try {
      const systemInfo = typeof wx.getSystemInfoSync === 'function'
        ? wx.getSystemInfoSync()
        : null;
      statusBarHeight = systemInfo && systemInfo.statusBarHeight ? systemInfo.statusBarHeight : 0;
    } catch (_) {
      statusBarHeight = 0;
    }

    this.setData({
      activityId,
      statusBarHeight,
    });
    if (!this.ensureLoggedIn(activityId)) return;
    this.setData({ isAdmin: auth.isAdmin() });
    this.loadActivity(activityId);
  },

  onShow() {
    // 从编辑页返回时刷新数据（首次加载跳过）
    if (this.isFirstLoad) {
      this.isFirstLoad = false;
      return;
    }
    if (this.data.activityId) {
      if (!this.ensureLoggedIn(this.data.activityId)) return;
      this.setData({ isAdmin: auth.isAdmin() });
      this.loadActivity(this.data.activityId);
    }
  },

  onBack() {
    wx.navigateBack();
  },

  onMore() {
    const activity = this.data.activity || {};
    const sharePath = tenant.appendTenantToUrl('/pages/activity-detail/activity-detail', {
      id: this.data.activityId,
    });
    wx.showActionSheet({
      itemList: ['复制活动链接', '分享活动标题'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.setClipboardData({
            data: sharePath,
            success: () => wx.showToast({ title: '链接已复制', icon: 'none' }),
          });
          return;
        }
        wx.showToast({
          title: activity.activity_name ? '请使用右上角分享' : '可通过分享功能转发',
          icon: 'none',
        });
      },
    });
  },

  loadActivity(activityId) {
    this.setData({ loading: true, error: null, posterLoadFailed: false });
    const tasks = [api.getActivity(activityId), api.getActivityPermissions(activityId)];
    if (auth.isUser()) {
      tasks.push(api.getMyParticipantActivities(activityId));
    }

    Promise.all(tasks)
      .then(async ([activity, permissions, registrationRes]) => {
        const registration = registrationRes && registrationRes.items && registrationRes.items[0]
          ? registrationRes.items[0]
          : null;
        const isPendingPayment = !!registration && Number(registration.payment_status) === 1;
        const hasRegistered = !!registration && !isPendingPayment;
        const canEnroll = activity.status === 1 || activity.status === 2;
        const showAdminPanel = !!(permissions && permissions.can_manage);
        const showCommunitySection = showAdminPanel || hasRegistered;
        const statusText = activity.status === 1 ? '未开始' : activity.status === 2 ? '进行中' : '已结束';
        const startDisplay = activity.start_time ? this.formatTime(activity.start_time) : '';
        const endDisplay = activity.end_time ? this.formatTime(activity.end_time) : '';
        const joinMethodDisplay = this.resolveJoinMethod(activity);
        let actionTipText = '';
        if (isPendingPayment) {
          actionTipText = '报名处理中，请稍后刷新';
        } else if (hasRegistered) {
          actionTipText = registration.enroll_status === 2 ? '您已在候补中' : '您已报名该活动';
        } else if (auth.isSuperAdmin()) {
          actionTipText = '超级管理员账号不可直接报名';
        } else if (!canEnroll) {
          actionTipText = '活动已结束，无法报名';
        }

        const posterUrl = await image.resolveDisplayUrl(activity.poster_url) || '/assets/defaultbg.webp';
        const detailParagraphs = this.buildDetailParagraphs(activity.activity_intro);
        const infoRows = this.buildInfoRows(activity, startDisplay, endDisplay, joinMethodDisplay);
        const heroKicker = this.resolveHeroKicker(activity);
        const heroSummary = this.resolveHeroSummary(activity);

        this.setData({
          activity: {
            ...activity,
            poster_url: posterUrl,
            status_text: statusText,
            start_display: startDisplay,
            end_display: endDisplay,
            join_method_display: joinMethodDisplay,
            hero_kicker: heroKicker,
            hero_summary: heroSummary,
            poster_fallback_title: 'FUTURE DESIGN',
            poster_fallback_summary: heroSummary,
            detail_paragraphs: detailParagraphs,
            info_rows: infoRows,
          },
          hasPendingPayment: isPendingPayment,
          canEnroll: canEnroll && !hasRegistered && !isPendingPayment && !auth.isSuperAdmin(),
          hasRegistered,
          registrationStatusText: hasRegistered
            ? (registration.enroll_status === 2 ? '候补中' : '已报名')
            : (isPendingPayment ? '报名处理中' : ''),
          actionTipText,
          showCommunitySection,
          showAdminPanel,
          permissions: permissions || null,
          loading: false,
        });
        if (showCommunitySection) {
          this.loadCommunityPreview(activity.id);
        } else {
          this.setData({
            communityPosts: [],
            communityLoading: false,
            communityError: null,
          });
        }
      })
      .catch(() => {
        this.setData({
          error: '加载失败',
          loading: false,
        });
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
  },

  onPosterLoad() {
    if (this.data.posterLoadFailed) {
      this.setData({ posterLoadFailed: false });
    }
  },

  onPosterError() {
    this.setData({ posterLoadFailed: true });
    wx.showToast({
      title: '海报加载失败，请检查图片域名配置',
      icon: 'none',
      duration: 2500,
    });
  },

  async loadCommunityPreview(activityId) {
    this.setData({ communityLoading: true, communityError: null });
    try {
      const result = await api.getCommunityPosts(activityId, { limit: 3 });
      this.setData({
        communityPosts: (result.items || []).map((item) => ({
          ...item,
          images: (() => {
            const parsed = contentUtils.parsePostContent(item.content);
            const blockImages = (parsed.blocks || [])
              .filter((block) => block.type === 'images')
              .flatMap((block) => block.images || []);
            const mergedImages = blockImages.length ? blockImages : (item.images || []);
            return mergedImages.map((url) => api.getImageUrl(url));
          })(),
          create_time_display: this.formatDate(item.create_time),
        })),
        communityLoading: false,
      });
    } catch (err) {
      this.setData({
        communityLoading: false,
        communityError: err.message || '加载活动动态失败',
      });
    }
  },

  buildDetailParagraphs(activityIntro) {
    const fallback = [
      '当人工智能不断创造，设计的边界正在被重新定义。',
      '我们将一起思考：在未来，设计师的价值是什么？我们应该创造什么？',
    ];
    const rawLines = String(activityIntro || '')
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!rawLines.length) {
      return fallback;
    }
    return rawLines;
  },

  buildInfoRows(activity, startDisplay, endDisplay, joinMethodDisplay) {
    const locationText = activity.location || '线上活动';
    const capacityText = activity.max_participants && Number(activity.max_participants) > 0
      ? `限定 ${activity.max_participants} 人`
      : '';
    return [
      {
        label: '时间',
        start_value: startDisplay || '--',
        end_value: endDisplay || '--',
      },
      { label: '地点', value: locationText },
      {
        label: '参与方式',
        value: capacityText ? `${joinMethodDisplay} ｜ ${capacityText}` : joinMethodDisplay,
      },
    ];
  },

  resolveHeroKicker(activity) {
    return activity.activity_type_name || activity.tag || '';
  },

  resolveHeroSummary(activity) {
    const intro = String(activity.activity_intro || '').trim();
    if (!intro) {
      return '重新理解人与技术的关系';
    }
    const lines = intro.split(/\r?\n+/).map((line) => line.trim()).filter(Boolean);
    if (lines.length > 0) {
      const firstLine = lines[0];
      if (firstLine.length <= 28) {
        return firstLine;
      }
      return `${firstLine.slice(0, 28)}…`;
    }
    return '重新理解人与技术的关系';
  },

  formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const weekMap = ['日', '一', '二', '三', '四', '五', '六'];
    const week = weekMap[d.getDay()];
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${m}.${day} 周${week} ${h}:${min}`;
  },

  formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}.${m}.${day}`;
  },

  resolveJoinMethod(activity) {
    const locationText = (activity.location || '').toLowerCase();
    if (!locationText || locationText.includes('线上') || locationText.includes('online')) {
      return '线上参与';
    }
    return '线下参与';
  },

  goRegister() {
    const activity = this.data.activity;
    if (!activity || (!this.data.canEnroll && !this.data.hasPendingPayment)) return;
    // 只传递活动 ID，避免 URL 过长
    wx.navigateTo({
      url: tenant.appendTenantToUrl('/pages/register/register', { id: activity.id }),
    });
  },

  onPrimaryAction() {
    this.goRegister();
  },

  onBackFromRegister() {
    const pages = getCurrentPages();
    const prev = pages[pages.length - 2];
    if (prev && prev.route === 'pages/index/index' && prev.load) {
      prev.load();
    }
  },

  // 管理员功能
  onViewParticipants() {
    if (!this.data.permissions || !this.data.permissions.can_view_participants) {
      wx.showToast({ title: '当前账号无报名查看权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: tenant.appendTenantToUrl('/pages/activity-participants/activity-participants', { id: this.data.activityId }) });
  },

  onViewCheckins() {
    if (!this.data.permissions || !this.data.permissions.can_manage_checkins) {
      wx.showToast({ title: '当前账号无签到管理权限', icon: 'none' });
      return;
    }
    const name = this.data.activity.activity_name;
    wx.navigateTo({ url: tenant.appendTenantToUrl('/pages/activity-checkins/activity-checkins', { id: this.data.activityId, name }) });
  },

  onViewStatistics() {
    if (!this.data.permissions || !this.data.permissions.can_view_statistics) {
      wx.showToast({ title: '当前账号无统计查看权限', icon: 'none' });
      return;
    }
    const name = this.data.activity.activity_name;
    wx.navigateTo({ url: tenant.appendTenantToUrl('/pages/activity-statistics/activity-statistics', { id: this.data.activityId, name }) });
  },

  onChangeStatus() {
    if (!this.data.permissions || !this.data.permissions.can_edit) {
      wx.showToast({ title: '当前账号无活动编辑权限', icon: 'none' });
      return;
    }
    const currentStatus = this.data.activity.status;
    const items = this.data.statusOptions.map((s) => s.label);

    wx.showActionSheet({
      itemList: items,
      success: async (res) => {
        const newStatus = this.data.statusOptions[res.tapIndex].value;
        if (newStatus === currentStatus) {
          wx.showToast({ title: '当前已是该状态', icon: 'none' });
          return;
        }
        try {
          await api.updateActivityStatus(this.data.activityId, newStatus);
          wx.showToast({ title: '状态更新成功', icon: 'success' });
          this.loadActivity(this.data.activityId);
        } catch (err) {
          wx.showToast({ title: err.message || '更新失败', icon: 'none' });
        }
      },
    });
  },

  onEditActivity() {
    if (!this.data.permissions || !this.data.permissions.can_edit) {
      wx.showToast({ title: '当前账号无活动编辑权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: tenant.appendTenantToUrl('/pages/edit-activity/edit-activity', { id: this.data.activityId }) });
  },

  onViewCommunityList() {
    const activity = this.data.activity || {};
    wx.navigateTo({
      url: tenant.appendTenantToUrl('/pages/community-post-list/community-post-list', {
        activityId: this.data.activityId,
        activityName: activity.activity_name || '',
      }),
    });
  },

  onViewCommunityPost(e) {
    const postId = e.currentTarget.dataset.id;
    if (!postId) return;
    wx.navigateTo({
      url: tenant.appendTenantToUrl('/pages/community-post-detail/community-post-detail', { id: postId }),
    });
  },

  onCreateCommunityPost() {
    const activity = this.data.activity || {};
    wx.navigateTo({
      url: tenant.appendTenantToUrl('/pages/community-post-create/community-post-create', {
        activityId: this.data.activityId,
        activityName: activity.activity_name || '',
      }),
    });
  },

  onDeleteActivity() {
    if (!this.data.permissions || !this.data.permissions.can_delete) {
      wx.showToast({ title: '当前账号无活动删除权限', icon: 'none' });
      return;
    }
    const activity = this.data.activity;
    wx.showModal({
      title: '确认删除',
      content: `确定要删除活动"${activity.activity_name}"吗？此操作不可撤销。`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await api.deleteActivity(this.data.activityId);
            wx.showToast({ title: '删除成功', icon: 'success' });
            setTimeout(() => wx.navigateBack(), 1500);
          } catch (err) {
            wx.showToast({ title: err.message || '删除失败', icon: 'none' });
          }
        }
      },
    });
  },

  onShareAppMessage() {
    const activity = this.data.activity || {};
    return {
      title: activity.activity_name || '活动详情',
      path: tenant.appendTenantToUrl('/pages/activity-detail/activity-detail', { id: this.data.activityId }),
    };
  },
});
