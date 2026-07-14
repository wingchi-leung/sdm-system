function chromeDownload(options) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(options, (downloadId) => {
      const error = chrome.runtime.lastError;
      if (error || downloadId === undefined) {
        reject(new Error(error?.message || 'Chrome 未能创建下载任务'));
        return;
      }
      resolve(downloadId);
    });
  });
}

function waitForDownload(downloadId, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      chrome.downloads.onChanged.removeListener(onChanged);
      reject(new Error('下载超时'));
    }, timeoutMs);

    function finish(callback, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.downloads.onChanged.removeListener(onChanged);
      callback(value);
    }

    function onChanged(delta) {
      if (delta.id !== downloadId || !delta.state) return;
      if (delta.state.current === 'complete') {
        finish(resolve, downloadId);
      } else if (delta.state.current === 'interrupted') {
        finish(reject, new Error(delta.error?.current || '下载中断'));
      }
    }

    chrome.downloads.onChanged.addListener(onChanged);
    chrome.downloads.search({ id: downloadId }, (items) => {
      const item = items?.[0];
      if (item?.state === 'complete') {
        finish(resolve, downloadId);
      } else if (item?.state === 'interrupted') {
        finish(reject, new Error(item.error || '下载中断'));
      }
    });
  });
}

async function downloadUrl(url, filename) {
  if (!url) throw new Error('图片地址为空');
  const downloadId = await chromeDownload({
    url,
    filename,
    conflictAction: 'uniquify',
    saveAs: false,
  });
  await waitForDownload(downloadId);
  return downloadId;
}

async function downloadImage(task, rootFolder) {
  const filename = `${rootFolder}/${task.filename}`;
  const candidates = [...new Set([task.originalUrl, task.displayedUrl].filter(Boolean))];
  const errors = [];
  for (const url of candidates) {
    try {
      await downloadUrl(url, filename);
      return { ok: true, filename, url };
    } catch (error) {
      errors.push(error.message || String(error));
    }
  }
  return {
    ok: false,
    filename,
    postId: task.postId,
    error: errors.join('；') || '没有可用的图片地址',
  };
}

async function downloadTextFile(content, mimeType, filename) {
  const dataUrl = `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`;
  return downloadUrl(dataUrl, filename);
}

function saveCheckpoint(key, checkpoint) {
  return new Promise((resolve, reject) => {
    if (!key || !checkpoint) {
      resolve();
      return;
    }
    chrome.storage.local.set({ [key]: checkpoint }, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(`保存增量检查点失败：${error.message}`));
      else resolve();
    });
  });
}

async function downloadExport(bundle) {
  const rootFolder = `TeamsCommunity/${bundle.folderName}`;
  const failures = [];

  if (!bundle.noExportedEntries) {
    await downloadTextFile(
      JSON.stringify(bundle.raw, null, 2),
      'application/json',
      `${rootFolder}/teams-raw.json`,
    );
    await downloadTextFile(
      JSON.stringify(bundle.miniprogram, null, 2),
      'application/json',
      `${rootFolder}/miniprogram-import.json`,
    );
    await downloadTextFile(bundle.markdown, 'text/markdown', `${rootFolder}/README.md`);

    for (const file of bundle.itemFiles || []) {
      await downloadTextFile(
        file.content,
        file.mimeType || 'text/plain',
        `${rootFolder}/${file.filename}`,
      );
    }

    for (const task of bundle.imageTasks || []) {
      const result = await downloadImage(task, rootFolder);
      if (!result.ok) failures.push(result);
    }

    if (failures.length) {
      await downloadTextFile(
        JSON.stringify(failures, null, 2),
        'application/json',
        `${rootFolder}/download-failures.json`,
      );
    }
  }

  await saveCheckpoint(bundle.checkpointKey, bundle.checkpoint);

  return {
    rootFolder,
    postCount: bundle.raw.posts.length,
    replyCount: bundle.raw.replies.length,
    imageCount: bundle.imageTasks.length,
    failedImageCount: failures.length,
    checkedThreadCount: Number(bundle.checkedThreadCount || 0),
    noExportedEntries: Boolean(bundle.noExportedEntries),
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== 'download-export') return false;
  downloadExport(message.bundle)
    .then((summary) => sendResponse({ ok: true, summary }))
    .catch((error) => sendResponse({ ok: false, error: error.message || '下载导出包失败' }));
  return true;
});
