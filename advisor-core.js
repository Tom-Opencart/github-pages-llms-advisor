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

  function buildMeaningfulTagline(context) {
    const title = sanitizeNarrativeText(context && context.title);
    const tagline = sanitizeNarrativeText(context && context.tagline);
    const focus = context && context.focus ? context.focus : {};
    const servicePages = Array.isArray(context && context.servicePages) ? context.servicePages : [];
    const blogPages = Array.isArray(context && context.blogPages) ? context.blogPages : [];

    if (tagline) {
      return tagline;
    }

    if (focus.ecommerce && servicePages.length && blogPages.length) {
      return 'Интернет-магазин с каталогом товаров, сервисными страницами и справочными материалами.';
    }

    if (focus.ecommerce && servicePages.length) {
      return 'Интернет-магазин с каталогом товаров и основными сервисными страницами для клиентов.';
    }

    if (focus.marketplace && focus.b2b) {
      return 'Сайт с товарами и материалами для бизнеса и маркетплейсов.';
    }

    if (focus.marketplace) {
      return 'Сайт с каталогом товаров и материалами для сценариев маркетплейсов.';
    }

    if (focus.b2b) {
      return 'Сайт с каталогом товаров и B2B-контекстом для корпоративных и оптовых запросов.';
    }

    if (focus.ecommerce) {
      return 'Интернет-магазин с каталогом товаров и сервисными страницами для клиентов.';
    }

    return title ? `${title} — сайт с каталогом и страницами для клиентов.` : 'Сайт с каталогом и страницами для клиентов.';
  }

  function buildMeaningfulProfile(context) {
    const focus = context && context.focus ? context.focus : {};
    const parts = [];
    const tagline = buildMeaningfulTagline(context);

    parts.push(tagline);

    if (focus.marketplace) {
      parts.push('Отдельно учитывайте сценарии, связанные с маркетплейсами и требованиями к упаковке, логистике или карточкам товаров.');
    }

    if (focus.b2b) {
      parts.push('Сайт имеет выраженный B2B-контекст, поэтому AI стоит учитывать оптовые заказы, корпоративные закупки и сервисные страницы.');
    }

    if (focus.ecommerce) {
      parts.push('Для ассортимента, условий заказа и характеристик основным источником должны быть каталог, карточки товаров и сервисные страницы.');
    }

    return parts.join(' ').trim();
  }

  function normalizeFaqEntries(items) {
    return (Array.isArray(items) ? items : [])
      .map((item) => {
        const question = String(item && item.question ? item.question : '').trim().replace(/[\r\n|]+/g, ' ');
        const answer = String(item && item.answer ? item.answer : '').trim().replace(/[\r\n|]+/g, ' ');

        return question && answer ? `${question}|${answer}` : '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return {
    looksTechnicalText,
    sanitizeNarrativeText,
    guessTagline,
    buildMeaningfulTagline,
    buildMeaningfulProfile,
    normalizeFaqEntries
  };
});
