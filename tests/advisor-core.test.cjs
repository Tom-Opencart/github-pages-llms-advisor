const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  getModuleSettingKeys,
  filterModuleSettings,
  buildJsonExportPayload,
  normalizeManualSourceText,
  looksTechnicalText,
  sanitizeNarrativeText,
  guessTagline,
  buildMeaningfulTagline,
  buildMeaningfulProfile,
  normalizeFaqEntries,
  normalizeFaqRecords,
  extractFaqRecordsFromJsonLd,
  extractFaqRecordsFromHtml,
  extractFaqRecordsFromFallback,
  extractFaqRecords
} = require('../advisor-core.js');

test('normalizeManualSourceText keeps meaningful source lines and removes empty lines', () => {
  assert.equal(
    normalizeManualSourceText('  <h1>Store</h1>\r\n\r\n  <p>Delivery</p>  \n'),
    '<h1>Store</h1>\n<p>Delivery</p>'
  );
});

test('looksTechnicalText detects robots-style payloads', () => {
  assert.equal(
    looksTechnicalText('User-agent: * Disallow: /*?page=$ Sitemap: https://example.com/sitemap.xml'),
    true
  );
});

test('sanitizeNarrativeText removes technical-only content', () => {
  assert.equal(
    sanitizeNarrativeText('User-agent: * Disallow: /admin Sitemap: https://example.com/sitemap.xml'),
    ''
  );
});

test('guessTagline prefers manual hints over technical body text', () => {
  const result = guessTagline(
    '',
    'User-agent: * Disallow: /admin Sitemap: https://example.com/sitemap.xml',
    'Интернет-магазин упаковки для маркетплейсов и бизнеса.'
  );

  assert.equal(result, 'Интернет-магазин упаковки для маркетплейсов и бизнеса.');
});

test('guessTagline ignores technical body text when no good source exists', () => {
  const result = guessTagline(
    '',
    'User-agent: * Disallow: /admin Sitemap: https://example.com/sitemap.xml',
    ''
  );

  assert.equal(result, '');
});

test('buildMeaningfulTagline creates a useful fallback for ecommerce sites', () => {
  const result = buildMeaningfulTagline({
    title: 'Kiker shop.ru',
    tagline: '',
    focus: {
      marketplace: false,
      b2b: false,
      ecommerce: true
    },
    servicePages: [
      { label: 'Доставка', url: 'https://example.com/delivery' },
      { label: 'Контакты', url: 'https://example.com/contacts' }
    ],
    blogPages: [
      { label: 'Обзоры', url: 'https://example.com/reviews' }
    ]
  });

  assert.equal(
    result,
    'Интернет-магазин с каталогом товаров, сервисными страницами и справочными материалами.'
  );
});

test('buildMeaningfulProfile uses fallback tagline and focus signals', () => {
  const result = buildMeaningfulProfile({
    title: 'Kiker shop.ru',
    tagline: '',
    focus: {
      marketplace: true,
      b2b: true,
      ecommerce: true
    },
    servicePages: [
      { label: 'Доставка', url: 'https://example.com/delivery' }
    ],
    blogPages: [
      { label: 'Обзоры', url: 'https://example.com/reviews' }
    ]
  });

  assert.match(result, /Интернет-магазин с каталогом товаров, сервисными страницами и справочными материалами\./);
  assert.match(result, /маркетплейс/);
  assert.match(result, /B2B/);
  assert.match(result, /каталог, карточки товаров и сервисные страницы/);
});

test('getModuleSettingKeys returns the expected allowlist for the module contract', () => {
  const keys = getModuleSettingKeys();

  assert.ok(keys.includes('module_llms_generator_ai_faq'));
  assert.ok(keys.includes('module_llms_generator_custom_sections'));
  assert.equal(new Set(keys).size, keys.length);
});

test('JSON export declares every setting supported by the current generator', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

  getModuleSettingKeys().forEach((key) => {
    assert.match(appSource, new RegExp(`${key}:`), `Export is missing ${key}`);
  });
});

