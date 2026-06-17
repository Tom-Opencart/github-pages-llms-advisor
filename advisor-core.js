(function(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.LlmsAdvisorCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const TECHNICAL_PATTERNS = [
    /user-agent\s*:/i,
    /disallow\s*:/i,
    /allow\s*:/i,
    /sitemap\s*:/i,
    /crawl-delay\s*:/i,
    /<\?xml/i,
    /<urlset/i,
    /<sitemapindex/i,
    /lastmod/i,
    /changefreq/i,
    /priority/i
  ];

  function collapseWhitespace(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function looksTechnicalText(text) {
    const normalized = collapseWhitespace(text);

    if (!normalized) {
      return false;
    }

    const matchedPatterns = TECHNICAL_PATTERNS.filter((pattern) => pattern.test(normalized)).length;

    return matchedPatterns >= 2 || /^user-agent\s*:/i.test(normalized);
  }

  function sanitizeNarrativeText(text) {
    const normalized = collapseWhitespace(text);

    if (!normalized || looksTechnicalText(normalized)) {
      return '';
    }

    return normalized;
  }

  function guessTagline(metaDescription, cleanedBody, hints) {
    const candidates = [
      sanitizeNarrativeText(metaDescription),
      sanitizeNarrativeText(hints),
      sanitizeNarrativeText(String(cleanedBody || '').slice(0, 260))
    ];

    return candidates.find(Boolean) || '';
  }

  return {
    looksTechnicalText,
    sanitizeNarrativeText,
    guessTagline
  };
});
