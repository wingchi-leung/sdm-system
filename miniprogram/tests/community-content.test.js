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
