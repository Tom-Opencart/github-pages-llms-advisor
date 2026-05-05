const form = document.getElementById('advisor-form');
const siteUrlInput = document.getElementById('site-url');
const manualHintsInput = document.getElementById('manual-hints');
const analyzeButton = document.getElementById('analyze-button');
const demoButton = document.getElementById('demo-button');
const statusBox = document.getElementById('status-box');
const statusText = document.getElementById('status-text');
const statusSpinner = statusBox.querySelector('.spinner');
const discoveryGrid = document.getElementById('discovery-grid');
const recommendationsBox = document.getElementById('module-recommendations');
const exportsList = document.getElementById('exports-list');
const llmsPreview = document.getElementById('llms-preview');

const discoveryTemplate = document.getElementById('discovery-item-template');
const exportTemplate = document.getElementById('export-item-template');
let latestDownloadPayload = null;

const SERVICE_HINTS = [
  { key: 'about', label: 'О компании', patterns: ['/about', '/o-kompanii', '/about-us', '/company', '/about/'] },
  { key: 'contacts', label: 'Контакты', patterns: ['/contacts', '/contact', '/kontakty', '/contact-us', '/kontakty/'] },
  { key: 'delivery', label: 'Доставка', patterns: ['/delivery', '/dostavka', '/shipping', '/dostavka/'] },
  { key: 'payment', label: 'Оплата', patterns: ['/payment', '/oplata', '/payment-info', '/oplata/'] },
  { key: 'order', label: 'Оформление заказа', patterns: ['/checkout', '/order', '/make-order', '/zakaz', '/make-order/'] },
  { key: 'faq', label: 'FAQ / Вопросы и ответы', patterns: ['/faq', '/voprosy-i-otvety', '/questions'] },
  { key: 'reviews', label: 'Отзывы', patterns: ['/reviews', '/otzyvy', '/testimonials'] }
];

const BLOG_HINTS = [
  { key: 'news', label: 'Новости', patterns: ['/news', '/novosti'] },
  { key: 'blog', label: 'Блог', patterns: ['/blog', '/stati', '/articles'] },
  { key: 'reviews', label: 'Обзоры', patterns: ['/obzory', '/reviews', '/news/review'] }
];

const MARKETPLACE_WORDS = ['ozon', 'wildberries', 'яндекс маркет', 'marketplace', 'маркетплейс', 'маркетплейсов'];
const B2B_WORDS = ['опт', 'оптом', 'для бизнеса', 'b2b', 'поставк', 'корпоратив'];
const ECOM_WORDS = ['интернет-магазин', 'доставка', 'каталог', 'товар', 'корзина', 'заказ'];

const DEMO_SITE = 'https://standartpak.ru';
const DEMO_HINTS = 'магазин упаковки для бизнеса и маркетплейсов, важны сервисные страницы, статьи и обзоры';

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  await runAdvisor();
});

demoButton.addEventListener('click', async () => {
  siteUrlInput.value = DEMO_SITE;
  manualHintsInput.value = DEMO_HINTS;
  await runAdvisor();
});

