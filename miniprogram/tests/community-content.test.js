const test = require('node:test');
const assert = require('node:assert/strict');

const contentUtils = require('../utils/community-content');

test('HTML 帖子会被解析成文本块和图片块', () => {
  const parsed = contentUtils.parsePostContent('<p>第一段</p><p>第二段</p><img src="https://cdn.example.com/a.jpg" /><img src="/b.jpg" />');

  assert.equal(parsed.text, '第一段\n第二段');
  assert.deepEqual(parsed.blocks, [
    { type: 'text', text: '第一段\n第二段' },
    { type: 'images', images: ['https://cdn.example.com/a.jpg', '/b.jpg'] },
  ]);
});

test('普通文本帖子保持原样', () => {
  const parsed = contentUtils.parsePostContent('纯文本内容');

  assert.equal(parsed.text, '纯文本内容');
  assert.deepEqual(parsed.blocks, [
    { type: 'text', text: '纯文本内容' },
  ]);
});

test('Teams 来源 HTML 注释不会显示为帖子正文', () => {
  const marker = '<!-- teams-source-post:1778798348840;replies:1,2,3 -->';

  assert.deepEqual(contentUtils.parsePostContent(marker), { text: '', blocks: [] });
  assert.deepEqual(
    contentUtils.parsePostContent(`<p>正常正文</p>${marker}`),
    { text: '正常正文', blocks: [{ type: 'text', text: '正常正文' }] },
  );
});
