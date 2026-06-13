const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');
const { resolveAvatarDisplayUrl, getDefaultAvatarPath } = require('../../utils/avatar');

function decodeDisplayText(value) {
  const text = value == null ? '' : String(value);
  if (!text) return '';
  try {
    return decodeURIComponent(text);
  } catch (_) {
    return text;
  }
}

function formatJoinedDisplay(member) {
  const joinedAt = member.joined_at || member.create_time || '';
  if (!joinedAt) return 'Joined --';
  return `Joined ${String(joinedAt).replace('T', ' ').slice(0, 10)}`;
}

function buildAvatarStyle(member) {
  const palette = [
    'radial-gradient(circle at 28% 28%, #1a1a1a 0%, #595959 42%, #e8e6e3 100%)',
    'radial-gradient(circle at 28% 28%, #242424 0%, #6a6a6a 42%, #efeeeb 100%)',
    'radial-gradient(circle at 28% 28%, #111111 0%, #4b4b4b 42%, #f1efec 100%)',
  ];
  const seed = Number(member.user_id || member.id || 0);
  return palette[Math.abs(seed) % palette.length];
}

Page({
  data: {
    channelId: 0,
    channelName: '',
    channelRole: 'member',
    channelMemberCount: 0,
    members: [],
    loading: true,
    error: null,
    inviting: false,
    deleting: false,
    refreshing: false,
    showInviteButton: false,
    showDeleteButton: false,
  },

  resolvePageState() {
    const canManage = this.data.channelRole === 'admin';
    this.setData({
      showInviteButton: canManage,
      showDeleteButton: canManage,
    });
  },

  normalizeMember(member) {
    const role = String(member.role || 'member');
    const status = String(member.status || 'active');
    const currentUserId = auth.getUserId();
    const isSelf = currentUserId != null && Number(member.user_id) === Number(currentUserId);
    return {
      ...member,
      role_label: role === 'admin' ? '管理员' : '成员',
      status_label: status === 'active'
        ? '正常'
        : (status === 'banned'
          ? '禁言'
          : (status === 'kicked' ? '已移出' : status)),
      joined_display: formatJoinedDisplay(member),
      avatarDisplayUrl: member.avatarDisplayUrl || getDefaultAvatarPath(),
      avatarStyle: buildAvatarStyle(member),
      avatarText: member.user_name ? String(member.user_name).slice(0, 1) : '人',
      can_action: this.data.channelRole === 'admin' && !isSelf && status !== 'kicked',
      can_kick: this.data.channelRole === 'admin' && !isSelf && status !== 'kicked',
    };
  },

  refreshMemberFlags() {
    this.setData({
      members: (this.data.members || []).map((member) => this.normalizeMember(member)),
    });
  },

  async loadChannelDetail() {
    if (!this.data.channelId) return;
    try {
      const detail = await api.getCommunityChannelDetail(this.data.channelId);
      this.setData({
        channelName: detail.name || this.data.channelName,
        channelRole: detail.role || this.data.channelRole,
        channelMemberCount: Number(detail.member_count || 0),
      });
      this.resolvePageState();
      this.refreshMemberFlags();
    } catch (err) {
      wx.showToast({ title: err.message || '加载社区信息失败', icon: 'none' });
    }
  },

  async loadMembers() {
    if (!this.data.channelId) return;
    this.setData({ loading: true, error: null, refreshing: true });
    try {
      const result = await api.getCommunityChannelMembers(this.data.channelId, { limit: 200 });
      const members = await Promise.all((result.items || []).map(async (item) => {
        const avatarDisplayUrl = await this.resolveAvatar(item.avatar_url);
        return this.normalizeMember({
          ...item,
          avatarDisplayUrl,
        });
      }));
      this.setData({
        members,
        channelMemberCount: Number(result.total || members.length || 0),
        loading: false,
      });
      this.resolvePageState();
    } catch (err) {
      this.setData({
        loading: false,
        error: err.message || '加载成员列表失败',
      });
    } finally {
      this.setData({ refreshing: false });
      if (typeof wx.stopPullDownRefresh === 'function') {
        wx.stopPullDownRefresh();
      }
    }
  },

  async resolveAvatar(avatarUrl) {
    try {
      return await resolveAvatarDisplayUrl(avatarUrl);
    } catch (_) {
      return getDefaultAvatarPath();
    }
  },

  onLoad(options) {
    tenant.applyPageOptions(options);

    const channelId = Number(options.channelId || 0);
    if (!channelId) {
      this.setData({ loading: false, error: '缺少社区参数' });
      return;
    }

    this.setData({
      channelId,
      channelName: decodeDisplayText(options.channelName),
      channelRole: decodeDisplayText(options.channelRole || 'member'),
    });
    this.resolvePageState();
    this.loadChannelDetail();
    this.loadMembers();
  },

  onShow() {
    if (!this.data.channelId) return;
    this.resolvePageState();
  },

  onPullDownRefresh() {
    Promise.all([this.loadChannelDetail(), this.loadMembers()]);
  },

  async onInviteMembers() {
    if (!this.data.showInviteButton) {
      wx.showToast({ title: '仅社区管理员可邀请成员', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: tenant.appendTenantToUrl('/pages/user-list/user-list', {
        mode: 'picker',
        title: '选择邀请成员',
        confirm_text: '邀请并发送',
        hint: '从用户列表中勾选要邀请到当前社区的成员。',
      }),
      success: (res) => {
        const eventChannel = res && res.eventChannel;
        if (!eventChannel || typeof eventChannel.on !== 'function') return;
        eventChannel.on('selected-users', async (payload) => {
          const userIds = Array.from(new Set(
            ((payload && payload.user_ids) || [])
              .map((item) => Number(item))
              .filter((item) => Number.isInteger(item) && item > 0),
          ));
          if (!userIds.length) return;
          this.setData({ inviting: true });
          try {
            const result = await api.inviteCommunityChannelMembers(this.data.channelId, userIds);
            wx.showToast({ title: `已邀请 ${result.invited_count || userIds.length} 人`, icon: 'success' });
            await this.loadChannelDetail();
            await this.loadMembers();
          } catch (err) {
            wx.showToast({ title: err.message || '邀请失败', icon: 'none' });
          } finally {
            this.setData({ inviting: false });
          }
        });
      },
    });
  },

  onDeleteChannel() {
    if (!this.data.showDeleteButton) {
      wx.showToast({ title: '仅社区管理员可删除社区', icon: 'none' });
      return;
    }
    if (this.data.deleting) return;

    wx.showModal({
      title: '删除社区',
      content: `确定要删除「${this.data.channelName || '当前社区'}」吗？删除后该社区的所有帖子和评论都会一起清空，且无法恢复。`,
      confirmText: '删除',
      confirmColor: '#d92d20',
      success: async (res) => {
        if (!res.confirm) return;
        this.setData({ deleting: true });
        try {
          wx.showLoading({ title: '删除中…', mask: true });
          await api.deleteCommunityChannel(this.data.channelId);
          wx.hideLoading();
          const app = typeof getApp === 'function' ? getApp() : null;
          if (app && app.globalData) {
            app.globalData.channelListDirty = true;
          }
          wx.showToast({ title: '社区已删除', icon: 'success' });
          wx.navigateBack({ delta: 1 });
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: err.message || '删除失败', icon: 'none' });
        } finally {
          this.setData({ deleting: false });
        }
      },
    });
  },

  async performMemberAction(member, action) {
    if (!member || !member.user_id) return;
    if (!this.data.showInviteButton) {
      wx.showToast({ title: '仅社区管理员可操作成员', icon: 'none' });
      return;
    }

    const actionMap = {
      kick: {
        title: '删除成员',
        content: `确定要将「${member.user_name || member.user_id}」从社区中删除吗？`,
        run: () => api.kickCommunityChannelMember(this.data.channelId, member.user_id),
      },
    };

    const config = actionMap[action];
    if (!config) return;

    wx.showModal({
      title: config.title,
      content: config.content,
      success: async (res) => {
        if (!res.confirm) return;
        try {
          wx.showLoading({ title: '处理中…', mask: true });
          await config.run();
          wx.hideLoading();
          wx.showToast({ title: '操作成功', icon: 'success' });
          await this.loadChannelDetail();
          await this.loadMembers();
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: err.message || '操作失败', icon: 'none' });
        }
      },
    });
  },

  onMemberMore(e) {
    const member = e.currentTarget.dataset.member;
    if (!member) return;
    if (!this.data.showInviteButton) {
      wx.showToast({ title: '仅社区管理员可操作成员', icon: 'none' });
      return;
    }

    const itemList = [];
    const actionMap = [];

    if (member.can_kick) {
      itemList.push('删除成员');
      actionMap.push('kick');
    }

    if (itemList.length === 0) {
      wx.showToast({ title: '暂无可执行操作', icon: 'none' });
      return;
    }

    wx.showActionSheet({
      itemList,
      success: (res) => {
        const action = actionMap[Number(res.tapIndex)];
        if (action) {
          this.performMemberAction(member, action);
        }
      },
    });
  },
});