downloadJsonButton.addEventListener('click', () => {
  if (!latestDownloadPayload) {
    return;
  }

  const fileName = buildConfigFileName(latestDownloadPayload.source.site_url);
  const blob = new Blob([JSON.stringify(latestDownloadPayload, null, 2)], { type: 'application/json;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);
});

function setStatus(type, text) {
  statusBox.className = `status-box status-box--${type}`;
  statusText.textContent = text;
  statusSpinner.hidden = type !== 'working';
}

function sanitizeMultiline(value) {
  return value
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

function normalizeUrl(input) {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error('Укажите URL сайта.');
  }

  const prepared = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(prepared);
  url.hash = '';

  return url;
}

function uniq(list) {
  return [...new Set(list.filter(Boolean))];
}

function slugifyHostname(hostname) {
  return hostname
    .replace(/^www\./i, '')
    .replace(/[^a-z0-9.-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildConfigFileName(siteUrl) {
  try {
    const url = new URL(siteUrl);
    return `llms-config-${slugifyHostname(url.hostname)}.json`;
  } catch (error) {
    return 'llms-config.json';
  }
}

async function fetchTextWithFallback(targetUrl) {
  const encoded = encodeURIComponent(targetUrl);
  const candidates = [
    { label: 'direct', url: targetUrl },
    { label: 'allorigins', url: `https://api.allorigins.win/raw?url=${encoded}` },
    { label: 'jina-ai', url: `https://r.jina.ai/http://${targetUrl.replace(/^https?:\/\//i, '')}` }
  ];

  const errors = [];

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate.url, { method: 'GET' });

      if (!response.ok) {
        errors.push(`${candidate.label}: HTTP ${response.status}`);
        continue;
      }

      const text = await response.text();

      if (text && text.trim().length > 0) {
        return {
          ok: true,
          source: candidate.label,
          url: candidate.url,
          text
        };
      }
    } catch (error) {
      errors.push(`${candidate.label}: ${error.message}`);
    }
  }

  return {
    ok: false,
    source: 'none',
    url: targetUrl,
    text: '',
    errors
  };
}

function cleanText(text) {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitle(source) {
  const titleMatch = source.match(/<title[^>]*>(.*?)<\/title>/i);

  if (titleMatch) {
    return cleanText(titleMatch[1]);
  }

  const headingMatch = source.match(/^#\s+(.+)$/m);
  return headingMatch ? headingMatch[1].trim() : '';
}

function extractMetaDescription(source) {
  const metaMatch = source.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  return metaMatch ? cleanText(metaMatch[1]) : '';
}

function extractUrls(source, baseUrl) {
  const found = [];
  const urlPattern = /(https?:\/\/[^\s"'<>]+)/gi;
  const hrefPattern = /href=["']([^"'#]+)["']/gi;

  for (const match of source.matchAll(urlPattern)) {
    found.push(match[1]);
  }

  for (const match of source.matchAll(hrefPattern)) {
    try {
      found.push(new URL(match[1], baseUrl).href);
    } catch (error) {
      // ignore malformed links
    }
  }

  return uniq(
    found
      .map((item) => item.replace(/[),.;]+$/g, ''))
      .filter((item) => /^https?:\/\//i.test(item))
  );
}

function scoreWords(text, words) {
  const source = text.toLowerCase();
  let score = 0;

  words.forEach((word) => {
    if (source.includes(word)) {
      score += 1;
    }
  });

  return score;
}

function detectSiteFocus(text, hints) {
  const source = `${text} ${hints}`.toLowerCase();

  return {
    marketplace: scoreWords(source, MARKETPLACE_WORDS) > 0,
    b2b: scoreWords(source, B2B_WORDS) > 0,
    ecommerce: scoreWords(source, ECOM_WORDS) > 0
  };
}

function pickLongestText(parts) {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] || '';
}

function buildCandidateSitemaps(siteUrl) {
  const origin = siteUrl.origin;

  return uniq([
    `${origin}/robots.txt`,
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap-index.xml`,
    `${origin}/uni-news-sitemap`,
    `${origin}/news-sitemap.xml`,
    `${origin}/blog-sitemap.xml`
  ]);
}

async function collectRemoteData(siteUrl) {
  const candidates = buildCandidateSitemaps(siteUrl);
  const [homeResult, ...auxiliary] = await Promise.all([
    fetchTextWithFallback(siteUrl.href),
    ...candidates.map((item) => fetchTextWithFallback(item))
  ]);

  const textSources = [homeResult, ...auxiliary].filter((item) => item.ok);

  return {
    homeResult,
    combined: textSources.map((item) => item.text).join('\n'),
    combinedLinks: uniq(textSources.flatMap((item) => extractUrls(item.text, siteUrl.href))),
    readableSources: textSources,
    fetchErrors: [homeResult, ...auxiliary]
      .filter((item) => !item.ok && item.errors)
      .flatMap((item) => item.errors)
  };
}

function findServicePages(links, origin) {
  return SERVICE_HINTS.map((entry) => {
    const match = links.find((link) => {
      if (!link.startsWith(origin)) {
        return false;
      }

      return entry.patterns.some((pattern) => link.toLowerCase().includes(pattern.toLowerCase()));
    });

    return match ? { label: entry.label, url: match } : null;
  }).filter(Boolean);
}

function findBlogPages(links, origin) {
  return BLOG_HINTS.map((entry) => {
    const match = links.find((link) => {
      if (!link.startsWith(origin)) {
        return false;
      }

      return entry.patterns.some((pattern) => link.toLowerCase().includes(pattern.toLowerCase()));
    });

    return match ? { label: entry.label, url: match } : null;
  }).filter(Boolean);
}

function detectSitemaps(readableSources, origin) {
  const found = [];

  readableSources.forEach((source) => {
    if (source.url.toLowerCase().includes('robots.txt')) {
      const robotsSitemaps = [...source.text.matchAll(/sitemap:\s*(https?:\/\/[^\s]+)/gi)].map((match) => match[1]);
      found.push(...robotsSitemaps);
    } else if (/(sitemap|news-sitemap|blog-sitemap|uni-news-sitemap)/i.test(source.url.toLowerCase())) {
      found.push(source.url.replace(/^https:\/\/api\.allorigins\.win\/raw\?url=/i, ''));
    }
  });

  found.push(`${origin}/sitemap.xml`);

  return uniq(found.filter((item) => /^https?:\/\//i.test(item)));
}

function guessStoreTitle(title, hostname) {
  if (title) {
    return title.split('|')[0].split('—')[0].trim() || title.trim();
  }

  return slugifyHostname(hostname).replace(/-/g, ' ');
}

function guessTagline(metaDescription, cleanedBody, hints) {
  return pickLongestText([metaDescription, hints, cleanedBody.slice(0, 220)]).slice(0, 260).trim();
}

function sentenceCase(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function describeBusiness(title, tagline, focus) {
  const parts = [];

  parts.push(tagline || `${title} — сайт с каталогом и страницами для клиентов.`);

  if (focus.marketplace) {
    parts.push('Отдельно учитывайте сценарии, связанные с маркетплейсами и требованиями к упаковке, логистике или карточкам товаров.');
  }

  if (focus.b2b) {
    parts.push('Сайт имеет выраженный B2B-контекст, поэтому AI стоит учитывать оптовые заказы, корпоративные закупки и сервисные страницы.');
  }

  if (focus.ecommerce) {
    parts.push('Для ассортимента, условий заказа и характеристик основным источником должны быть каталог, карточки товаров и сервисные страницы.');
  }

  return parts.join(' ');
}

function dedupeLabeledLinks(items) {
  const seen = new Set();

  return items.filter((item) => {
    const key = `${item.label}|${item.url}`;

    if (!item.url || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function buildOfficialSources(siteUrl, servicePages, blogPages) {
  const origin = siteUrl.origin;
  const sources = [{ label: 'Главная магазина', url: origin }];
  const catalogMatch = [...servicePages, ...blogPages].find(() => false);

  sources.push({
    label: 'Каталог товаров',
    url: `${origin}/catalog`
  });

  servicePages.forEach((item) => sources.push(item));
  blogPages.forEach((item) => sources.push(item));

  return dedupeLabeledLinks(sources);
}

function buildPriorityLinks(siteUrl, servicePages, blogPages, focus, combinedLinks) {
  const origin = siteUrl.origin;
  const catalogLink = combinedLinks.find((item) => /\/cat\/|\/catalog\/|\/catalog$|\/shop\//i.test(item));
  const links = [
    { label: 'Главная магазина', url: origin },
    { label: 'Каталог товаров', url: catalogLink || `${origin}/catalog` }
  ];

  servicePages.forEach((item) => {
    if (['Контакты', 'О компании', 'Оформление заказа', 'Доставка', 'Оплата'].includes(item.label)) {
      links.push(item);
    }
  });

  blogPages.forEach((item) => links.push(item));

  if (focus.marketplace) {
    links.push({
      label: 'Материалы по маркетплейсам',
      url: blogPages.find((item) => item.label === 'Обзоры')?.url || blogPages.find((item) => item.label === 'Новости')?.url || origin
    });
  }

  return dedupeLabeledLinks(links);
}

function buildRules(focus, servicePages, blogPages) {
  const rules = [
    'Используйте каталог и карточки товара как основной источник для ассортимента, характеристик, размеров и описаний.',
    'Не утверждайте наличие, цену и сроки поставки без ссылки на конкретную карточку товара или официальную сервисную страницу.',
    'Для контактов, доставки, оплаты, самовывоза и оформления заказа используйте только сервисные страницы сайта.'
  ];

  if (blogPages.length) {
    rules.push('Новости, статьи и обзоры используйте как справочный слой, а не как замену официальным товарным и сервисным страницам.');
  }

  if (focus.marketplace) {
    rules.push('Если вопрос связан с маркетплейсами, в первую очередь ориентируйтесь на профильные статьи, обзоры и товарные разделы, связанные с упаковкой для маркетплейсов.');
  }

  if (focus.b2b) {
    rules.push('Если сайт работает с оптом или B2B-заказами, учитывайте, что условия и цены могут зависеть от объёма и формата поставки.');
  }

  return rules;
}

function buildServiceAnswer(servicePages) {
  if (!servicePages.length) {
    return 'Используйте официальные сервисные страницы сайта: контакты, доставка, оплата, оформление заказа и другие клиентские разделы.';
  }

  return `Используйте официальные сервисные страницы сайта: ${servicePages.map((item) => `${item.label} — ${item.url}`).join('; ')}.`;
}

function buildFaq(title, focus, servicePages, blogPages) {
  const faq = [
    {
      question: `Что продаёт ${title}?`,
      answer: 'Используйте главную страницу, каталог и карточки товаров как главный источник информации об ассортименте магазина.'
    },
    {
      question: 'Где смотреть точные характеристики и размеры товаров?',
      answer: 'Точные размеры, формат, материал, комплектацию и технические детали лучше брать только из конкретных карточек товара.'
    },
    {
      question: 'Где смотреть условия заказа и контакты?',
      answer: buildServiceAnswer(servicePages)
    }
  ];

  if (focus.marketplace) {
    faq.push({
      question: 'Есть ли на сайте информация для маркетплейсов?',
      answer: 'Да, при вопросах о маркетплейсах используйте профильные статьи, обзоры и связанные категории товаров. Они лучше всего объясняют упаковочные сценарии и требования площадок.'
    });
  }

  if (focus.b2b) {
    faq.push({
      question: 'Подходит ли сайт для оптовых и B2B-запросов?',
      answer: 'Да, если магазин явно работает с оптовыми заказами, учитывайте это в ответах и не делайте выводы о цене без проверки официальных страниц и карточек товара.'
    });
  }

  if (blogPages.length) {
    faq.push({
      question: 'Где смотреть статьи, обзоры и полезные материалы?',
      answer: `Для справочного контента используйте разделы: ${blogPages.map((item) => `${item.label} — ${item.url}`).join('; ')}.`
    });
  }

  return faq;
}

function buildUrlLogic(siteUrl, links, blogPages) {
  const origin = siteUrl.origin;
  const lines = [];
  const catalogLink = links.find((item) => /\/cat\/|\/catalog\/|\/catalog$|\/shop\//i.test(item));

  lines.push(
    catalogLink
      ? `Каталог и товарные разделы, вероятно, используют отдельную SEO-структуру наподобие ${catalogLink}.`
      : `Каталог и товарные страницы нужно считать основной зоной коммерческой информации внутри домена ${origin}.`
  );
  lines.push('Сервисные страницы обычно открываются по отдельным SEO URL и не должны смешиваться с товарными карточками.');

  if (blogPages.length) {
    lines.push(`Справочные материалы и статьи находятся в отдельных разделах: ${blogPages.map((item) => item.url).join(', ')}.`);
  }

  return lines;
}

function buildCustomBlocks(servicePages, blogPages) {
  const blocks = [];

  if (servicePages.length) {
    blocks.push({
      title: 'Сервисные страницы',
      entries: servicePages.map((item) => ({
        title: item.label,
        url: item.url,
        description: `Официальная сервисная страница сайта: ${item.label.toLowerCase()}.`
      }))
    });
  }

  if (blogPages.length) {
    blocks.push({
      title: blogPages.some((item) => item.label === 'Обзоры') ? 'Обзоры и полезные материалы' : 'Полезные статьи',
      entries: blogPages.map((item) => ({
        title: item.label,
        url: item.url,
        description: `Справочный раздел сайта: ${item.label.toLowerCase()}.`
      }))
    });
  }

  return blocks;
}

function buildModuleSettings(focus, servicePages, blogPages) {
  return [
    {
      title: 'Категории',
      text: 'Включить. Лучше оставить автоматический режим и не перегружать основной файл длинными описаниями категорий.'
    },
    {
      title: 'Товары',
      text: focus.ecommerce
        ? 'Включить, но для больших магазинов использовать не весь каталог в основном llms.txt, а хиты продаж, популярные товары или дочерний файл.'
        : 'Включать только если на сайте действительно есть коммерческий каталог. В основном файле товары не должны перегружать структуру.'
    },
    {
      title: 'Страницы',
      text: servicePages.length
        ? 'Лучший режим — ручной выбор. В первую очередь включить контакты, оформление заказа, доставку, оплату и другие сервисные страницы.'
        : 'Если сервисные страницы не найдены автоматически, их стоит выбрать вручную: контакты, доставка, оплата, гарантия, о компании.'
    },
    {
      title: 'Бренды',
      text: 'Оставлять только если бренды реально помогают понять структуру ассортимента. Для многих магазинов этот блок вторичен.'
    },
    {
      title: 'Технический режим',
      text: 'Рекомендуемый режим генерации — сбалансированный. Основной llms.txt должен оставаться компактным, а большие секции лучше выносить в дочерние файлы.'
    },
    {
      title: 'Кастомные блоки',
      text: blogPages.length || servicePages.length
        ? 'Добавить ручные блоки для сервисных страниц, обзоров, новостей и полезных материалов. Это даёт AI полезный контекст без перегруза стандартных разделов.'
        : 'Использовать кастомные блоки для всего важного, чего нет в стандартных сущностях OpenCart.'
    }
  ];
}

function formatLabeledLinks(items) {
  return items.map((item) => `${item.label}|${item.url}`).join('\n');
}

function formatFaq(items) {
  return items.map((item) => `${item.question}\n${item.answer}`).join('\n\n');
}

function formatRules(items) {
  return items.map((item) => `- ${item}`).join('\n');
}

function formatCustomBlock(block) {
  return block.entries.map((entry) => `${entry.title}|${entry.url}|${entry.description}`).join('\n');
}

function formatPreview(data) {
  const lines = [
    `# ${data.siteTitle}`,
    `> ${data.tagline}`,
    '',
    `> ${data.aiProfile}`,
    '',
    '## Документация и карты'
  ];

  data.sitemaps.forEach((item) => lines.push(`- [${item.label}](${item.url})`));
  lines.push('', '## Официальные источники данных');
  data.officialSources.forEach((item) => lines.push(`- [${item.label}](${item.url})`));
  lines.push('', '## Приоритетные разделы');
  data.priorityLinks.forEach((item) => lines.push(`- [${item.label}](${item.url})`));
  lines.push('', '## Правила для LLM');
  data.rules.forEach((item) => lines.push(`- ${item}`));
  lines.push('', '## FAQ для LLM');
  data.faq.forEach((item) => lines.push(`- ${item.question}: ${item.answer}`));

  data.customBlocks.forEach((block) => {
    lines.push('', `## ${block.title}`);
    block.entries.forEach((entry) => lines.push(`- [${entry.title}](${entry.url})`));
  });

  return lines.join('\n');
}

function makeExportItems(data) {
  const blocks = [
    { title: 'Название сайта', hint: 'Поле module_llms_generator_site_title', text: data.siteTitle },
    { title: 'Краткое описание сайта', hint: 'Поле module_llms_generator_site_tagline', text: data.tagline },
    { title: 'AI-профиль', hint: 'Поле module_llms_generator_ai_profile', text: data.aiProfile },
    { title: 'Карты сайта', hint: 'Поле module_llms_generator_ai_sitemaps', text: formatLabeledLinks(data.sitemaps) },
    { title: 'Официальные источники данных', hint: 'Поле module_llms_generator_ai_sources', text: formatLabeledLinks(data.officialSources) },
    { title: 'Приоритетные разделы', hint: 'Поле module_llms_generator_ai_priority_links', text: formatLabeledLinks(data.priorityLinks) },
    { title: 'Правила для LLM', hint: 'Поле module_llms_generator_ai_rules', text: formatRules(data.rules) },
    { title: 'FAQ для LLM', hint: 'Пары вопрос / ответ для AI FAQ', text: formatFaq(data.faq) },
    { title: 'Логика URL', hint: 'Поле module_llms_generator_ai_url_logic', text: formatRules(data.urlLogic) }
  ];

  data.customBlocks.forEach((block) => {
    blocks.push({
      title: `Кастомный блок: ${block.title}`,
      hint: 'Режим: произвольный список (Markdown)',
      text: formatCustomBlock(block)
    });
  });

  return blocks;
}

function normalizePipeEntries(items) {
  return items.map((item) => `${item.label}|${item.url}`).join('\n');
}

function normalizeLineEntries(items) {
  return items.join('\n');
}

function normalizeFaqEntries(items) {
  return items
    .map((item) => `${item.question}\n${item.answer}`)
    .join('\n\n');
}

function buildJsonSettingsPayload(data) {
  return {
    module_llms_generator_status: '1',
    module_llms_generator_site_title: data.siteTitle,
    module_llms_generator_site_tagline: data.tagline,
    module_llms_generator_ai_block_status: '1',
    module_llms_generator_ai_generation_mode: 'mixed',
    module_llms_generator_ai_profile: data.aiProfile,
    module_llms_generator_ai_sitemaps: normalizePipeEntries(data.sitemaps),
    module_llms_generator_ai_sources: normalizePipeEntries(data.officialSources),
    module_llms_generator_ai_priority_links: normalizePipeEntries(data.priorityLinks),
    module_llms_generator_ai_rules: normalizeLineEntries(data.rules),
    module_llms_generator_ai_faq: normalizeFaqEntries(data.faq),
    module_llms_generator_ai_content_policy: '',
    module_llms_generator_ai_url_logic: normalizeLineEntries(data.urlLogic),
    module_llms_generator_categories_status: data.recommendations.categories_status,
    module_llms_generator_categories_mode: data.recommendations.categories_mode,
    module_llms_generator_categories_description_mode: data.recommendations.categories_description_mode,
    module_llms_generator_categories_description_limit: data.recommendations.categories_description_limit,
    module_llms_generator_categories_sort_order: data.recommendations.categories_sort_order,
    module_llms_generator_category_ids: data.recommendations.category_ids,
    module_llms_generator_products_status: data.recommendations.products_status,
    module_llms_generator_products_mode: data.recommendations.products_mode,
    module_llms_generator_products_source: data.recommendations.products_source,
    module_llms_generator_products_period_days: data.recommendations.products_period_days,
    module_llms_generator_products_description_mode: data.recommendations.products_description_mode,
    module_llms_generator_products_description_limit: data.recommendations.products_description_limit,
    module_llms_generator_products_sort_order: data.recommendations.products_sort_order,
    module_llms_generator_product_ids: data.recommendations.product_ids,
    module_llms_generator_pages_status: data.recommendations.pages_status,
    module_llms_generator_pages_mode: data.recommendations.pages_mode,
    module_llms_generator_pages_description_mode: data.recommendations.pages_description_mode,
    module_llms_generator_pages_description_limit: data.recommendations.pages_description_limit,
    module_llms_generator_pages_sort_order: data.recommendations.pages_sort_order,
    module_llms_generator_page_ids: data.recommendations.page_ids,
    module_llms_generator_brands_status: data.recommendations.brands_status,
    module_llms_generator_brands_mode: data.recommendations.brands_mode,
    module_llms_generator_brands_sort_order: data.recommendations.brands_sort_order,
    module_llms_generator_manufacturer_ids: data.recommendations.manufacturer_ids,
    module_llms_generator_generation_strategy: data.recommendations.generation_strategy,
    module_llms_generator_child_directory: data.recommendations.child_directory,
    module_llms_generator_section_limit: data.recommendations.section_limit,
    module_llms_generator_default_chunk_size: data.recommendations.default_chunk_size,
    module_llms_generator_products_chunk_size: data.recommendations.products_chunk_size,
    module_llms_generator_custom_sections: data.customBlocks.map((block) => ({
      title: block.title,
      type: 'manual',
      data_manual: formatCustomBlock(block)
    }))
  };
}

function buildJsonDownloadPayload(data) {
  return {
    format: 'llms-generator-config',
    version: 1,
    generated_at: new Date().toISOString(),
    source: {
      tool: 'llms-setup-advisor',
      site_url: data.siteUrl
    },
    summary: {
      site_title: data.siteTitle,
      sitemap_count: data.sitemaps.length,
      faq_count: data.faq.length,
      custom_section_count: data.customBlocks.length
    },
    settings: buildJsonSettingsPayload(data)
  };
}

function renderLinksList(items) {
  if (!items.length) {
    return 'Ничего надёжного не найдено автоматически.';
  }

  return `<ul>${items.map((item) => `<li><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.label)}</a></li>`).join('')}</ul>`;
}

function renderChips(items) {
  if (!items.length) {
    return 'Ключевые признаки не выявлены.';
  }

  return `<div class="chip-list">${items.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join('')}</div>`;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderDiscovery(discovery) {
  discoveryGrid.innerHTML = '';

  [
    { title: 'Как прочитался сайт', content: discovery.readMode },
    { title: 'Обнаруженные sitemap', content: renderLinksList(discovery.sitemaps) },
    { title: 'Сервисные страницы', content: renderLinksList(discovery.servicePages) },
    { title: 'Новости, блог и обзоры', content: renderLinksList(discovery.blogPages) },
    { title: 'Ключевые признаки сайта', content: renderChips(discovery.flags) },
    {
      title: 'Ошибки чтения',
      content: discovery.errors.length
        ? `<ul>${discovery.errors.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
        : 'Критичных ошибок чтения не обнаружено.'
    }
  ].forEach((item) => {
    const fragment = discoveryTemplate.content.cloneNode(true);
    fragment.querySelector('.discovery-item__title').textContent = item.title;
    fragment.querySelector('.discovery-item__content').innerHTML = item.content;
    discoveryGrid.appendChild(fragment);
  });
}

function renderRecommendations(items) {
  recommendationsBox.innerHTML = '';

  items.forEach((item) => {
    const wrapper = document.createElement('article');
    wrapper.className = 'recommendation-block';
    wrapper.innerHTML = `
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.text)}</p>
    `;
    recommendationsBox.appendChild(wrapper);
  });
}

function renderExports(exportsData) {
  exportsList.innerHTML = '';

  exportsData.forEach((item, index) => {
    const fragment = exportTemplate.content.cloneNode(true);
    const details = fragment.querySelector('.export-item');
    const title = fragment.querySelector('.export-item__title');
    const hint = fragment.querySelector('.export-item__hint');
    const textarea = fragment.querySelector('.export-item__textarea');
    const button = fragment.querySelector('.export-copy');
    const state = fragment.querySelector('.export-item__state');

    if (index === 0) {
      details.open = true;
      state.textContent = 'Свернуть';
    }

    title.textContent = item.title;
    hint.textContent = item.hint;
    textarea.value = item.text;

    details.addEventListener('toggle', () => {
      state.textContent = details.open ? 'Свернуть' : 'Открыть';
    });

    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(item.text);
        button.textContent = 'Скопировано';
        setTimeout(() => {
          button.textContent = 'Копировать';
        }, 1400);
      } catch (error) {
        textarea.focus();
        textarea.select();
      }
    });

    exportsList.appendChild(fragment);
  });
}

function showSkeletons() {
  const skeletonCard = (title) => `
    <div class="skeleton skeleton--card">
      <div class="skeleton skeleton--title"></div>
      <div class="skeleton skeleton--text"></div>
      <div class="skeleton skeleton--text-short"></div>
    </div>`;

  discoveryGrid.innerHTML = `<div class="discovery-grid">${skeletonCard('')}${skeletonCard('')}${skeletonCard('')}${skeletonCard('')}${skeletonCard('')}${skeletonCard('')}</div>`;
  recommendationsBox.innerHTML = `${skeletonCard('')}${skeletonCard('')}${skeletonCard('')}`;
  exportsList.innerHTML = `${skeletonCard('')}${skeletonCard('')}${skeletonCard('')}`;
  llmsPreview.className = 'preview-box preview-box--loading';
  llmsPreview.textContent = '';
}

function hideSkeletons() {
  llmsPreview.className = 'preview-box';
}

function addFadeIn(parent) {
  const items = [...parent.children].filter((el) =>
    el.matches('article, .discovery-item, .recommendation-block, .export-item')
  );
  items.forEach((item, i) => {
    item.classList.add('card--fade');
    item.style.animationDelay = `${i * 0.06}s`;
  });
}
async function runAdvisor() {
  analyzeButton.disabled = true;
  analyzeButton.classList.add('btn--loading');
  demoButton.disabled = true;
  downloadJsonButton.disabled = true;
  latestDownloadPayload = null;
  showSkeletons();
  setStatus('working', 'Пробую прочитать сайт, sitemap и служебные страницы...');

  try {
    const siteUrl = normalizeUrl(siteUrlInput.value);
    const hints = sanitizeMultiline(manualHintsInput.value);
    const remote = await collectRemoteData(siteUrl);
    const cleanedBody = cleanText(remote.combined);
    const servicePages = findServicePages(remote.combinedLinks, siteUrl.origin);
    const blogPages = findBlogPages(remote.combinedLinks, siteUrl.origin);
    const focus = detectSiteFocus(`${cleanedBody} ${extractMetaDescription(remote.homeResult.text || '')}`, hints);
    const siteTitle = sentenceCase(guessStoreTitle(extractTitle(remote.homeResult.text || ''), siteUrl.hostname));
    const tagline = guessTagline(extractMetaDescription(remote.homeResult.text || ''), cleanedBody, hints);
    const aiProfile = describeBusiness(siteTitle, tagline, focus);
    const sitemaps = detectSitemaps(remote.readableSources, siteUrl.origin).map((url, index) => ({
      label: index === 0 ? 'Основная sitemap' : `Дополнительная sitemap ${index}`,
      url
    }));
    const officialSources = buildOfficialSources(siteUrl, servicePages, blogPages);
    const priorityLinks = buildPriorityLinks(siteUrl, servicePages, blogPages, focus, remote.combinedLinks);
    const rules = buildRules(focus, servicePages, blogPages);
    const faq = buildFaq(siteTitle, focus, servicePages, blogPages);
    const urlLogic = buildUrlLogic(siteUrl, remote.combinedLinks, blogPages);
    const customBlocks = buildCustomBlocks(servicePages, blogPages);
    const settings = buildModuleSettings(focus, servicePages, blogPages);
    const recommendations = {
      categories_status: '1',
      categories_mode: 'all',
      categories_description_mode: 'none',
      categories_description_limit: '300',
      categories_sort_order: '10',
      category_ids: [],
      products_status: '1',
      products_mode: 'all',
      products_source: 'bestseller',
      products_period_days: '90',
      products_description_mode: 'limited',
      products_description_limit: '300',
      products_sort_order: '20',
      product_ids: [],
      pages_status: '1',
      pages_mode: servicePages.length ? 'specific' : 'all',
      pages_description_mode: 'meta',
      pages_description_limit: '300',
      pages_sort_order: '30',
      page_ids: [],
      brands_status: '0',
      brands_mode: 'all',
      brands_sort_order: '40',
      manufacturer_ids: [],
      generation_strategy: 'hybrid',
      child_directory: 'llms',
      section_limit: '10',
      default_chunk_size: '200',
      products_chunk_size: '200'
    };
    const exportsData = makeExportItems({
      siteTitle,
      tagline,
      aiProfile,
      sitemaps,
      officialSources,
      priorityLinks,
      rules,
      faq,
      urlLogic,
      customBlocks
    });
    latestDownloadPayload = buildJsonDownloadPayload({
      siteUrl: siteUrl.href,
      siteTitle,
      tagline,
      aiProfile,
      sitemaps,
      officialSources,
      priorityLinks,
      rules,
      faq,
      urlLogic,
      customBlocks,
      recommendations
    });

    const readMode = remote.readableSources.length > 0
      ? `Удалось прочитать ${remote.readableSources.length} источник(а). Основной режим: ${remote.homeResult.source === 'none' ? 'fallback only' : remote.homeResult.source}.`
      : 'Автоматическое чтение сайта не сработало полноценно. Рекомендации собраны из URL, стандартных шаблонов и ваших подсказок.';

    renderDiscovery({
      readMode,
      sitemaps,
      servicePages,
      blogPages,
      flags: [
        focus.ecommerce ? 'Похож на интернет-магазин' : '',
        focus.marketplace ? 'Есть сигналы маркетплейсов' : '',
        focus.b2b ? 'Есть B2B / оптовый контекст' : '',
        remote.homeResult.source === 'allorigins' || remote.homeResult.source === 'jina-ai'
          ? 'Сработал fallback через публичный прокси'
          : 'Прямое чтение доступно'
      ].filter(Boolean),
      errors: remote.fetchErrors
    });
    addFadeIn(discoveryGrid);

    renderRecommendations(settings);
    addFadeIn(recommendationsBox);

    renderExports(exportsData);
    addFadeIn(exportsList);

    hideSkeletons();
    downloadJsonButton.disabled = false;
    llmsPreview.textContent = formatPreview({
      siteTitle,
      tagline,
      aiProfile,
      sitemaps,
      officialSources,
      priorityLinks,
      rules,
      faq,
      customBlocks
    });

    if (remote.readableSources.length === 0) {
      setStatus('warning', 'Сайт прочитался не полностью. Инструмент всё равно собрал стартовые рекомендации, но их важно проверить вручную.');
    } else if (remote.homeResult.source === 'allorigins' || remote.homeResult.source === 'jina-ai') {
      setStatus('warning', 'Анализ выполнен через fallback-режим. Результат полезный, но найденные ссылки и формулировки лучше ещё раз перепроверить.');
    } else {
      setStatus('success', 'Анализ завершён. Сначала прочитайте рекомендации, затем откройте нужные поля и копируйте только то, что подходит вашему магазину.');
    }
  } catch (error) {
    hideSkeletons();
    discoveryGrid.innerHTML = '<div class="placeholder">Анализ не выполнен. Проверьте URL и попробуйте ещё раз.</div>';
    recommendationsBox.innerHTML = '<div class="placeholder">Рекомендации пока не собраны.</div>';
    exportsList.innerHTML = '<div class="placeholder">Экспорт появится после успешного анализа.</div>';
    llmsPreview.textContent = '# Preview появится после анализа';
    downloadJsonButton.disabled = true;
    setStatus('error', error.message || 'Не удалось обработать сайт.');
  } finally {
    analyzeButton.classList.remove('btn--loading');
    analyzeButton.disabled = false;
    demoButton.disabled = false;
  }
}
