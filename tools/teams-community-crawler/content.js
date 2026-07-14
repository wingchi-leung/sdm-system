(function initContentCrawler() {
  const core = globalThis.TeamsCommunityCrawlerCore;

  function sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function readCheckpoint(key) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(key, (result) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(`读取增量检查点失败：${error.message}`));
          return;
        }
        resolve(result?.[key] || null);
      });
    });
  }

  function updateInlineStatus(message, color = '#616161') {
    const status = document.querySelector('#teams-community-crawler-panel [data-crawler-status]');
    if (!status) return;
    status.textContent = message;
    status.style.color = color;
  }

  function getText(element) {
    return element ? String(element.innerText || element.textContent || '').trim() : '';
  }

  function resolveCommunityName() {
    const selectedCommunity = document.querySelector('[role="treeitem"][aria-selected="true"]');
    const selectedText = getText(selectedCommunity).split(/\n+/).map((line) => line.trim()).find(Boolean);
    if (selectedText) return selectedText;
    const titleParts = document.title.split('|').map((part) => part.trim()).filter(Boolean);
    return titleParts.length > 1 ? titleParts[1] : 'Teams社区';
  }

  function extractReplySummary(postElement) {
    const buttonTexts = Array.from(postElement.querySelectorAll('button')).map((button) =>
      getText(button) || String(button.getAttribute('aria-label') || '').trim(),
    );
    return buttonTexts.find((text) => /\d+\s*(?:个答复|条回复)/.test(text)) || '';
  }

  function extractPost(postElement) {
    const id = String(postElement.id || '').replace(/^reply-chain-summary-/, '');
    const body = postElement.querySelector('[id^="message-body-"]');
    if (!id || !body) return null;

    const subheader = body.querySelector('[data-tid="post-message-subheader"]');
    const subheaderLines = getText(subheader || body)
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const author = subheaderLines[0] || '';
    const timestamp = body.querySelector('[data-tid="timestamp"]');
    const subject = body.querySelector('[data-tid="subject-line"]');
    const messageBody = body.querySelector('[data-tid="message-body"]');
    const replySummary = extractReplySummary(postElement);

    const imageMap = new Map();
    Array.from(body.querySelectorAll('img[data-gallery-src], img[alt="Image"]')).forEach((image) => {
      const displayedUrl = String(
        image.currentSrc || image.getAttribute('data-orig-src') || image.getAttribute('src') || '',
      ).trim();
      const originalUrl = String(image.getAttribute('data-gallery-src') || '').trim();
      const key = displayedUrl || originalUrl;
      if (!key || imageMap.has(key)) return;
      imageMap.set(key, {
        displayedUrl,
        originalUrl,
        naturalWidth: Number(image.naturalWidth || 0),
        naturalHeight: Number(image.naturalHeight || 0),
      });
    });

    return {
      id,
      author,
      publishedAt: timestamp
        ? String(timestamp.getAttribute('aria-label') || getText(timestamp)).trim()
        : '',
      displayedTime: getText(timestamp),
      title: getText(subject),
      text: getText(messageBody),
      replySummary,
      replyCount: core.parseReplyCount(replySummary),
      images: Array.from(imageMap.values()),
    };
  }

  function collectVisiblePosts(allPostMap) {
    const visibleIds = [];
    Array.from(document.querySelectorAll('[data-tid="channel-pane-message"]')).forEach((element) => {
      const post = extractPost(element);
      if (!post) return;
      visibleIds.push(post.id);
      allPostMap.set(post.id, core.mergePost(allPostMap.get(post.id), post));
    });
    return visibleIds;
  }

  function extractReply(replyElement, parentPost) {
    const header = replyElement.querySelector('[data-tid="reply-message-header"]');
    if (!header) return null;
    const body = replyElement.querySelector('[data-tid="message-body"]');
    const bodyId = String(body?.id || '');
    const id = bodyId.replace(/^content-/, '');
    if (!id) return null;
    const headerLines = getText(header).split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const author = headerLines[0] || '';
    const timestamp = header.querySelector('[data-tid="timestamp"]') || replyElement.querySelector('[data-tid="timestamp"]');
    const imageMap = new Map();
    Array.from(replyElement.querySelectorAll('img[data-gallery-src], img[alt="Image"]')).forEach((image) => {
      const displayedUrl = String(
        image.currentSrc || image.getAttribute('data-orig-src') || image.getAttribute('src') || '',
      ).trim();
      const originalUrl = String(image.getAttribute('data-gallery-src') || '').trim();
      const key = displayedUrl || originalUrl;
      if (!key || imageMap.has(key)) return;
      imageMap.set(key, {
        displayedUrl,
        originalUrl,
        naturalWidth: Number(image.naturalWidth || 0),
        naturalHeight: Number(image.naturalHeight || 0),
      });
    });
    return {
      id,
      parentPostId: parentPost.id,
      parentTitle: parentPost.title,
      parentAuthor: parentPost.author,
      author,
      publishedAt: timestamp
        ? String(timestamp.getAttribute('aria-label') || getText(timestamp)).trim()
        : headerLines.find((line) => /\d/.test(line) && line !== author && line !== '所有者') || '',
      displayedTime: getText(timestamp),
      text: getText(body),
      images: Array.from(imageMap.values()),
    };
  }

  function collectVisibleReplies(replyMap, parentPost, authorFilter) {
    Array.from(document.querySelectorAll('[data-tid="channel-replies-pane-message"]')).forEach((element) => {
      const reply = extractReply(element, parentPost);
      if (!reply || !core.matchesAuthor(reply.author, authorFilter)) return;
      replyMap.set(reply.id, core.mergePost(replyMap.get(reply.id), reply));
    });
  }

  async function waitForElement(selector, timeoutMs = 12000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const element = document.querySelector(selector);
      if (element) return element;
      await sleep(150);
    }
    throw new Error(`等待 Teams 页面元素超时：${selector}`);
  }

  async function ensureListView() {
    const closeButton = document.querySelector('[data-tid="close-l2-view-button"]');
    if (closeButton) {
      closeButton.click();
      await waitForElement('[data-tid="channel-pane-viewport"]');
    }
  }

  async function openConversationPanel(parentPost, delayMs) {
    const attempts = core.buildConversationOpenAttempts(delayMs);
    let lastError = null;

    for (const attempt of attempts) {
      try {
        await ensureListView();
        const initialPostElement = document.getElementById(`reply-chain-summary-${parentPost.id}`);
        if (!initialPostElement) return null;

        initialPostElement.scrollIntoView({ block: 'center', inline: 'nearest' });
        await sleep(attempt.settleMs);

        // Teams 会回收虚拟列表节点，因此滚动后必须重新查找帖子和按钮。
        const currentPostElement = document.getElementById(`reply-chain-summary-${parentPost.id}`);
        if (!currentPostElement) {
          throw new Error('帖子滚动后暂时离开了可见区域');
        }
        const conversationButton = Array.from(currentPostElement.querySelectorAll('button')).find(
          (button) => getText(button) === '查看对话',
        );
        if (!conversationButton) return false;

        conversationButton.scrollIntoView({ block: 'center', inline: 'nearest' });
        conversationButton.focus({ preventScroll: true });
        conversationButton.click();
        return await waitForElement('[data-tid="channel-replies-viewport"]', attempt.timeoutMs);
      } catch (error) {
        lastError = error;
        if (attempt.attempt < attempts.length) {
          updateInlineStatus(
            `“${parentPost.title || parentPost.id}”打开回复失败，正在进行第 ${attempt.attempt + 1} 次尝试……`,
            '#8a4b08',
          );
        }
        try {
          await ensureListView();
        } catch (_) {
          // 下一轮会再次检查列表状态；最终失败时由外层记录。
        }
        await sleep(attempt.settleMs);
      }
    }

    throw new Error(`两次点击“查看对话”后回复面板仍未打开：${lastError?.message || '未知原因'}`);
  }

  async function crawlRepliesForPost(parentPost, authorFilter, replyMap, delayMs) {
    const replyViewport = await openConversationPanel(parentPost, delayMs);
    if (replyViewport === null) return null;
    if (replyViewport === false) return false;
    await sleep(delayMs);
    replyViewport.scrollTop = 0;
    replyViewport.dispatchEvent(new Event('scroll', { bubbles: true }));
    await sleep(delayMs);

    let previousHeight = -1;
    let previousCount = -1;
    let stableRounds = 0;
    for (let round = 0; round < 2000; round += 1) {
      collectVisibleReplies(replyMap, parentPost, authorFilter);
      const atBottom = replyViewport.scrollTop + replyViewport.clientHeight >= replyViewport.scrollHeight - 8;
      const unchanged = replyViewport.scrollHeight === previousHeight && replyMap.size === previousCount;
      stableRounds = atBottom && unchanged ? stableRounds + 1 : 0;
      if (stableRounds >= 5) break;
      previousHeight = replyViewport.scrollHeight;
      previousCount = replyMap.size;
      const step = Math.max(240, Math.floor(replyViewport.clientHeight * 0.78));
      replyViewport.scrollTop = Math.min(replyViewport.scrollTop + step, replyViewport.scrollHeight);
      replyViewport.dispatchEvent(new Event('scroll', { bubbles: true }));
      await sleep(delayMs);
    }
    collectVisibleReplies(replyMap, parentPost, authorFilter);

    const closeButton = await waitForElement('[data-tid="close-l2-view-button"]');
    closeButton.click();
    await waitForElement('[data-tid="channel-pane-viewport"]');
    await sleep(Math.min(delayMs, 600));
    return true;
  }

  async function crawl(options) {
    if (!core) throw new Error('爬虫核心未加载，请重新加载扩展');
    await ensureListView();
    let viewport = document.querySelector('[data-tid="channel-pane-viewport"]');
    if (!viewport) {
      throw new Error('没有找到帖子列表，请先打开 Teams 社区的“帖子”页');
    }

    const authorFilter = String(options.authorFilter || 'Inc').trim();
    const maxPosts = Math.max(0, Number(options.maxPosts || 0));
    const delayMs = Math.max(300, Number(options.delayMs || 800));
    const maxRounds = Math.max(20, Number(options.maxRounds || 2000));
    const incremental = options.incremental !== false;
    const communityName = resolveCommunityName();
    const runExportedAt = new Date().toISOString();
    const checkpointKey = `teams-community-crawler:${location.host}:${communityName}`;
    const storedCheckpoint = incremental ? await readCheckpoint(checkpointKey) : null;
    const checkpoint = storedCheckpoint?.version === 1
      ? JSON.parse(JSON.stringify(storedCheckpoint))
      : { version: 1, communityName, authorFilter, updatedAt: null, threads: {} };
    const allPostMap = new Map();
    const selectedPostMap = new Map();
    const replyMap = new Map();
    const processedThreadIds = new Set();
    const crawlFailures = [];
    const streamSummaries = [];
    let checkedThreadCount = 0;
    let stableRounds = 0;
    let previousHeight = -1;
    let previousCount = -1;

    viewport.scrollTop = 0;
    viewport.dispatchEvent(new Event('scroll', { bubbles: true }));
    await sleep(delayMs);

    for (let round = 0; round < maxRounds; round += 1) {
      viewport = document.querySelector('[data-tid="channel-pane-viewport"]');
      if (!viewport) throw new Error('帖子列表意外关闭，请刷新 Teams 页面后重试');
      const visibleIds = collectVisiblePosts(allPostMap);
      for (const postId of visibleIds) {
        if (processedThreadIds.has(postId)) continue;
        const parentPost = allPostMap.get(postId);
        const savedThread = checkpoint.threads[postId] || null;
        if (incremental && !core.shouldProcessThread(parentPost, savedThread)) {
          processedThreadIds.add(postId);
          continue;
        }
        if (maxPosts > 0 && checkedThreadCount >= maxPosts) break;
        const currentThreadReplies = new Map();
        const changedPosts = [];
        const changedReplies = [];
        let threadResult;
        try {
          threadResult = await crawlRepliesForPost(
            parentPost,
            authorFilter,
            currentThreadReplies,
            delayMs,
          );
        } catch (error) {
          const failure = {
            post_id: postId,
            title: parentPost.title || '',
            error: error.message || '回复面板打开失败',
            failed_at: new Date().toISOString(),
          };
          crawlFailures.push(failure);
          threadResult = false;
          try {
            await ensureListView();
          } catch (_) {
            throw new Error(`帖子“${parentPost.title || postId}”失败后无法返回列表，请刷新页面后重试`);
          }
        }
        if (threadResult === null) break;
        if (
          core.matchesAuthor(parentPost.author, authorFilter)
          && (!incremental || savedThread?.mainFingerprint !== core.buildEntryFingerprint(parentPost))
        ) {
          selectedPostMap.set(postId, core.mergePost(selectedPostMap.get(postId), parentPost));
          changedPosts.push(parentPost);
        }
        const currentReplies = Array.from(currentThreadReplies.values());
        currentReplies.forEach((reply) => {
          const previousFingerprint = savedThread?.replyFingerprints?.[reply.id];
          const currentFingerprint = core.buildEntryFingerprint(reply);
          if (!incremental || previousFingerprint !== currentFingerprint) {
            replyMap.set(reply.id, core.mergePost(replyMap.get(reply.id), reply));
            changedReplies.push(reply);
          }
        });
        checkpoint.threads[postId] = core.buildThreadCheckpoint(parentPost, currentReplies);
        if (threadResult === false && crawlFailures.length) {
          checkpoint.threads[postId].lastError = crawlFailures[crawlFailures.length - 1];
        }
        checkpoint.updatedAt = new Date().toISOString();
        checkedThreadCount += 1;
        processedThreadIds.add(postId);
        const threadBundle = core.buildExportBundle({
          communityName,
          authorFilter,
          exportedAt: runExportedAt,
          posts: changedPosts,
          replies: changedReplies,
        });
        threadBundle.checkpointKey = checkpointKey;
        threadBundle.checkpoint = checkpoint;
        threadBundle.streamMode = true;
        threadBundle.checkedThreadCount = 1;
        threadBundle.noExportedEntries = changedPosts.length === 0 && changedReplies.length === 0;
        const streamResponse = await sendRuntimeMessage({ type: 'download-export', bundle: threadBundle });
        if (!streamResponse?.ok) {
          throw new Error(streamResponse?.error || `帖子“${parentPost.title || postId}”保存失败`);
        }
        streamSummaries.push(streamResponse.summary);
        updateInlineStatus(
          `已完成 ${checkedThreadCount} 条；刚保存“${parentPost.title || postId}”${crawlFailures.length ? `，失败 ${crawlFailures.length} 条已跳过` : ''}`,
          crawlFailures.length ? '#8a4b08' : '#0b6a0b',
        );
        viewport = document.querySelector('[data-tid="channel-pane-viewport"]');
      }
      if (maxPosts > 0 && checkedThreadCount >= maxPosts) break;

      const atBottom = viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 8;
      const unchanged = viewport.scrollHeight === previousHeight && processedThreadIds.size === previousCount;
      stableRounds = atBottom && unchanged ? stableRounds + 1 : 0;
      if (stableRounds >= 6) break;

      previousHeight = viewport.scrollHeight;
      previousCount = processedThreadIds.size;
      const step = Math.max(240, Math.floor(viewport.clientHeight * 0.78));
      viewport.scrollTop = Math.min(viewport.scrollTop + step, viewport.scrollHeight);
      viewport.dispatchEvent(new Event('scroll', { bubbles: true }));
      await sleep(delayMs);
    }

    collectVisiblePosts(allPostMap);
    const posts = Array.from(selectedPostMap.values());
    const replies = Array.from(replyMap.values());
    if (!incremental && !posts.length && !replies.length) {
      throw new Error(`没有找到作者名包含“${authorFilter}”的主帖或回复`);
    }

    checkpoint.updatedAt = new Date().toISOString();
    const bundle = core.buildExportBundle({
      communityName,
      authorFilter,
      exportedAt: runExportedAt,
      posts,
      replies,
    });
    bundle.checkpointKey = checkpointKey;
    bundle.checkpoint = checkpoint;
    bundle.incremental = incremental;
    bundle.checkedThreadCount = checkedThreadCount;
    bundle.noChanges = checkedThreadCount === 0;
    bundle.noExportedEntries = posts.length === 0 && replies.length === 0;
    bundle.indexOnly = true;
    bundle.crawlFailures = crawlFailures;
    const indexResponse = await sendRuntimeMessage({ type: 'download-export', bundle });
    if (!indexResponse?.ok) throw new Error(indexResponse?.error || '保存本批索引失败');
    const totalImageCount = streamSummaries.reduce((sum, item) => sum + Number(item.imageCount || 0), 0);
    const failedImageCount = streamSummaries.reduce(
      (sum, item) => sum + Number(item.failedImageCount || 0),
      0,
    );
    bundle.alreadyDownloaded = true;
    bundle.downloadSummary = {
      ...indexResponse.summary,
      checkedThreadCount,
      imageCount: totalImageCount,
      failedImageCount,
      crawlFailureCount: crawlFailures.length,
      noExportedEntries: bundle.noExportedEntries,
    };
    return bundle;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== 'crawl-teams-community') return false;
    crawl(message.options || {})
      .then((bundle) => sendResponse({ ok: true, bundle }))
      .catch((error) => sendResponse({ ok: false, error: error.message || '抓取失败' }));
    return true;
  });

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

  function mountFloatingPanel() {
    if (document.querySelector('#teams-community-crawler-panel')) return;
    const panel = document.createElement('section');
    panel.id = 'teams-community-crawler-panel';
    panel.setAttribute('aria-label', 'Teams 社区内容导出器');
    panel.style.cssText = [
      'position:fixed',
      'right:20px',
      'bottom:20px',
      'z-index:2147483647',
      'width:260px',
      'padding:14px',
      'border:1px solid #d8d8e5',
      'border-radius:10px',
      'box-shadow:0 8px 28px rgba(0,0,0,.18)',
      'background:#fff',
      'color:#242424',
      'font:13px/1.45 Microsoft YaHei,system-ui,sans-serif',
    ].join(';');
    panel.innerHTML = `
      <div style="font-weight:700;font-size:14px;margin-bottom:8px">Teams 社区导出器</div>
      <div style="color:#616161;margin-bottom:10px">筛选作者名包含 Inc 的主帖和回复</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button type="button" data-crawler-action="sample" style="padding:8px;border:1px solid #5b5fc7;border-radius:6px;background:#fff;color:#4549a5;cursor:pointer">增量 2 条</button>
        <button type="button" data-crawler-action="incremental" style="padding:8px;border:0;border-radius:6px;background:#5b5fc7;color:#fff;cursor:pointer">增量 20 条</button>
        <button type="button" data-crawler-action="all" style="grid-column:1/-1;padding:8px;border:1px solid #aaa;border-radius:6px;background:#fff;color:#444;cursor:pointer">全量重新导出</button>
      </div>
      <div data-crawler-status role="status" style="margin-top:9px;color:#616161;word-break:break-word">尚未开始</div>
    `;
    document.body.appendChild(panel);

    const buttons = Array.from(panel.querySelectorAll('[data-crawler-action]'));
    const status = panel.querySelector('[data-crawler-status]');
    buttons.forEach((button) => {
      button.addEventListener('click', async () => {
        const action = button.getAttribute('data-crawler-action');
        const isSample = action === 'sample';
        const isAll = action === 'all';
        buttons.forEach((item) => { item.disabled = true; });
        status.textContent = isAll
          ? '正在全量检查所有主帖及其 Inc 回复，请保持页面打开……'
          : `正在增量检查 ${isSample ? 2 : 20} 条待处理主帖……`;
        try {
          const bundle = await crawl({
            authorFilter: 'Inc',
            maxPosts: isAll ? 0 : (isSample ? 2 : 20),
            delayMs: 800,
            incremental: !isAll,
          });
          let summary = bundle.downloadSummary;
          if (!bundle.alreadyDownloaded) {
            status.textContent = `已抓取 ${bundle.raw.posts.length} 条主帖、${bundle.raw.replies.length} 条回复，正在下载……`;
            const response = await sendRuntimeMessage({ type: 'download-export', bundle });
            if (!response?.ok) throw new Error(response?.error || '下载失败');
            summary = response.summary;
          }
          if (summary.noExportedEntries) {
            status.textContent = summary.checkedThreadCount
              ? `已检查 ${summary.checkedThreadCount} 条，本批没有新增 Inc 内容；检查点已保存。`
              : '没有新的或发生变化的帖子。';
            status.style.color = '#0b6a0b';
            return;
          }
          status.textContent = `完成：${summary.postCount} 条主帖、${summary.replyCount} 条回复、${summary.imageCount - summary.failedImageCount}/${summary.imageCount} 张图片${summary.crawlFailureCount ? `；跳过 ${summary.crawlFailureCount} 条打不开的帖子` : ''}`;
          status.style.color = summary.failedImageCount || summary.crawlFailureCount ? '#8a4b08' : '#0b6a0b';
        } catch (error) {
          status.textContent = error.message || '执行失败，请刷新页面后重试';
          status.style.color = '#a4262c';
        } finally {
          buttons.forEach((item) => { item.disabled = false; });
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountFloatingPanel, { once: true });
  } else {
    mountFloatingPanel();
  }
})();