test('filterModuleSettings keeps only module keys and normalizes ids and faq', () => {
  const filtered = filterModuleSettings(
    {
      module_llms_generator_status: '1',
      module_llms_generator_product_ids: [3, '5', 'x'],
      module_llms_generator_ai_faq: 'ignored',
      unknown_key: 'should be dropped'
    },
    {
      faqRecords: [
        { question: 'Как оформить заказ?', answer: 'Через корзину.' },
        { question: 'Как оформить заказ?', answer: 'Через корзину.' },
        { question: 'Технический текст', answer: 'User-agent: * Disallow: /' }
      ]
    }
  );

  assert.deepEqual(filtered, {
    module_llms_generator_status: '1',
    module_llms_generator_product_ids: '3,5',
    module_llms_generator_ai_faq: 'Как оформить заказ?|Через корзину.'
  });
});

test('buildJsonExportPayload emits llms-generator-config v1 and only allowed module keys', () => {
  const payload = buildJsonExportPayload(
    {
      settings: {
        module_llms_generator_status: '1',
        module_llms_generator_site_title: 'Tom Shop',
        module_llms_generator_ai_faq: 'ignored here',
        module_llms_generator_product_ids: [7, '11'],
        not_a_real_key: 'drop me'
      },
      faqRecords: [
        { question: 'Как оформить заказ?', answer: 'Через корзину.' },
        { question: 'Нужно ли подтверждение?', answer: 'Да.', confidence: 'verified', confirmed: true },
        { question: 'Скрытый черновик?', answer: 'Не экспортировать.', confidence: 'inference', confirmed: false }
      ]
    },
    {
      generatedAt: '2024-01-02T03:04:05.000Z',
      source: { tool: 'unit-test', site_url: 'https://example.com' },
      summary: { site_title: 'Tom Shop', faq_count: 2 }
    }
  );

  assert.equal(payload.format, 'llms-generator-config');
  assert.equal(payload.version, 1);
  assert.equal(payload.generated_at, '2024-01-02T03:04:05.000Z');
  assert.deepEqual(payload.source, {
    tool: 'unit-test',
    site_url: 'https://example.com'
  });
  assert.deepEqual(payload.summary, {
    site_title: 'Tom Shop',
    faq_count: 2
  });
  assert.deepEqual(payload.settings, {
    module_llms_generator_status: '1',
    module_llms_generator_site_title: 'Tom Shop',
    module_llms_generator_ai_faq: 'Как оформить заказ?|Через корзину.\nНужно ли подтверждение?|Да.',
    module_llms_generator_product_ids: '7,11'
  });
  assert.ok(!Object.prototype.hasOwnProperty.call(payload.settings, 'not_a_real_key'));
});

test('extractFaqRecordsFromJsonLd reads FAQPage answers from structured data', () => {
  const html = `
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Как оформить заказ?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Через корзину на сайте."
          }
        },
        {
          "@type": "Question",
          "name": "Есть ли доставка?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Да, условия указаны на странице доставки."
          }
        }
      ]
    }
    </script>
  `;

  assert.deepEqual(extractFaqRecordsFromJsonLd(html, 'https://example.com/faq'), [
    {
      question: 'Как оформить заказ?',
      answer: 'Через корзину на сайте.',
      sourceType: 'json-ld',
      sourceUrl: 'https://example.com/faq',
      confidence: 'verified',
      confirmed: true
    },
    {
      question: 'Есть ли доставка?',
      answer: 'Да, условия указаны на странице доставки.',
      sourceType: 'json-ld',
      sourceUrl: 'https://example.com/faq',
      confidence: 'verified',
      confirmed: true
    }
  ]);
});

