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
