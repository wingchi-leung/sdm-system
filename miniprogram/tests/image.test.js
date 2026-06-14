const test = require('node:test');
const assert = require('node:assert/strict');

function loadImageUtil({ getImageUrl } = {}) {
  const calls = [];
  global.wx = {
    getImageInfo(options) {
      calls.push(options.src);
      const index = calls.length;
      if (typeof options.success === 'function') {
        options.success({ path: `/tmp/image-${index}.jpg` });
      }
    },
  };

  const imagePath = require.resolve('../utils/image');
  const apiPath = require.resolve('../utils/api');
  delete require.cache[imagePath];
  delete require.cache[apiPath];
  require.cache[apiPath] = {
    id: apiPath,
    filename: apiPath,
    loaded: true,
    exports: {
      getImageUrl: getImageUrl || ((url) => `https://static.example.com${url || ''}`),
    },
  };

  const image = require('../utils/image');
  return { image, calls };
}

test('头像版本变化时会重新解析，便于更换后立即刷新', async () => {
  const { image, calls } = loadImageUtil();

  const first = await image.resolveDisplayUrl('https://static.example.com/uploads/avatars/user-a.jpg?v=1');
  const second = await image.resolveDisplayUrl('https://static.example.com/uploads/avatars/user-a.jpg?v=1');
  const third = await image.resolveDisplayUrl('https://static.example.com/uploads/avatars/user-a.jpg?v=2');

  assert.equal(first, '/tmp/image-1.jpg');
  assert.equal(second, '/tmp/image-1.jpg');
  assert.equal(third, '/tmp/image-2.jpg');
  assert.equal(calls.length, 2);
});

test('普通图片仍然保持缓存命中', async () => {
  const { image, calls } = loadImageUtil();

  const first = await image.resolveDisplayUrl('/uploads/posters/poster-a.jpg');
  const second = await image.resolveDisplayUrl('/uploads/posters/poster-a.jpg');

  assert.equal(first, '/tmp/image-1.jpg');
  assert.equal(second, '/tmp/image-1.jpg');
  assert.equal(calls.length, 1);
});

test('活动海报为空时会回退到默认背景图', async () => {
  const { image } = loadImageUtil({
    getImageUrl: (url) => url,
  });

  const items = await image.resolveActivityPosters([
    { id: 1, poster_url: '' },
    { id: 2, poster_url: null },
  ]);

  assert.equal(items[0].poster_url, '/assets/defaultbg.jpg');
  assert.equal(items[1].poster_url, '/assets/defaultbg.jpg');
});
