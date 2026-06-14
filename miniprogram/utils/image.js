const api = require('./api');

const imageCache = {};
const DEFAULT_POSTER_PATH = '/assets/defaultbg.webp';

function isLocalPath(url) {
  return !!url && (
    url.startsWith('wxfile://') ||
    url.startsWith('http://tmp/') ||
    url.startsWith('file://') ||
    url.startsWith('/')
  );
}

function resolveDisplayUrl(url) {
  if (url && String(url).startsWith('/assets/')) {
    return Promise.resolve(String(url));
  }
  const fullUrl = api.getImageUrl(url);
  if (!fullUrl) {
    return Promise.resolve('');
  }

  if (isLocalPath(fullUrl)) {
    return Promise.resolve(fullUrl);
  }

  if (imageCache[fullUrl]) {
    return Promise.resolve(imageCache[fullUrl]);
  }

  return new Promise((resolve) => {
    try {
      wx.getImageInfo({
        src: fullUrl,
        success: (res) => {
          const displayUrl = res && res.path ? res.path : fullUrl;
          imageCache[fullUrl] = displayUrl;
          resolve(displayUrl);
        },
        fail: () => {
          resolve(fullUrl);
        },
      });
    } catch (err) {
      resolve(fullUrl);
    }
  });
}

function resolveActivityPosters(items) {
  return Promise.all((items || []).map(async (item) => ({
    ...item,
    poster_url: await resolveDisplayUrl(item.poster_url) || DEFAULT_POSTER_PATH,
  })));
}

module.exports = {
  resolveDisplayUrl,
  resolveActivityPosters,
};
