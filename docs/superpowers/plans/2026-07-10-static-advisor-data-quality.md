# Static Advisor Data Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve LLMS Setup Advisor's static site analysis without adding a backend, while preserving the current `llms-generator-config` import contract.

**Architecture:** Keep GitHub Pages as a browser-only application. Extend the existing `app.js` analysis pipeline with bounded same-origin sitemap discovery and provenance metadata, then expose a review step before JSON download. `advisor-core.js` owns deterministic parsing, normalization, and confidence helpers; `app.js` owns browser fetches and DOM rendering.

**Tech Stack:** Static HTML, CSS, browser JavaScript, Node.js built-in test runner (`node --test`).

**Out of scope:** Backend, hosted crawler, authentication, database, saving user analysis history, changing the OpenCart module, or changing the already-fixed FAQ pipe export.

---

## Current verified state

- `advisor-core.js` exposes pure helpers and is loaded before `app.js` in `index.html`.
- `app.js` currently performs browser fetches, generates recommendations, and downloads JSON with `format: "llms-generator-config"`.
- FAQ export has already been fixed in commit `db8c3aa`: it exports one `Question|Answer` pair per line. Do not replace it with a new format.
- The module owns actual `llms.txt` generation and writes it to `/llms.txt`; Advisor must export settings only.

## Files to modify

- `advisor-core.js` — pure URL, sitemap, JSON-LD, confidence, and review-normalization helpers.
- `app.js` — bounded browser fetching, pipeline composition, source metadata, review state, and JSON export from approved values.
- `index.html` — review card placed after discovery and before the JSON export card.
- `styles.css` — compact source/confidence badges and review controls.
- `tests/advisor-core.test.cjs` — pure unit tests for every new parser/normalizer.
- `README.md` — documented static limitations, review workflow, and corrected JSON-export status.

## Task 1: Add deterministic source and confidence helpers

**Files:**
- Modify: `advisor-core.js`
- Modify: `tests/advisor-core.test.cjs`

- [ ] Add a failing test for source records:

```js
assert.deepEqual(
  createEvidence('https://shop.example/delivery', 'page'),
  {
    url: 'https://shop.example/delivery',
    kind: 'page',
    confidence: 'verified'
  }
);
```

- [ ] Add a failing test proving that generated fallback text is marked `inference`, not `verified`.

- [ ] Implement and export `createEvidence(url, kind)` and `createInferenceEvidence(reason)` in `advisor-core.js`. Keep `confidence` limited to exactly `verified`, `inference`, and `missing`.

- [ ] Add `dedupeEvidenceItems(items)` that keeps the first same-URL item and merges duplicate labels without fabricating URLs.

- [ ] Run:

```powershell
node --test tests/advisor-core.test.cjs
```

Expected: all existing tests plus new tests pass.

## Task 2: Extract factual FAQ and structured metadata

**Files:**
- Modify: `advisor-core.js`
- Modify: `tests/advisor-core.test.cjs`
- Modify: `app.js`

- [ ] Write failing tests for `extractJsonLdFacts(html, pageUrl)` using an HTML fixture containing:
  - `FAQPage` with two Question/Answer items;
  - `Organization` with name and URL;
  - malformed JSON-LD that must be ignored without throwing.

- [ ] Implement `extractJsonLdFacts(html, pageUrl)` in `advisor-core.js`. It must return an object with `faq`, `organization`, and `types`; FAQ records must carry `source: createEvidence(pageUrl, 'json-ld')`.

- [ ] Write a failing test for `extractHtmlFaqPairs(html, pageUrl)` that recognizes a simple question heading followed by an answer block and rejects empty pairs.

- [ ] Implement `extractHtmlFaqPairs(html, pageUrl)` as a conservative parser. It must not convert arbitrary lists or product specifications into FAQ.

- [ ] In `app.js`, merge factual FAQ in this order: JSON-LD FAQ → HTML FAQ → existing `buildFaq(...)` fallback. Mark fallback pairs with `createInferenceEvidence('advisor fallback')`.

- [ ] Keep `normalizeFaqEntries` unchanged as the final exporter: it must receive reviewed FAQ objects and emit `Question|Answer` rows only.

