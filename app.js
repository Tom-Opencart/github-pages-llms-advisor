const form = document.getElementById('advisor-form');
const siteUrlInput = document.getElementById('site-url');
const manualHintsInput = document.getElementById('manual-hints');
const analyzeButton = document.getElementById('analyze-button');
const demoButton = document.getElementById('demo-button');
const statusBox = document.getElementById('status-box');
const statusText = document.getElementById('status-text');
const discoveryGrid = document.getElementById('discovery-grid');
const recommendationsBox = document.getElementById('module-recommendations');
const exportsList = document.getElementById('exports-list');
const llmsPreview = document.getElementById('llms-preview');

const discoveryTemplate = document.getElementById('discovery-item-template');
const exportTemplate = document.getElementById('export-item-template');

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

function setStatus(type, text) {
  statusBox.className = `status-box status-box--${type}`;
  statusText.textContent = text;
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

  if (metaMatch) {
    return cleanText(metaMatch[1]);
  }

  return '';
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
      const resolved = new URL(match[1], baseUrl).href;
      found.push(resolved);
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

  const marketplaceScore = scoreWords(source, MARKETPLACE_WORDS);
  const b2bScore = scoreWords(source, B2B_WORDS);
  const ecommerceScore = scoreWords(source, ECOM_WORDS);

  return {
    marketplace: marketplaceScore > 0,
    b2b: b2bScore > 0,
    ecommerce: ecommerceScore > 0
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
  const combined = textSources.map((item) => item.text).join('\n');
  const combinedLinks = uniq(
    textSources.flatMap((item) => extractUrls(item.text, siteUrl.href))
  );

  return {
    homeResult,
    auxiliary,
    combined,
    combinedLinks,
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

      const lower = link.toLowerCase();
      return entry.patterns.some((pattern) => lower.includes(pattern.toLowerCase()));
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

      const lower = link.toLowerCase();
      return entry.patterns.some((pattern) => lower.includes(pattern.toLowerCase()));
    });

    return match ? { label: entry.label, url: match } : null;
  }).filter(Boolean);
}

