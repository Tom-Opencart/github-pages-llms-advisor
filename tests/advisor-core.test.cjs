const test = require('node:test');
const assert = require('node:assert/strict');

const {
  looksTechnicalText,
  sanitizeNarrativeText,
  guessTagline
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
