(function initContentCrawler() {
  const core = globalThis.TeamsCommunityCrawlerCore;

  function sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
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

  async function crawlRepliesForPost(parentPost, authorFilter, replyMap, delayMs) {
    const postElement = document.getElementById(`reply-chain-summary-${parentPost.id}`);
    if (!postElement) return null;
    const conversationButton = Array.from(postElement.querySelectorAll('button')).find(
      (button) => getText(button) === '查看对话',
    );
    if (!conversationButton) return false;

    conversationButton.click();
    const replyViewport = await waitForElement('[data-tid="channel-replies-viewport"]');
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
    const allPostMap = new Map();
    const selectedPostMap = new Map();
    const replyMap = new Map();
    const processedThreadIds = new Set();
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
        if (maxPosts > 0 && processedThreadIds.size >= maxPosts) break;
        const parentPost = allPostMap.get(postId);
        let threadResult;
        try {
          threadResult = await crawlRepliesForPost(parentPost, authorFilter, replyMap, delayMs);
        } catch (error) {
          throw new Error(`抓取帖子“${parentPost.title || postId}”的回复失败：${error.message}`);
        }
        if (threadResult === null) break;
        if (core.matchesAuthor(parentPost.author, authorFilter)) {
          selectedPostMap.set(postId, core.mergePost(selectedPostMap.get(postId), parentPost));
        }
        processedThreadIds.add(postId);
        viewport = document.querySelector('[data-tid="channel-pane-viewport"]');
      }
      if (maxPosts > 0 && processedThreadIds.size >= maxPosts) break;

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
    if (!posts.length && !replies.length) {
      throw new Error(`没有找到作者名包含“${authorFilter}”的主帖或回复`);
    }

    return core.buildExportBundle({
      communityName: resolveCommunityName(),
      authorFilter,
      exportedAt: new Date().toISOString(),
      posts,
      replies,
    });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== 'crawl-teams-community') return false;
    crawl(message.options || {})
      .then((bundle) => sendResponse({ ok: true, bundle }))
      .catch((error) => sendResponse({ ok: false, error: error.message || '抓取失败' }));
    return true;
  });
})();
