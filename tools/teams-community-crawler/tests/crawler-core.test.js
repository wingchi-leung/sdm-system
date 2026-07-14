const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildExportBundle,
  matchesAuthor,
  mergePost,
  parseReplyCount,
  sanitizePathSegment,
} = require('../crawler-core');

test('matchesAuthor 仅保留作者名包含指定文本的帖子', () => {
  assert.equal(matchesAuthor('Inc. ICOACH', 'Inc'), true);
  assert.equal(matchesAuthor('inc. icoach', 'INC'), true);
  assert.equal(matchesAuthor('温 建华', 'Inc'), false);
  assert.equal(matchesAuthor('', 'Inc'), false);
});

test('parseReplyCount 从 Teams 回复摘要中提取数量', () => {
  assert.equal(parseReplyCount('打开来自 A、B 和 3 个其他的 132 个答复'), 132);
  assert.equal(parseReplyCount('77 条回复'), 77);
  assert.equal(parseReplyCount(''), 0);
});

test('mergePost 合并虚拟列表重复帖子并补齐懒加载图片', () => {
  const previous = {
    id: '1001',
    author: 'Inc. ICOACH',
    title: '示例',
    text: '',
    images: [{ displayedUrl: 'https://example.com/a', originalUrl: '' }],
  };
  const current = {
    id: '1001',
    author: 'Inc. ICOACH',
    title: '示例',
    text: '正文',
    images: [
      { displayedUrl: 'https://example.com/a', originalUrl: 'https://example.com/a/full' },
      { displayedUrl: 'https://example.com/b', originalUrl: '' },
    ],
  };

  const merged = mergePost(previous, current);

  assert.equal(merged.text, '正文');
  assert.equal(merged.images.length, 2);
  assert.equal(merged.images[0].originalUrl, 'https://example.com/a/full');
});

test('buildExportBundle 生成原始数据和小程序草稿路径', () => {
  const result = buildExportBundle({
    communityName: 'PPP / 社区',
    authorFilter: 'Inc',
    exportedAt: '2026-07-14T12:00:00.000Z',
    posts: [
      {
        id: '1001',
        author: 'Inc. ICOACH',
        publishedAt: '2026年5月15日 6:39',
        title: '观图启思',
        text: '正文',
        replyCount: 2,
        images: [
          {
            originalUrl: 'https://example.com/a/full',
            displayedUrl: 'https://example.com/a',
            naturalWidth: 800,
            naturalHeight: 600,
          },
        ],
      },
    ],
    replies: [
      {
        id: '2001',
        parentPostId: '9001',
        parentTitle: '其他作者的主题',
        parentAuthor: '其他作者',
        author: 'Inc. ICOACH',
        publishedAt: '2026年5月16日 7:00',
        text: 'Inc 的回复',
        images: [
          {
            originalUrl: '',
            displayedUrl: 'https://example.com/reply-a',
          },
        ],
      },
    ],
  });

  assert.equal(result.folderName, 'PPP-社区-20260714-120000');
  assert.equal(result.imageTasks.length, 2);
  assert.equal(result.imageTasks[0].filename, 'images/001-1001-01.jpg');
  assert.equal(result.imageTasks[1].filename, 'reply-images/001-2001-01.jpg');
  assert.deepEqual(result.miniprogram.posts[0].images, ['images/001-1001-01.jpg']);
  assert.match(result.miniprogram.posts[0].content, /正文/);
  assert.equal(result.miniprogram.posts[1].entry_type, 'reply');
  assert.equal(result.miniprogram.posts[1].source_parent_post_id, '9001');
  assert.match(result.miniprogram.posts[1].title, /其他作者的主题/);
  assert.deepEqual(result.miniprogram.posts[1].images, ['reply-images/001-2001-01.jpg']);
  assert.equal(result.raw.posts[0].source_post_id, '1001');
  assert.equal(result.raw.replies[0].source_reply_id, '2001');
});

test('sanitizePathSegment 移除 Windows 非法路径字符', () => {
  assert.equal(sanitizePathSegment(' PPP / 社区:*? '), 'PPP-社区');
  assert.equal(sanitizePathSegment(''), '未命名社区');
});
