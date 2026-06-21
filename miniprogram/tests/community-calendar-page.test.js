const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadPage(pageRelativePath, moduleMap, wxOverrides = {}) {
  let pageConfig = null;
  global.Page = (config) => {
    pageConfig = config;
  };
  global.wx = {
    showToast() {},
    navigateTo() {},
    showLoading() {},
    hideLoading() {},
    chooseMedia() {},
    ...wxOverrides,
  };
  global.getApp = () => ({ globalData: {} });

  const pagePath = require.resolve(pageRelativePath);
  const pageDir = path.dirname(pagePath);
  moduleMap.forEach(([modulePath, exportsValue]) => {
    const resolvedPath = path.resolve(pageDir, modulePath);
    delete require.cache[resolvedPath];
    require.cache[resolvedPath] = {
      id: resolvedPath,
      filename: resolvedPath,
      loaded: true,
      exports: exportsValue,
    };
  });

  delete require.cache[pagePath];
  require(pagePath);
  return pageConfig;
}

function createPageInstance(config, initialData = {}) {
  const instance = {
    data: {
      ...config.data,
      ...initialData,
    },
    setData(update) {
      this.data = { ...this.data, ...update };
    },
  };
  Object.keys(config).forEach((key) => {
    if (key !== 'data') instance[key] = config[key];
  });
  return instance;
}

