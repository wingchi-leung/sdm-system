const form = document.querySelector('#crawler-form');
const statusElement = document.querySelector('#status');
const startButton = document.querySelector('#start-button');

function setStatus(message, type = 'info') {
  statusElement.textContent = message;
  statusElement.dataset.type = type;
}

function sendTabMessage(tabId, payload) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, payload, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response);
    });
  });
}

function sendRuntimeMessage(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response);
    });
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  startButton.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !String(tab.url || '').startsWith('https://teams.live.com/v2/')) {
      throw new Error('请先打开 Teams 社区的“帖子”页面');
    }

    const authorFilter = document.querySelector('#author-filter').value.trim() || 'Inc';
    const maxPosts = Number(document.querySelector('#max-posts').value || 0);
    const delayMs = Number(document.querySelector('#delay-ms').value || 800);
    setStatus('正在逐条打开对话并抓取主帖和回复，请不要切换社区……');

    const crawlResponse = await sendTabMessage(tab.id, {
      type: 'crawl-teams-community',
      options: { authorFilter, maxPosts, delayMs },
    });
    if (!crawlResponse?.ok) {
      throw new Error(crawlResponse?.error || '抓取失败');
    }

    const postCount = crawlResponse.bundle.raw.posts.length;
    const replyCount = crawlResponse.bundle.raw.replies.length;
    const imageCount = crawlResponse.bundle.imageTasks.length;
    setStatus(`已抓取 ${postCount} 条主帖、${replyCount} 条回复、${imageCount} 张图片，正在下载……`);

    const downloadResponse = await sendRuntimeMessage({
      type: 'download-export',
      bundle: crawlResponse.bundle,
    });
    if (!downloadResponse?.ok) {
      throw new Error(downloadResponse?.error || '下载失败');
    }

    const summary = downloadResponse.summary;
    const suffix = summary.failedImageCount
      ? `，${summary.failedImageCount} 张失败，详见 download-failures.json`
      : '，图片全部下载成功';
    setStatus(`完成：${summary.rootFolder}${suffix}`, summary.failedImageCount ? 'warning' : 'success');
  } catch (error) {
    setStatus(error.message || '执行失败，请刷新 Teams 页面后重试', 'error');
  } finally {
    startButton.disabled = false;
  }
});
