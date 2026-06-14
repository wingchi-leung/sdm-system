const HTML_TAG_PATTERN = /<\/?(p|div|span|img|br|strong|em|h[1-6]|ul|ol|li|blockquote|a)\b/i;

function extractImageUrlsFromHtml(html) {
  if (!html) return [];
  const matches = String(html).match(/<img[^>]+src=["']([^"']+)["']/gi) || [];
  return matches
    .map((item) => {
      const result = item.match(/src=["']([^"']+)["']/i);
      return result ? result[1] : null;
    })
    .filter(Boolean);
}

function htmlToText(html) {
  if (!html) return '';
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function buildHtmlBlocks(html) {
  const text = htmlToText(html);
  const images = extractImageUrlsFromHtml(html);
  const blocks = [];
  if (text) {
    blocks.push({ type: 'text', text });
  }
  if (images.length) {
    blocks.push({ type: 'images', images });
  }
  return { text, blocks };
}

function parsePostContent(content) {
  const raw = content == null ? '' : String(content);
  if (!raw.trim()) {
    return { text: '', blocks: [] };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.blocks)) {
      return { text: raw, blocks: [{ type: 'text', text: raw }] };
    }
    const blocks = parsed.blocks
      .map((block) => {
        if (!block || typeof block !== 'object') return null;
        if (block.type === 'text') {
          const text = (block.text || '').toString().trim();
          return text ? { type: 'text', text } : null;
        }
        if (block.type === 'images' && Array.isArray(block.images)) {
          const images = block.images.map((item) => String(item || '').trim()).filter(Boolean);
          return images.length ? { type: 'images', images } : null;
        }
        return null;
      })
      .filter(Boolean);

    return {
      text: (parsed.text || '').toString(),
      blocks,
    };
  } catch (_) {
    if (HTML_TAG_PATTERN.test(raw)) {
      return buildHtmlBlocks(raw);
    }
    return { text: raw, blocks: [{ type: 'text', text: raw }] };
  }
}

function buildPostContentPayload(blocks) {
  const normalizedBlocks = [];
  const textParts = [];
  const imageUrls = [];

  (blocks || []).forEach((block) => {
    if (!block || typeof block !== 'object') return;
    if (block.type === 'text') {
      const text = (block.text || '').toString().trim();
      if (!text) return;
      normalizedBlocks.push({ type: 'text', text });
      textParts.push(text);
      return;
    }
    if (block.type === 'images') {
      const images = (block.images || []).map((item) => String(item || '').trim()).filter(Boolean);
      if (!images.length) return;
      normalizedBlocks.push({ type: 'images', images });
      imageUrls.push(...images);
    }
  });

  const text = textParts.join('\n');
  return {
    text,
    content: JSON.stringify({ text, blocks: normalizedBlocks }),
    images: imageUrls,
    blocks: normalizedBlocks,
  };
}

module.exports = {
  parsePostContent,
  buildPostContentPayload,
};
