const api = require('../../utils/api');
const auth = require('../../utils/auth');
const tenant = require('../../utils/tenant');
const contentUtils = require('../../utils/community-content');

function decodeDisplayText(value) {
  const text = value == null ? '' : String(value);
  if (!text) return '';
  try {
    return decodeURIComponent(text);
  } catch (_) {
    return text;
  }
}

// 估计卡片高度(单位:px 近似)—— 用于矮列优先分列
// 真实高度在小程序里是 layout-after,这里只能粗估,真实显示时容器 flex 会按内容自适应
function estimateCardHeight(post) {
  let h = 0;
  // 标题行(固定 ~50)
  h += 50;
  // 摘要(按 100 字折 1 行 = 30px,最多 6 行 = 180)
  const summary = (post.content_summary || '').length;
  h += Math.min(180, Math.ceil(summary / 18) * 30);
  // 图片(0 张 = 0;1 张 = 200;2-3 张 = 140;4+ = 200)
  const imgCount = (post.images || []).length;
  if (imgCount === 1) h += 200;
  else if (imgCount <= 3) h += 140;
  else if (imgCount >= 4) h += 220;
  // 底部 meta(40)
  h += 40;
  // 间距(20)
  h += 20;
  return h;
}

// 矮列优先分列算法:把 posts 分到两列,两列累计高度差尽量小
function splitIntoColumns(posts) {
  const colA = [];
  const colB = [];
  let hA = 0;
  let hB = 0;
  (posts || []).forEach((post) => {
    const h = estimateCardHeight(post);
    if (hA <= hB) {
      colA.push(post);
      hA += h;
    } else {
      colB.push(post);
      hB += h;
    }
  });
  return { colA, colB };
}

Page({
  data: {
    channelId: null,
    channelName: '',
    channelRole: 'member',
    posts: [],
    colA: [],
    colB: [],
    loading: true,
    error: null,
    showCreateButton: true,
  },

  resolvePageState() {
    this.setData({
      showCreateButton: auth.isUser() || auth.isAdmin(),
    });
  },

  onLoad(options) {
    tenant.applyPageOptions(options);
    const channelId = Number(options.channelId || 0);
    if (!channelId) {
      this.setData({ loading: false, error: '缺少频道参数' });
      return;
    }
    this.setData({
      channelId,
      channelName: decodeDisplayText(options.channelName),
      channelRole: decodeDisplayText(options.channelRole || 'member'),
    });
    this.resolvePageState();
    this.loadPosts();
  },

  onShow() {
    if (this.data.channelId) {
      this.resolvePageState();
      this.loadPosts();
    }
  },

  async loadPosts() {
    this.setData({ loading: true, error: null });
    try {
      const result = await api.getCommunityChannelPosts(this.data.channelId, { limit: 100 });
      const posts = (result.items || []).map((item) => {
        // Phase 2 A 方案: 新帖子 content 是 HTML 字符串
        const raw = item.content || '';
        const isHtml = /<\/?(p|div|span|img|br|strong|em|h[1-6]|ul|ol|li|blockquote|a)\b/i.test(raw);
        let textSummary = '';
        let images = [];
        if (isHtml) {
          textSummary = this._htmlToText(raw).slice(0, 240);
          const matches = raw.match(/<img[^>]+src=["']([^"']+)["']/gi) || [];
          images = matches
            .map((m) => { const r = m.match(/src=["']([^"']+)["']/i); return r ? r[1] : null; })
            .filter(Boolean);
        } else {
          // 兼容老 block JSON
          const parsed = contentUtils.parsePostContent(raw);
          textSummary = (parsed.text || '').trim().slice(0, 240);
          const blockImages = (parsed.blocks || [])
            .filter((block) => block.type === 'images')
            .flatMap((block) => block.images || []);
          images = blockImages.length ? blockImages : (item.images || []);
        }
        if (!textSummary) textSummary = images.length ? '图片动态' : '';
        return {
          ...item,
          content_summary: textSummary,
          images: images.map((url) => api.getImageUrl(url)),
          create_time_display: this.formatTime(item.create_time),
        };
      });

      // 矮列优先分列
      const { colA, colB } = splitIntoColumns(posts);
      this.setData({ posts, colA, colB, loading: false });
    } catch (err) {
      this.setData({
        loading: false,
        error: err.message || '加载频道动态失败',
        posts: [],
        colA: [],
        colB: [],
      });
    }
  },

  _htmlToText(html) {
    if (!html) return '';
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  },

  formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}.${m}.${day}`;
  },

  onOpenPost(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: tenant.appendTenantToUrl('/pages/community-post-detail/community-post-detail', {
        id,
        channelId: this.data.channelId,
      }),
    });
  },

  onCreatePost() {
    wx.navigateTo({
      url: tenant.appendTenantToUrl('/pages/community-post-create/community-post-create', {
        channelId: this.data.channelId,
        channelName: this.data.channelName,
        channelRole: this.data.channelRole,
      }),
    });
  },
});
