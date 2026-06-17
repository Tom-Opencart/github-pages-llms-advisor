const test = require('node:test');
const assert = require('node:assert/strict');

const {
  looksTechnicalText,
  sanitizeNarrativeText,
  guessTagline,
  buildMeaningfulTagline,
  buildMeaningfulProfile
} = require('../advisor-core.js');

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
