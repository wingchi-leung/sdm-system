(function initCrawlerCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.TeamsCommunityCrawlerCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCrawlerCore() {
  function cleanText(value) {
    return String(value || '').replace(/\r\n/g, '\n').trim();
  }

  function matchesAuthor(author, filter) {
    const normalizedAuthor = cleanText(author).toLocaleLowerCase();
    const normalizedFilter = cleanText(filter).toLocaleLowerCase();
    return Boolean(normalizedAuthor && normalizedFilter && normalizedAuthor.includes(normalizedFilter));
  }

  function parseReplyCount(summary) {
    const text = cleanText(summary);
    const match = text.match(/(\d+)\s*(?:个答复|条回复)/);
    return match ? Number(match[1]) : 0;
  }

  function sanitizePathSegment(value) {
    const cleaned = cleanText(value)
      .replace(/[<>:"/\\|?*]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[.\s-]+|[.\s-]+$/g, '');
    return cleaned || '未命名社区';
  }

  function mergeImages(previousImages, currentImages) {
    const byKey = new Map();
    [...(previousImages || []), ...(currentImages || [])].forEach((image) => {
      if (!image) return;
      const key = cleanText(image.displayedUrl || image.originalUrl);
      if (!key) return;
      const oldImage = byKey.get(key) || {};
      byKey.set(key, {
        ...oldImage,
        ...image,
        displayedUrl: cleanText(image.displayedUrl || oldImage.displayedUrl),
        originalUrl: cleanText(image.originalUrl || oldImage.originalUrl),
      });
    });
    return Array.from(byKey.values());
  }

  function mergePost(previous, current) {
    if (!previous) return { ...current, images: mergeImages([], current.images) };
    const merged = { ...previous };
    Object.entries(current || {}).forEach(([key, value]) => {
      if (key === 'images') return;
      if (value !== '' && value !== null && value !== undefined) {
        merged[key] = value;
      }
    });
    merged.images = mergeImages(previous.images, current.images);
    return merged;
  }

  function escapeHtml(value) {
    return cleanText(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatTimestampForPath(isoTime) {
    const date = new Date(isoTime);
    if (Number.isNaN(date.getTime())) {
      throw new Error('导出时间格式无效');
    }
    const pad = (value) => String(value).padStart(2, '0');
    return [
      date.getUTCFullYear(),
      pad(date.getUTCMonth() + 1),
      pad(date.getUTCDate()),
      '-',
      pad(date.getUTCHours()),
      pad(date.getUTCMinutes()),
      pad(date.getUTCSeconds()),
    ].join('');
  }

  function buildMarkdown(raw) {
    const lines = [
      `# ${raw.community_name} Teams 社区导出`,
      '',
      `- 导出时间：${raw.exported_at}`,
      `- 作者筛选：包含 \`${raw.author_filter}\``,
      `- 主帖数量：${raw.posts.length}`,
      `- 回复数量：${raw.replies.length}`,
      '',
    ];

    raw.posts.forEach((post, index) => {
      lines.push(`## ${index + 1}. ${post.title || '无标题'}`);
      lines.push('');
      lines.push(`- 作者：${post.author}`);
      lines.push(`- 发布时间：${post.published_at || '未知'}`);
      lines.push(`- Teams 帖子 ID：${post.source_post_id}`);
      lines.push(`- 回复数：${post.reply_count || 0}`);
      lines.push('');
      if (post.text) {
        lines.push(post.text);
        lines.push('');
      }
      post.local_images.forEach((imagePath) => {
        lines.push(`![${post.title || post.source_post_id}](${imagePath})`);
        lines.push('');
      });
      });
    raw.replies.forEach((reply, index) => {
      lines.push(`## 回复 ${index + 1}. ${reply.parent_title || '未知主题'}`);
      lines.push('');
      lines.push(`- 作者：${reply.author}`);
      lines.push(`- 发布时间：${reply.published_at || '未知'}`);
      lines.push(`- Teams 回复 ID：${reply.source_reply_id}`);
      lines.push(`- 所属主帖：${reply.parent_title || reply.source_parent_post_id}`);
      lines.push(`- 主帖作者：${reply.parent_author || '未知'}`);
      lines.push('');
      if (reply.text) {
        lines.push(reply.text);
        lines.push('');
      }
      reply.local_images.forEach((imagePath) => {
        lines.push(`![回复图片](${imagePath})`);
        lines.push('');
      });
    });
    return lines.join('\n');
  }

  function buildExportBundle({ communityName, authorFilter, exportedAt, posts, replies = [] }) {
    const folderName = `${sanitizePathSegment(communityName)}-${formatTimestampForPath(exportedAt)}`;
    const imageTasks = [];
    const rawPosts = (posts || []).map((post, postIndex) => {
      const postNumber = String(postIndex + 1).padStart(3, '0');
      const safeId = sanitizePathSegment(post.id || String(postIndex + 1));
      const localImages = (post.images || []).map((image, imageIndex) => {
        const imageNumber = String(imageIndex + 1).padStart(2, '0');
        const filename = `images/${postNumber}-${safeId}-${imageNumber}.jpg`;
        imageTasks.push({
          filename,
          originalUrl: cleanText(image.originalUrl),
          displayedUrl: cleanText(image.displayedUrl),
          postId: String(post.id || ''),
          imageIndex: imageIndex + 1,
        });
        return filename;
      });

      return {
        source: 'microsoft_teams_community',
        source_url: 'https://teams.live.com/v2/',
        source_post_id: String(post.id || ''),
        author: cleanText(post.author),
        published_at: cleanText(post.publishedAt),
        displayed_time: cleanText(post.displayedTime),
        title: cleanText(post.title),
        text: cleanText(post.text),
        reply_count: Number(post.replyCount || 0),
        reply_summary: cleanText(post.replySummary),
        local_images: localImages,
        source_images: (post.images || []).map((image) => ({
          original_url: cleanText(image.originalUrl),
          displayed_url: cleanText(image.displayedUrl),
          natural_width: Number(image.naturalWidth || 0),
          natural_height: Number(image.naturalHeight || 0),
        })),
      };
    });
    const rawReplies = (replies || []).map((reply, replyIndex) => {
      const replyNumber = String(replyIndex + 1).padStart(3, '0');
      const safeId = sanitizePathSegment(reply.id || String(replyIndex + 1));
      const localImages = (reply.images || []).map((image, imageIndex) => {
        const imageNumber = String(imageIndex + 1).padStart(2, '0');
        const filename = `reply-images/${replyNumber}-${safeId}-${imageNumber}.jpg`;
        imageTasks.push({
          filename,
          originalUrl: cleanText(image.originalUrl),
          displayedUrl: cleanText(image.displayedUrl),
          postId: String(reply.parentPostId || ''),
          replyId: String(reply.id || ''),
          imageIndex: imageIndex + 1,
        });
        return filename;
      });
      return {
        source: 'microsoft_teams_community',
        source_url: 'https://teams.live.com/v2/',
        source_reply_id: String(reply.id || ''),
        source_parent_post_id: String(reply.parentPostId || ''),
        parent_title: cleanText(reply.parentTitle),
        parent_author: cleanText(reply.parentAuthor),
        author: cleanText(reply.author),
        published_at: cleanText(reply.publishedAt),
        displayed_time: cleanText(reply.displayedTime),
        text: cleanText(reply.text),
        local_images: localImages,
        source_images: (reply.images || []).map((image) => ({
          original_url: cleanText(image.originalUrl),
          displayed_url: cleanText(image.displayedUrl),
          natural_width: Number(image.naturalWidth || 0),
          natural_height: Number(image.naturalHeight || 0),
        })),
      };
    });

    const raw = {
      schema_version: 1,
      source: 'microsoft_teams_community',
      source_url: 'https://teams.live.com/v2/',
      community_name: cleanText(communityName),
      author_filter: cleanText(authorFilter),
      exported_at: exportedAt,
      posts: rawPosts,
      replies: rawReplies,
    };

    const toDraft = (entry, entryType) => {
      const isReply = entryType === 'reply';
      const contentText = entry.text || (isReply ? `回复：${entry.parent_title || '未知主题'}` : entry.title);
      const content = contentText
        .split(/\n+/)
        .filter(Boolean)
        .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
        .join('');
      return {
        entry_type: entryType,
        source: entry.source,
        source_post_id: isReply ? undefined : entry.source_post_id,
        source_reply_id: isReply ? entry.source_reply_id : undefined,
        source_parent_post_id: isReply ? entry.source_parent_post_id : undefined,
        original_author_name: entry.author,
        original_published_at: entry.published_at,
        title: isReply ? `回复｜${entry.parent_title || '未知主题'}` : entry.title || '无标题',
        content,
        content_format: 'html',
        images: entry.local_images,
        status: 'draft',
      };
    };
    const miniprogram = {
      schema_version: 1,
      description: 'SDM 小程序社区帖子导入草稿；图片上传后需将本地路径替换为服务端 URL。',
      community_name: raw.community_name,
      posts: [
        ...rawPosts.map((post) => toDraft(post, 'post')),
        ...rawReplies.map((reply) => toDraft(reply, 'reply')),
      ],
    };

    return {
      folderName,
      imageTasks,
      raw,
      miniprogram,
      markdown: buildMarkdown(raw),
    };
  }

  return {
    buildExportBundle,
    matchesAuthor,
    mergePost,
    parseReplyCount,
    sanitizePathSegment,
  };
});
