const test = require('node:test');
const assert = require('node:assert/strict');

function loadSafeHelper() {
  const helperPath = require.resolve('../utils/image-safe');
  delete require.cache[helperPath];
  return require('../utils/image-safe');
}

test('image 模块缺少海报解析函数时会回退原始数据', async () => {
  const { resolveActivityPostersOrFallback } = loadSafeHelper();
  const items = [{ id: 1, poster_url: '/uploads/posters/a.jpg' }];

  const result = await resolveActivityPostersOrFallback({}, items, '单测');

  assert.deepEqual(result, items);
});

test('海报解析函数抛错时会回退原始数据', async () => {
  const { resolveActivityPostersOrFallback } = loadSafeHelper();
  const items = [{ id: 1, poster_url: '/uploads/posters/a.jpg' }];
  const imageModule = {
    resolveActivityPosters() {
      throw new Error('boom');
    },
  };

  const result = await resolveActivityPostersOrFallback(imageModule, items, '单测');

  assert.deepEqual(result, items);
});