test('社区动态页可跳转到社区日历', () => {
  let navigatedUrl = '';
  const pageConfig = loadPage('../pages/community-post-list/community-post-list.js', [
    ['../../utils/api.js', {
      getCommunityChannelPosts: async () => ({ items: [], total: 0 }),
      getCommunityChannelAnnouncementSummary: async () => ({ total: 0 }),
      getCommunityChannelDetail: async () => ({ name: '测试社区', role: 'member', member_count: 1 }),
    }],
    ['../../utils/auth.js', { isUser: () => true, isAdmin: () => false }],
    ['../../utils/tenant.js', {
      applyPageOptions() {},
      appendTenantToUrl: (url, params = {}) => {
        const query = Object.keys(params)
          .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`)
          .join('&');
        return query ? `${url}?${query}` : url;
      },
    }],
    ['../../utils/community-content.js', { parsePostContent: () => ({ text: '', blocks: [] }) }],
    ['../../utils/avatar.js', { resolveAvatarDisplayUrl: async () => '/avatar.png', getDefaultAvatarPath: () => '/default-avatar.png' }],
  ], {
    navigateTo({ url }) {
      navigatedUrl = url;
    },
  });

  const page = createPageInstance(pageConfig, {
    channelId: 8,
    channelName: '测试社区',
    channelRole: 'admin',
  });
  page.onOpenCalendar();
  assert.match(navigatedUrl, /\/pages\/community-calendar\/community-calendar/);
});

test('社区日历页 onLoad 会拉取月汇总和事件列表', async () => {
  let summaryCalled = 0;
  let listCalled = 0;
  const pageConfig = loadPage('../pages/community-calendar/community-calendar.js', [
    ['../../utils/api.js', {
      getCommunityChannelCalendarMonthSummary: async () => {
        summaryCalled += 1;
        return {
          year: 2026,
          month: 6,
          total: 2,
          day_counts: [
            { date: '2026-06-21', count: 1 },
            { date: '2026-06-22', count: 1 },
          ],
          latest: {
            id: 2,
            title: '最近事件',
            start_time: '2026-06-22T09:00:00.000Z',
          },
        };
      },
      getCommunityChannelCalendarEvents: async () => {
        listCalled += 1;
        return {
          items: [
            {
              id: 1,
              title: '周六分享会',
              event_type: 'activity',
              start_time: '2026-06-21T10:00:00.000Z',
              end_time: '2026-06-21T12:00:00.000Z',
              location: '北京',
              activity_name: '活动 A',
              content: '说明',
            },
          ],
          total: 1,
        };
      },
    }],
    ['../../utils/tenant.js', { applyPageOptions() {}, appendTenantToUrl: (u) => u }],
  ]);

  const page = createPageInstance(pageConfig, {});
  page.onLoad({ channelId: '9', channelName: '测试社区', channelRole: 'member' });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(summaryCalled, 1);
  assert.equal(listCalled >= 2, true);
  assert.equal(page.data.total, 2);
  assert.deepEqual(page.data.eventDates, ['2026-06-21', '2026-06-22']);
  assert.equal(page.data.selectedEvents.length, 1);
  assert.equal(page.data.selectedEvents[0].title, '周六分享会');
});

test('社区日历点选日期会按 date 精确拉取当天全部事件', async () => {
  let dateCalled = 0;
  const pageConfig = loadPage('../pages/community-calendar/community-calendar.js', [
    ['../../utils/api.js', {
      getCommunityChannelCalendarMonthSummary: async () => ({
        year: 2026,
        month: 6,
        total: 2,
        day_counts: [{ date: '2026-06-21', count: 2 }],
        latest: null,
      }),
      getCommunityChannelCalendarEvents: async (_channelId, opts = {}) => {
        if (opts.date === '2026-06-21') {
          dateCalled += 1;
          return {
            items: [
              { id: 1, title: '上午分享', event_type: 'activity', start_time: '2026-06-21T09:00:00.000Z', end_time: null, location: '', activity_name: '' },
              { id: 2, title: '下午讨论', event_type: 'meeting', start_time: '2026-06-21T14:00:00.000Z', end_time: null, location: '', activity_name: '' },
            ],
            total: 2,
          };
        }
        return { items: [], total: 0 };
      },
    }],
    ['../../utils/tenant.js', { applyPageOptions() {}, appendTenantToUrl: (u) => u }],
  ]);

  const page = createPageInstance(pageConfig, {});
  page.onLoad({ channelId: '9', channelName: '测试社区', channelRole: 'member' });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  page.onSelectDate({ detail: { date: '2026-06-21' } });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(dateCalled >= 1, true);
  assert.equal(page.data.selectedEvents.length, 2);
  assert.equal(page.data.selectedEvents[0].title, '上午分享');
  assert.equal(page.data.selectedEvents[1].title, '下午讨论');
});

test('社区日历新建页会组装正确 payload', async () => {
  const pageConfig = loadPage('../pages/community-calendar-create/community-calendar-create.js', [
    ['../../utils/community-calendar-form.js', require('../utils/community-calendar-form')],
    ['../../utils/api.js', {
      uploadCommunityImage: async () => ({ url: '/uploads/community/calendar/cover.jpg' }),
      createCommunityChannelCalendarEvent: async () => ({ id: 1 }),
    }],
    ['../../utils/tenant.js', { applyPageOptions() {}, appendTenantToUrl: (u) => u }],
  ]);

  const page = createPageInstance(pageConfig, {
    channelId: 10,
    loading: false,
    title: '社区活动',
    eventTypeIndex: 0,
    eventTypeValue: 'activity',
    startDate: '2026-06-21',
    startTime: '10:00',
    endDate: '2026-06-21',
    endTime: '12:00',
    location: '北京',
    activityId: '99',
    content: '提前签到',
    coverUrl: '/uploads/community/calendar/cover.jpg',
  });

  page.validateForm = () => '';
  assert.deepEqual(page.buildPayload(), {
    title: '社区活动',
    event_type: 'activity',
    content: '提前签到',
    location: '北京',
    cover_url: '/uploads/community/calendar/cover.jpg',
    start_time: '2026-06-21T10:00:00',
    end_time: '2026-06-21T12:00:00',
    activity_id: 99,
  });
});

test('社区首页频道卡片可跳转到日历', () => {
  let navigatedUrl = '';
  const pageConfig = loadPage('../pages/community/index.js', [
    ['../../utils/api.js', {
      getCommunityChannels: async () => ({ items: [], total: 0 }),
      getCommunityNotificationUnreadCount: async () => ({ unread_count: 0 }),
    }],
    ['../../utils/auth.js', { isAdmin: () => true }],
    ['../../utils/tenant.js', {
      applyPageOptions() {},
      appendTenantToUrl: (url, params = {}) => {
        const query = Object.keys(params)
          .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`)
          .join('&');
        return query ? `${url}?${query}` : url;
      },
    }],
    ['../../utils/tab-bar.js', { syncTabBarSelected() {} }],
  ], {
    navigateTo({ url }) {
      navigatedUrl = url;
    },
  });

  const page = createPageInstance(pageConfig, {});
  page.onOpenChannelCalendar({
    currentTarget: {
      dataset: {
        channel: {
          id: 7,
          name: '测试社区',
          role: 'admin',
        },
      },
    },
  });

  assert.match(navigatedUrl, /\/pages\/community-calendar\/community-calendar/);
});