test('extractFaqRecordsFromHtml reads semantic question and answer blocks', () => {
  const html = `
    <details>
      <summary>Как оформить заказ?</summary>
      <p>Через корзину на сайте.</p>
    </details>
    <dl>
      <dt>Есть ли доставка?</dt>
      <dd>Да, условия указаны на странице доставки.</dd>
    </dl>
  `;

  assert.deepEqual(extractFaqRecordsFromHtml(html, 'https://example.com/faq'), [
    {
      question: 'Как оформить заказ?',
      answer: 'Через корзину на сайте.',
      sourceType: 'html',
      sourceUrl: 'https://example.com/faq',
      confidence: 'verified',
      confirmed: true
    },
    {
      question: 'Есть ли доставка?',
      answer: 'Да, условия указаны на странице доставки.',
      sourceType: 'html',
      sourceUrl: 'https://example.com/faq',
      confidence: 'verified',
      confirmed: true
    }
  ]);
});

test('extractFaqRecordsFromFallback keeps only valid pipe and question answer pairs', () => {
  const source = [
    'Как оформить заказ?',
    'Через корзину на сайте.',
    'Как оформить заказ?|Через корзину на сайте.',
    'User-agent: * Disallow: /admin',
    'Что с доставкой?',
    'Да, условия указаны на странице доставки.'
  ].join('\n');

  assert.deepEqual(extractFaqRecordsFromFallback(source, 'https://example.com/faq'), [
    {
      question: 'Как оформить заказ?',
      answer: 'Через корзину на сайте.',
      sourceType: 'fallback',
      sourceUrl: 'https://example.com/faq',
      confidence: 'inference',
      confirmed: false
    },
    {
      question: 'Что с доставкой?',
      answer: 'Да, условия указаны на странице доставки.',
      sourceType: 'fallback',
      sourceUrl: 'https://example.com/faq',
      confidence: 'inference',
      confirmed: false
    }
  ]);
});

test('extractFaqRecords prefers structured sources over fallback heuristics', () => {
  const source = `
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": {
        "@type": "Question",
        "name": "Как оформить заказ?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Через корзину на сайте."
        }
      }
    }
    </script>
    Как оформить заказ?
    Другая строка без структурной разметки.
  `;

  assert.deepEqual(extractFaqRecords(source, 'https://example.com/faq'), [
    {
      question: 'Как оформить заказ?',
      answer: 'Через корзину на сайте.',
      sourceType: 'json-ld',
      sourceUrl: 'https://example.com/faq',
      confidence: 'verified',
      confirmed: true
    }
  ]);
});

test('normalizeFaqEntries exports OpenCart-compatible question and answer pairs', () => {
  assert.equal(
    normalizeFaqEntries([
      { question: 'Как оформить заказ?', answer: 'Через корзину на сайте.' },
      { question: 'Есть ли доставка?', answer: 'Да, условия указаны на странице доставки.' }
    ]),
    'Как оформить заказ?|Через корзину на сайте.\nЕсть ли доставка?|Да, условия указаны на странице доставки.'
  );
});

test('normalizeFaqRecords removes duplicates and technical noise', () => {
  assert.deepEqual(
    normalizeFaqRecords([
      { question: 'Как оформить заказ?', answer: 'Через корзину на сайте.' },
      { question: 'Как оформить заказ?', answer: 'Через корзину на сайте.' },
      { question: 'User-agent: *', answer: 'Disallow: /admin' }
    ]),
    [
      {
        question: 'Как оформить заказ?',
        answer: 'Через корзину на сайте.',
        sourceType: 'manual',
        sourceUrl: '',
        confidence: 'verified',
        confirmed: true
      }
    ]
  );
});

test('export toolbar separates download, preview, and external module link', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  assert.match(html, /class="exports-toolbar__primary"[\s\S]*id="download-json-button"/);
  assert.match(html, /class="exports-toolbar__secondary"[\s\S]*id="preview-json-button"/);
  assert.match(html, /class="exports-toolbar__module-link"[^>]*href="https:\/\/liveopencart\.ru\//);
});