- [ ] Run `node --test tests/advisor-core.test.cjs`.

## Task 3: Make sitemap discovery bounded and useful

**Files:**
- Modify: `advisor-core.js`
- Modify: `tests/advisor-core.test.cjs`
- Modify: `app.js`

- [ ] Add failing tests for `parseSitemapDocument(xml, baseUrl)` covering both `<urlset>` and `<sitemapindex>`.

- [ ] Implement `parseSitemapDocument(xml, baseUrl)` to return normalized absolute URLs only; reject invalid URLs and hosts different from `baseUrl`.

- [ ] Add failing tests for `rankUsefulUrls(urls)` that prioritizes URLs with these path signals: `contact`, `delivery`, `shipping`, `payment`, `return`, `warranty`, `faq`, `category`, `brand`, `blog`, `news`, `article`.

- [ ] Implement `rankUsefulUrls(urls)` with stable ranking: preserve original order for equal scores.

- [ ] In `app.js`, process sitemap indexes to a maximum depth of 2, process no more than 10 sitemap files, and fetch no more than 30 ranked candidate pages. Use existing browser-fetch/error handling; do not introduce a new proxy or backend.

- [ ] Every discovered item must record the sitemap or page URL that supplied it.

- [ ] Run `node --test tests/advisor-core.test.cjs`.

## Task 4: Add review-before-export UI

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `app.js`

- [ ] Add a `#review-card` between `#module-recommendations` and `#exports-card` in `index.html`.

- [ ] Render editable rows for: site title, tagline, AI profile, sitemaps, official sources, priority links, FAQ, and custom blocks.

- [ ] Each row must display:
  - source URL or `Advisor inference`;
  - one badge for `verified`, `inference`, or `missing`;
  - include/exclude control;
  - editable value control.

- [ ] Store approved values in one `reviewState` object in `app.js`; avoid mutating raw discovery output.

- [ ] Change `buildJsonDownloadPayload(data)` call sites so the payload is built from `reviewState`, not the unreviewed `data` object.

- [ ] Disable JSON download until analysis completes and `reviewState` is initialized. Do not require every optional field to be present.

- [ ] Verify manually in a browser with a site that has no FAQ: the FAQ review section must show an empty state instead of invented data presented as verified.

## Task 5: Preserve import contract and document limits

**Files:**
- Modify: `advisor-core.js`
- Modify: `tests/advisor-core.test.cjs`
- Modify: `README.md`

- [ ] Add a failing test that builds a representative export and asserts:

```js
assert.equal(payload.format, 'llms-generator-config');
assert.match(payload.settings.module_llms_generator_ai_faq, /\|/);
assert.equal(payload.settings.module_llms_generator_ai_faq.includes('\n\n'), false);
```

- [ ] Keep all current `module_llms_generator_*` keys used by `buildJsonSettingsPayload`; do not add runtime-only OpenCart values such as tokens, generated URLs, or filesystem paths.

- [ ] Update README:
  - JSON download already exists and imports into the module;
  - analysis is browser-only and can be limited by CORS, bot protection, or incomplete sitemap data;
  - the user reviews inferred values before export;
  - no backend is used and no crawl is performed outside the configured bounded limits.

- [ ] Run the full test suite:

```powershell
node --test tests/advisor-core.test.cjs
```

- [ ] Manually test the published page with three targets:
  1. a store with `FAQPage` JSON-LD;
  2. a store with sitemap but no FAQ;
  3. a site that blocks cross-origin reading.

Expected: no uncaught errors; correct confidence labels; valid JSON download; FAQ uses pipe-separated pairs.

## Delivery checklist

- [ ] `git diff --check` is clean.
- [ ] `node --test tests/advisor-core.test.cjs` passes.
- [ ] No backend, proxy service, API key, or server-only dependency was introduced.
- [ ] Exported JSON retains `format: "llms-generator-config"`.
- [ ] Review UI never labels generated fallback content as verified.
- [ ] Commit implementation in focused units: core extraction, bounded discovery, review UI, then docs/tests.