function detectSitemaps(readableSources, origin) {
  const found = [];

  readableSources.forEach((source) => {
    const lowerUrl = source.url.toLowerCase();
    const text = source.text;

    if (lowerUrl.includes('robots.txt')) {
      const robotsSitemaps = [...text.matchAll(/sitemap:\s*(https?:\/\/[^\s]+)/gi)].map((match) => match[1]);
      found.push(...robotsSitemaps);
    } else if (/(sitemap|news-sitemap|blog-sitemap|uni-news-sitemap)/i.test(lowerUrl)) {
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
  const candidate = pickLongestText([metaDescription, hints, cleanedBody.slice(0, 220)]);
  return candidate.slice(0, 260).trim();
}

function sentenceCase(text) {
  if (!text) {
    return '';
  }

  return text.charAt(0).toUpperCase() + text.slice(1);
}

function describeBusiness(title, tagline, focus) {
  const parts = [];

  if (tagline) {
    parts.push(tagline);
  } else {
    parts.push(`${title} — сайт с каталогом и страницами для клиентов.`);
  }

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

function buildOfficialSources(siteUrl, servicePages, blogPages) {
  const origin = siteUrl.origin;
  const sources = [
    { label: 'Главная магазина', url: origin },
    { label: 'Каталог товаров', url: `${origin}/catalog` }
  ];

  servicePages.forEach((item) => sources.push(item));
  blogPages.forEach((item) => sources.push(item));

  return dedupeLabeledLinks(sources.map((item) => ({
    label: item.label,
    url: item.url
  })));
}

function buildPriorityLinks(siteUrl, servicePages, blogPages, focus) {
  const origin = siteUrl.origin;
  const links = [{ label: 'Главная магазина', url: origin }];

  const catalogCandidates = [
    `${origin}/cat/`,
    `${origin}/catalog/`,
    `${origin}/catalog`,
    `${origin}/shop/`
  ];

  links.push({ label: 'Каталог товаров', url: catalogCandidates[0] });

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

function buildRules(focus, servicePages, blogPages) {
  const rules = [
    'Используйте каталог и карточки товара как основной источник для ассортимента, характеристик, размеров и описаний.',
    'Не утверждайте наличие, цену и сроки поставки без ссылки на конкретную карточку товара или официальную сервисную страницу.',
    'Для контактов, доставки, оплаты, самовывоза и оформления заказа используйте только сервисные страницы сайта.'
  ];

  if (blogPages.length > 0) {
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

  if (blogPages.length > 0) {
    faq.push({
      question: 'Где смотреть статьи, обзоры и полезные материалы?',
      answer: `Для справочного контента используйте разделы: ${blogPages.map((item) => `${item.label} — ${item.url}`).join('; ')}.`
    });
  }

  return faq;
}

function buildServiceAnswer(servicePages) {
  if (!servicePages.length) {
    return 'Используйте официальные сервисные страницы сайта: контакты, доставка, оплата, оформление заказа и другие клиентские разделы.';
  }

  return `Используйте официальные сервисные страницы сайта: ${servicePages.map((item) => `${item.label} — ${item.url}`).join('; ')}.`;
}

function buildUrlLogic(siteUrl, links, blogPages) {
  const origin = siteUrl.origin;
  const lines = [];

  const catalogLink = links.find((item) => /\/cat\/|\/catalog\/|\/catalog$|\/shop\//i.test(item));

  if (catalogLink) {
    lines.push(`Каталог и товарные разделы, вероятно, используют отдельную SEO-структуру наподобие ${catalogLink}.`);
  } else {
    lines.push(`Каталог и товарные страницы нужно считать основной зоной коммерческой информации внутри домена ${origin}.`);
  }

  lines.push('Сервисные страницы обычно открываются по отдельным SEO URL и не должны смешиваться с товарными карточками.');

  if (blogPages.length > 0) {
    lines.push(`Справочные материалы и статьи находятся в отдельных разделах: ${blogPages.map((item) => item.url).join(', ')}.`);
  }

  return lines;
}

function buildCustomBlocks(servicePages, blogPages) {
  const blocks = [];

  if (servicePages.length > 0) {
    blocks.push({
      title: 'Сервисные страницы',
      mode: 'manual',
      entries: servicePages.map((item) => ({
        title: item.label,
        url: item.url,
        description: `Официальная сервисная страница сайта: ${item.label.toLowerCase()}.`
      }))
    });
  }

  if (blogPages.length > 0) {
    blocks.push({
      title: blogPages.some((item) => item.label === 'Обзоры') ? 'Обзоры и полезные материалы' : 'Полезные статьи',
      mode: 'manual',
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
      text: 'Включить. Режим: автоматический. Описание: лучше не перегружать, чаще всего достаточно названий и ссылок. Подходит для отдельного дочернего файла.'
    },
    {
      title: 'Товары',
      text: focus.ecommerce
        ? 'Включить. Для больших магазинов лучше использовать хиты продаж или популярные товары, а не весь каталог в основном llms.txt. Описание: краткое из основного описания или meta description.'
        : 'Включить только если на сайте явно есть коммерческий каталог. Для главного файла лучше не перегружать товары и вынести их в дочерний файл.'
    },
    {
      title: 'Страницы',
      text: servicePages.length > 0
        ? 'Режим: ручной выбор. Включить в первую очередь сервисные страницы, потому что именно они дают AI надёжный контекст по условиям работы магазина.'
        : 'Если сервисные страницы не обнаружены автоматически, вручную выбрать контакты, доставку, оплату, гарантию, о компании и оформление заказа.'
    },
    {
      title: 'Бренды',
      text: 'Включать только если бренды действительно важны для структуры магазина и помогают понять ассортимент. Для многих магазинов этот раздел можно отключить.'
    },
    {
      title: 'Технический режим',
      text: 'Рекомендуемый стиль генерации: сбалансированный. Основной llms.txt должен оставаться компактным, а большие каталожные секции лучше выносить в /llms/*.txt.'
    },
    {
      title: 'Кастомные блоки',
      text: blogPages.length > 0 || servicePages.length > 0
        ? 'Добавить ручные блоки для сервисных страниц, обзоров, статей или внешних материалов. Именно они лучше всего расширяют llms.txt без перегруза стандартных разделов.'
        : 'Использовать кастомные блоки для сервисных страниц, внешнего блога, FAQ или специальных разделов, которых нет в стандартном OpenCart.'
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
  return block.entries
    .map((entry) => `${entry.title}|${entry.url}|${entry.description}`)
    .join('\n');
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

  data.sitemaps.forEach((item) => {
    lines.push(`- [${item.label}](${item.url})`);
  });

  lines.push('', '## Официальные источники данных');

  data.officialSources.forEach((item) => {
    lines.push(`- [${item.label}](${item.url})`);
  });

  lines.push('', '## Приоритетные разделы');

  data.priorityLinks.forEach((item) => {
    lines.push(`- [${item.label}](${item.url})`);
  });

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
    {
      title: 'Название сайта',
      hint: 'Поле module_llms_generator_site_title',
      text: data.siteTitle
    },
    {
      title: 'Краткое описание сайта',
      hint: 'Поле module_llms_generator_site_tagline',
      text: data.tagline
    },
    {
      title: 'AI-профиль',
      hint: 'Поле module_llms_generator_ai_profile',
      text: data.aiProfile
    },
    {
      title: 'Карты сайта',
      hint: 'Поле module_llms_generator_ai_sitemaps',
      text: formatLabeledLinks(data.sitemaps)
    },
    {
      title: 'Официальные источники данных',
      hint: 'Поле module_llms_generator_ai_sources',
      text: formatLabeledLinks(data.officialSources)
    },
    {
      title: 'Приоритетные разделы',
      hint: 'Поле module_llms_generator_ai_priority_links',
      text: formatLabeledLinks(data.priorityLinks)
    },
    {
      title: 'Правила для LLM',
      hint: 'Поле module_llms_generator_ai_rules',
      text: formatRules(data.rules)
    },
    {
      title: 'FAQ для LLM',
      hint: 'Пары вопрос / ответ для AI FAQ',
      text: formatFaq(data.faq)
    },
    {
      title: 'Логика URL',
      hint: 'Поле module_llms_generator_ai_url_logic',
      text: formatRules(data.urlLogic)
    }
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

function renderDiscovery(discovery) {
  discoveryGrid.innerHTML = '';

  const items = [
    {
      title: 'Сайт и чтение страниц',
      content: discovery.readMode
    },
    {
      title: 'Обнаруженные sitemap',
      content: renderLinksList(discovery.sitemaps)
    },
    {
      title: 'Сервисные страницы',
      content: renderLinksList(discovery.servicePages)
    },
    {
      title: 'Новости, блог и обзоры',
      content: renderLinksList(discovery.blogPages)
    },
    {
      title: 'Ключевые признаки сайта',
      content: renderChips(discovery.flags)
    },
    {
      title: 'Ошибки чтения',
      content: discovery.errors.length ? `<ul>${discovery.errors.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : 'Критичных ошибок чтения не обнаружено.'
    }
  ];

  items.forEach((item) => {
    const fragment = discoveryTemplate.content.cloneNode(true);
    fragment.querySelector('.discovery-item__title').textContent = item.title;
    fragment.querySelector('.discovery-item__content').innerHTML = item.content;
    discoveryGrid.appendChild(fragment);
  });
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

  exportsData.forEach((item) => {
    const fragment = exportTemplate.content.cloneNode(true);
    fragment.querySelector('.export-item__title').textContent = item.title;
    fragment.querySelector('.export-item__hint').textContent = item.hint;

    const textarea = fragment.querySelector('.export-item__textarea');
    textarea.value = item.text;

    const button = fragment.querySelector('.export-copy');
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

async function runAdvisor() {
  analyzeButton.disabled = true;
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
    const priorityLinks = buildPriorityLinks(siteUrl, servicePages, blogPages, focus);
    const rules = buildRules(focus, servicePages, blogPages);
    const faq = buildFaq(siteTitle, focus, servicePages, blogPages);
    const urlLogic = buildUrlLogic(siteUrl, remote.combinedLinks, blogPages);
    const customBlocks = buildCustomBlocks(servicePages, blogPages);
    const settings = buildModuleSettings(focus, servicePages, blogPages);
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
        remote.homeResult.source === 'allorigins' || remote.homeResult.source === 'jina-ai' ? 'Сработал fallback через публичный прокси' : 'Прямое чтение доступно'
      ].filter(Boolean),
      errors: remote.fetchErrors
    });

    renderRecommendations(settings);
    renderExports(exportsData);
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
      setStatus('warning', 'Анализ выполнен через fallback-режим. Результат полезный, но лучше всё равно перепроверить найденные ссылки и формулировки.');
    } else {
      setStatus('success', 'Анализ завершён. Можно копировать готовые блоки в LLMS.txt Generator.');
    }
  } catch (error) {
    discoveryGrid.innerHTML = '<div class="placeholder">Анализ не выполнен. Проверьте URL и попробуйте ещё раз.</div>';
    recommendationsBox.innerHTML = '<div class="placeholder">Рекомендации пока не собраны.</div>';
    exportsList.innerHTML = '<div class="placeholder">Экспорт появится после успешного анализа.</div>';
    llmsPreview.textContent = '# Preview появится после анализа';
    setStatus('error', error.message || 'Не удалось обработать сайт.');
  } finally {
    analyzeButton.disabled = false;
  }
}
