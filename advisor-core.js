(function(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.LlmsAdvisorCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const JSON_EXPORT_FORMAT = 'llms-generator-config';
  const JSON_EXPORT_VERSION = 1;
  const MODULE_SETTING_KEYS = Object.freeze([
    'module_llms_generator_status',
    'module_llms_generator_site_title',
    'module_llms_generator_site_tagline',
    'module_llms_generator_ai_block_status',
    'module_llms_generator_ai_generation_mode',
    'module_llms_generator_ai_profile',
    'module_llms_generator_ai_sitemaps',
    'module_llms_generator_ai_sources',
    'module_llms_generator_ai_priority_links',
    'module_llms_generator_ai_rules',
    'module_llms_generator_ai_faq',
    'module_llms_generator_ai_content_policy',
    'module_llms_generator_ai_url_logic',
    'module_llms_generator_home_page_title',
    'module_llms_generator_pages_status',
    'module_llms_generator_pages_description_mode',
    'module_llms_generator_pages_description_limit',
    'module_llms_generator_heading_pages',
    'module_llms_generator_pages_sort_order',
    'module_llms_generator_products_status',
    'module_llms_generator_products_description_mode',
    'module_llms_generator_products_description_limit',
    'module_llms_generator_heading_products',
    'module_llms_generator_products_sort_order',
    'module_llms_generator_brands_status',
    'module_llms_generator_heading_brands',
    'module_llms_generator_brands_sort_order',
    'module_llms_generator_categories_sort_order',
    'module_llms_generator_categories_status',
    'module_llms_generator_categories_extended',
    'module_llms_generator_categories_description_mode',
    'module_llms_generator_categories_description_limit',
    'module_llms_generator_heading_categories',
    'module_llms_generator_section_limit',
    'module_llms_generator_generation_strategy',
    'module_llms_generator_child_directory',
    'module_llms_generator_default_chunk_size',
    'module_llms_generator_pages_mode',
    'module_llms_generator_pages_all_output',
    'module_llms_generator_pages_specific_output',
    'module_llms_generator_page_ids',
    'module_llms_generator_products_mode',
    'module_llms_generator_products_source',
    'module_llms_generator_products_limit',
    'module_llms_generator_products_period_days',
    'module_llms_generator_products_all_output',
    'module_llms_generator_products_chunk_size',
    'module_llms_generator_products_specific_output',
    'module_llms_generator_product_ids',
    'module_llms_generator_brands_mode',
    'module_llms_generator_brands_all_output',
    'module_llms_generator_brands_specific_output',
    'module_llms_generator_manufacturer_ids',
    'module_llms_generator_categories_mode',
    'module_llms_generator_categories_all_output',
    'module_llms_generator_categories_specific_output',
    'module_llms_generator_category_ids',
    'module_llms_generator_custom_sections'
  ]);
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
    /priority/i,
    /ld\+json/i,
    /faqpage/i
  ];

  function collapseWhitespace(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function decodeHtmlEntities(text) {
    return String(text || '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&#160;/gi, ' ');
  }

  function stripHtml(text) {
    return decodeHtmlEntities(String(text || '').replace(/<[^>]+>/g, ' '));
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
    const normalized = collapseWhitespace(stripHtml(text));

    if (!normalized || looksTechnicalText(normalized)) {
      return '';
    }

    return normalized;
  }

  function normalizeFaqText(text) {
    return collapseWhitespace(stripHtml(text).replace(/[|\r\n]+/g, ' '));
  }

  function collectTypeNames(typeValue) {
    if (Array.isArray(typeValue)) {
      return typeValue.map((item) => String(item || '').toLowerCase());
    }

    return String(typeValue || '')
      .split(/\s*,\s*/)
      .map((item) => item.toLowerCase())
      .filter(Boolean);
  }

  function readTextValue(value) {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      return value.map((item) => readTextValue(item)).filter(Boolean).join(' ');
    }

    if (typeof value === 'object') {
      return readTextValue(
        value.text
          || value.name
          || value.value
          || value.question
          || value.headline
          || value.answer
          || value.acceptedAnswer
      );
    }

    return '';
  }

  function parseFaqPipeLine(line) {
    const text = normalizeFaqText(line);
    const separator = text.indexOf('|');

    if (separator === -1) {
      return null;
    }

    const question = normalizeFaqText(text.slice(0, separator));
    const answer = normalizeFaqText(text.slice(separator + 1));

    if (!question || !answer) {
      return null;
    }

    return {
      question,
      answer,
      sourceType: 'manual',
      sourceUrl: '',
      confidence: 'verified',
      confirmed: true
    };
  }

  function normalizeFaqRecordCandidate(item, defaults) {
    const meta = defaults || {};
    let question = '';
    let answer = '';
    let sourceType = meta.sourceType || 'manual';
    let sourceUrl = meta.sourceUrl || '';
    let confidence = meta.confidence || 'verified';
    let confirmed = meta.confirmed !== false;

    if (typeof item === 'string') {
      const parsed = parseFaqPipeLine(item);
      return parsed;
    }

    if (Array.isArray(item)) {
      question = readTextValue(item[0]);
      answer = readTextValue(item[1]);
      if (item[2] && typeof item[2] === 'object') {
        sourceType = item[2].sourceType || sourceType;
        sourceUrl = item[2].sourceUrl || sourceUrl;
        confidence = item[2].confidence || confidence;
        if (Object.prototype.hasOwnProperty.call(item[2], 'confirmed')) {
          confirmed = item[2].confirmed !== false;
        }
      }
    } else if (item && typeof item === 'object') {
      question = readTextValue(item.question || item.name || item.headline || item.title);
      answer = readTextValue(
        item.answer
          || item.text
          || item.acceptedAnswer
          || item.acceptedAnswerText
          || item.description
          || item.content
      );
      sourceType = item.sourceType || item.source_type || sourceType;
      sourceUrl = item.sourceUrl || item.source_url || item.url || sourceUrl;
      confidence = item.confidence || confidence;
      if (Object.prototype.hasOwnProperty.call(item, 'confirmed')) {
        confirmed = item.confirmed !== false;
      }
    }

    question = normalizeFaqText(question);
    answer = normalizeFaqText(answer);

    if (!question || !answer || looksTechnicalText(question) || looksTechnicalText(answer)) {
      return null;
    }

    return {
      question,
      answer,
      sourceType,
      sourceUrl,
      confidence,
      confirmed
    };
  }

  function dedupeFaqRecords(records) {
    const seen = new Set();
    const deduped = [];

    records.forEach((record) => {
      if (!record) {
        return;
      }

      const key = `${record.question.toLowerCase()}\n${record.answer.toLowerCase()}`;

      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      deduped.push(record);
    });

    return deduped;
  }

  function normalizeFaqRecords(items, options) {
    const sourceItems = Array.isArray(items)
      ? items
      : typeof items === 'string'
        ? items
            .replace(/\r/g, '')
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
        : [];
    const defaults = options || {};
    const confirmedOnly = defaults.confirmedOnly === true;
    const records = [];

    sourceItems.forEach((item) => {
      const record = normalizeFaqRecordCandidate(item, {
        sourceType: defaults.sourceType || 'manual',
        sourceUrl: defaults.sourceUrl || '',
        confidence: defaults.confidence || 'verified',
        confirmed: defaults.confirmed !== false
      });

      if (!record) {
        return;
      }

      if (confirmedOnly && record.confirmed !== true && record.confidence !== 'verified') {
        return;
      }

      records.push(record);
    });

    return dedupeFaqRecords(records);
  }

  function normalizeFaqEntries(items, options) {
    return normalizeFaqRecords(items, options)
      .map((record) => `${record.question}|${record.answer}`)
      .join('\n');
  }

  function extractJsonLdDocuments(source) {
    const documents = [];
    const pattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match = null;

    while ((match = pattern.exec(String(source || '')))) {
      const raw = match[1].trim();

      if (raw) {
        documents.push(raw);
      }
    }

    return documents;
  }

  function tryParseJson(text) {
    try {
      return JSON.parse(text);
    } catch (error) {
      return null;
    }
  }

  function pushFaqQuestion(node, records, meta) {
    if (!node || typeof node !== 'object') {
      return;
    }

    const question = normalizeFaqText(readTextValue(node.name || node.question || node.headline || node.text));
    const answer = normalizeFaqText(readTextValue(node.acceptedAnswer || node.answer || node.suggestedAnswer || node.text));

    if (!question || !answer || looksTechnicalText(question) || looksTechnicalText(answer)) {
      return;
    }

    records.push({
      question,
      answer,
      sourceType: 'json-ld',
      sourceUrl: meta.pageUrl || '',
      confidence: 'verified',
      confirmed: true
    });
  }

  function walkJsonLd(node, visitor) {
    if (!node || typeof node !== 'object') {
      return;
    }

    visitor(node);

    if (Array.isArray(node)) {
      node.forEach((item) => walkJsonLd(item, visitor));
      return;
    }

    Object.keys(node).forEach((key) => {
      walkJsonLd(node[key], visitor);
    });
  }

  function extractFaqRecordsFromJsonLd(source, pageUrl) {
    const records = [];
    const documents = extractJsonLdDocuments(source);

    documents.forEach((document) => {
      const parsed = tryParseJson(document);

      if (!parsed) {
        return;
      }

      walkJsonLd(parsed, (node) => {
        const types = collectTypeNames(node['@type'] || node.type);

        if (types.includes('faqpage')) {
          const entities = Array.isArray(node.mainEntity) ? node.mainEntity : [node.mainEntity];
          entities.forEach((entity) => pushFaqQuestion(entity, records, { pageUrl }));
        }

        if (types.includes('question')) {
          pushFaqQuestion(node, records, { pageUrl });
        }
      });
    });

    return dedupeFaqRecords(records);
  }

  function extractFaqRecordsFromHtml(source, pageUrl) {
    const html = String(source || '');
    const records = [];
    let match = null;

    const detailsPattern = /<details\b[^>]*>([\s\S]*?)<\/details>/gi;
    while ((match = detailsPattern.exec(html))) {
      const block = match[1];
      const summaryMatch = block.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i);

      if (!summaryMatch) {
        continue;
      }

      const question = normalizeFaqText(summaryMatch[1]);
      const answer = normalizeFaqText(block.replace(summaryMatch[0], ''));

      if (!question || !answer || looksTechnicalText(question) || looksTechnicalText(answer)) {
        continue;
      }

      records.push({
        question,
        answer,
        sourceType: 'html',
        sourceUrl: pageUrl || '',
        confidence: 'verified',
        confirmed: true
      });
    }

    const dtDdPattern = /<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi;
    while ((match = dtDdPattern.exec(html))) {
      const question = normalizeFaqText(match[1]);
      const answer = normalizeFaqText(match[2]);

      if (!question || !answer || looksTechnicalText(question) || looksTechnicalText(answer)) {
        continue;
      }

      records.push({
        question,
        answer,
        sourceType: 'html',
        sourceUrl: pageUrl || '',
        confidence: 'verified',
        confirmed: true
      });
    }

    const qaPattern = /data-faq-question[^>]*>([\s\S]*?)<[^>]+data-faq-answer[^>]*>([\s\S]*?)</gi;
    if (!records.length) {
      const questionBlocks = html.match(/<[^>]+data-faq-question[^>]*>[\s\S]*?<\/[^>]+>/gi) || [];
      const answerBlocks = html.match(/<[^>]+data-faq-answer[^>]*>[\s\S]*?<\/[^>]+>/gi) || [];
      const total = Math.min(questionBlocks.length, answerBlocks.length);

      for (let index = 0; index < total; index += 1) {
        const question = normalizeFaqText(questionBlocks[index].replace(/<[^>]+>/g, ' '));
        const answer = normalizeFaqText(answerBlocks[index].replace(/<[^>]+>/g, ' '));

        if (!question || !answer || looksTechnicalText(question) || looksTechnicalText(answer)) {
          continue;
        }

        records.push({
          question,
          answer,
          sourceType: 'html',
          sourceUrl: pageUrl || '',
          confidence: 'verified',
          confirmed: true
        });
      }
    }

    return dedupeFaqRecords(records);
  }

  function extractFaqRecordsFromFallback(source, pageUrl) {
    const lines = String(source || '')
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => collapseWhitespace(stripHtml(line)))
      .filter(Boolean);
    const records = [];

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const pipeRecord = parseFaqPipeLine(line);

      if (pipeRecord) {
        pipeRecord.sourceType = 'fallback';
        pipeRecord.sourceUrl = pageUrl || '';
        pipeRecord.confidence = 'inference';
        pipeRecord.confirmed = false;
        records.push(pipeRecord);
        continue;
      }

      const questionMatch = line.match(/^(?:q|question|вопрос)\s*[:\-]\s*(.+)$/i);

      if (questionMatch) {
        const question = normalizeFaqText(questionMatch[1]);
        const nextLine = lines[index + 1] || '';
        const answerMatch = nextLine.match(/^(?:a|answer|ответ)\s*[:\-]\s*(.+)$/i);
        let answer = '';

        if (answerMatch) {
          answer = normalizeFaqText(answerMatch[1]);
          index += 1;
        } else if (nextLine && !/^(?:q|question|вопрос)\s*[:\-]/i.test(nextLine)) {
          answer = normalizeFaqText(nextLine);
          index += 1;
        }

        if (question && answer && !looksTechnicalText(question) && !looksTechnicalText(answer)) {
          records.push({
            question,
            answer,
            sourceType: 'fallback',
            sourceUrl: pageUrl || '',
            confidence: 'inference',
            confirmed: false
          });
        }
        continue;
      }

      if (/\?$/u.test(line) && lines[index + 1]) {
        const question = normalizeFaqText(line);
        const answer = normalizeFaqText(lines[index + 1]);

        if (question && answer && !looksTechnicalText(question) && !looksTechnicalText(answer)) {
          records.push({
            question,
            answer,
            sourceType: 'fallback',
            sourceUrl: pageUrl || '',
            confidence: 'inference',
            confirmed: false
          });
          index += 1;
        }
      }
    }

    return dedupeFaqRecords(records);
  }

  function extractFaqRecords(source, pageUrl) {
    const jsonLd = extractFaqRecordsFromJsonLd(source, pageUrl);

    if (jsonLd.length) {
      return jsonLd;
    }

    const html = extractFaqRecordsFromHtml(source, pageUrl);

    if (html.length) {
      return html;
    }

    return extractFaqRecordsFromFallback(source, pageUrl);
  }

  function getModuleSettingKeys() {
    return MODULE_SETTING_KEYS.slice();
  }

  function normalizeCustomSection(section) {
    if (!section || typeof section !== 'object') {
      return null;
    }

    const normalized = {};

    ['title', 'type', 'data', 'data_manual'].forEach((key) => {
      if (section[key] !== undefined && section[key] !== null) {
        normalized[key] = section[key];
      }
    });

    if (Array.isArray(section.data_ids)) {
      normalized.data_ids = section.data_ids
        .map((item) => parseInt(item, 10))
        .filter((item) => Number.isFinite(item) && item > 0);
    } else if (section.data_ids !== undefined && section.data_ids !== null) {
      normalized.data_ids = section.data_ids;
    }

    if (section.limit !== undefined && section.limit !== null) {
      normalized.limit = section.limit;
    }

    return Object.keys(normalized).length ? normalized : null;
  }

  function filterModuleSettings(settings, options) {
    const source = settings && typeof settings === 'object' ? settings : {};
    const settingsKeys = getModuleSettingKeys();
    const confirmedOnly = !options || options.confirmedOnly !== false;
    const faqRecords = options && Array.isArray(options.faqRecords) ? options.faqRecords : null;
    const filtered = {};

    settingsKeys.forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(source, key)) {
        return;
      }

      const value = source[key];

      if (value === undefined || value === null) {
        return;
      }

      if (/_ids$/.test(key) && Array.isArray(value)) {
        filtered[key] = value
          .map((item) => parseInt(item, 10))
          .filter((item) => Number.isFinite(item) && item > 0)
          .join(',');
        return;
      }

      if (key === 'module_llms_generator_ai_faq') {
        const faqSource = faqRecords || value;
        filtered[key] = normalizeFaqEntries(faqSource, {
          confirmedOnly,
          sourceType: 'manual'
        });
        return;
      }

      if (key === 'module_llms_generator_custom_sections' && Array.isArray(value)) {
        filtered[key] = value
          .map((section) => normalizeCustomSection(section))
          .filter(Boolean);
        return;
      }

      filtered[key] = value;
    });

    return filtered;
  }

  function buildJsonExportPayload(input, meta) {
    const payloadInput = input && typeof input === 'object' ? input : {};
    const settingsSource = payloadInput.settings && typeof payloadInput.settings === 'object' ? payloadInput.settings : payloadInput;
    const faqRecords = Array.isArray(payloadInput.faqEntries)
      ? payloadInput.faqEntries
      : Array.isArray(payloadInput.faqRecords)
        ? payloadInput.faqRecords
        : null;
    const generatedAt = (meta && meta.generatedAt) || payloadInput.generatedAt || new Date().toISOString();
    const source = (meta && meta.source) || payloadInput.source || {};
    const summary = (meta && meta.summary) || payloadInput.summary || {};

    return {
      format: JSON_EXPORT_FORMAT,
      version: JSON_EXPORT_VERSION,
      generated_at: generatedAt,
      source: {
        tool: source.tool || 'llms-setup-advisor',
        site_url: source.site_url || source.siteUrl || ''
      },
      summary,
      settings: filterModuleSettings(settingsSource, {
        confirmedOnly: !meta || meta.confirmedFaqOnly !== false,
        faqRecords
      })
    };
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

  return {
    JSON_EXPORT_FORMAT,
    JSON_EXPORT_VERSION,
    getModuleSettingKeys,
    filterModuleSettings,
    buildJsonExportPayload,
    looksTechnicalText,
    sanitizeNarrativeText,
    guessTagline,
    buildMeaningfulTagline,
    buildMeaningfulProfile,
    normalizeFaqText,
    normalizeFaqRecords,
    normalizeFaqEntries,
    extractFaqRecordsFromJsonLd,
    extractFaqRecordsFromHtml,
    extractFaqRecordsFromFallback,
    extractFaqRecords
  };
});
