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

  function buildPostFolder(title, postId) {
    const safeTitle = sanitizePathSegment(title || '无标题').slice(0, 80).replace(/[.\s-]+$/g, '') || '无标题';
    const safeId = sanitizePathSegment(postId || '未知ID');
    return `posts/${safeTitle}-${safeId}`;
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
      const postId = String(post.id || postIndex + 1);
      const postFolder = buildPostFolder(post.title, postId);
      const localImages = (post.images || []).map((image, imageIndex) => {
        const imageNumber = String(imageIndex + 1).padStart(2, '0');
        const filename = `${postFolder}/images/${imageNumber}.jpg`;
        imageTasks.push({
          filename,
          originalUrl: cleanText(image.originalUrl),
          displayedUrl: cleanText(image.displayedUrl),
          postId,
          imageIndex: imageIndex + 1,
        });
        return filename;
      });

      return {
        source: 'microsoft_teams_community',
        source_url: 'https://teams.live.com/v2/',
        source_post_id: postId,
        author: cleanText(post.author),
        published_at: cleanText(post.publishedAt),
        displayed_time: cleanText(post.displayedTime),
        title: cleanText(post.title),
        text: cleanText(post.text),
        reply_count: Number(post.replyCount || 0),
        reply_summary: cleanText(post.replySummary),
        local_folder: postFolder,
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
      const replyId = String(reply.id || replyIndex + 1);
      const parentPostId = String(reply.parentPostId || '未知ID');
      const parentFolder = buildPostFolder(reply.parentTitle, parentPostId);
      const replyFolder = `${parentFolder}/replies/${sanitizePathSegment(replyId)}`;
      const localImages = (reply.images || []).map((image, imageIndex) => {
        const imageNumber = String(imageIndex + 1).padStart(2, '0');
        const filename = `${replyFolder}/images/${imageNumber}.jpg`;
        imageTasks.push({
          filename,
          originalUrl: cleanText(image.originalUrl),
          displayedUrl: cleanText(image.displayedUrl),
          postId: parentPostId,
          replyId,
          imageIndex: imageIndex + 1,
        });
        return filename;
      });
      return {
        source: 'microsoft_teams_community',
        source_url: 'https://teams.live.com/v2/',
        source_reply_id: replyId,
        source_parent_post_id: parentPostId,
        parent_title: cleanText(reply.parentTitle),
        parent_author: cleanText(reply.parentAuthor),
        author: cleanText(reply.author),
        published_at: cleanText(reply.publishedAt),
        displayed_time: cleanText(reply.displayedTime),
        text: cleanText(reply.text),
        local_folder: replyFolder,
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

    const threadMap = new Map();
    rawPosts.forEach((post) => {
      threadMap.set(post.source_post_id, {
        folder: post.local_folder,
        post,
        parentContext: null,
        replies: [],
      });
    });
    rawReplies.forEach((reply) => {
      if (!threadMap.has(reply.source_parent_post_id)) {
        threadMap.set(reply.source_parent_post_id, {
          folder: buildPostFolder(reply.parent_title, reply.source_parent_post_id),
          post: null,
          parentContext: {
            source_post_id: reply.source_parent_post_id,
            title: reply.parent_title,
            author: reply.parent_author,
          },
          replies: [],
        });
      }
      threadMap.get(reply.source_parent_post_id).replies.push(reply);
    });

    const itemFiles = [];
    threadMap.forEach((thread) => {
      const content = {
        schema_version: 1,
        community_name: cleanText(communityName),
        author_filter: cleanText(authorFilter),
        exported_at: exportedAt,
        post: thread.post,
        parent_context: thread.parentContext,
        replies: thread.replies,
      };
      const title = thread.post?.title || thread.parentContext?.title || '无标题';
      const author = thread.post?.author || thread.parentContext?.author || '未知';
      const lines = [
        `# ${title}`,
        '',
        `- 主帖作者：${author}`,
        `- Teams 帖子 ID：${thread.post?.source_post_id || thread.parentContext?.source_post_id || ''}`,
        `- 筛选出的 Inc 回复：${thread.replies.length} 条`,
        '',
      ];
      if (thread.post?.text) lines.push(thread.post.text, '');
      thread.post?.local_images.forEach((imagePath) => lines.push(`![${title}](${imagePath.split('/').pop() === undefined ? imagePath : `images/${imagePath.split('/').pop()}`})`, ''));
      thread.replies.forEach((reply, index) => {
        lines.push(`## Inc 回复 ${index + 1}`, '', `- 作者：${reply.author}`, `- 时间：${reply.published_at || '未知'}`, '');
        if (reply.text) lines.push(reply.text, '');
      });
      itemFiles.push({
        filename: `${thread.folder}/content.json`,
        mimeType: 'application/json',
        content: JSON.stringify(content, null, 2),
      });
      itemFiles.push({
        filename: `${thread.folder}/README.md`,
        mimeType: 'text/markdown',
        content: lines.join('\n'),
      });
    });

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
      itemFiles,
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
