(function() {
  const core = window.LlmsAdvisorCore || {};
  const reviewShell = document.getElementById('review-shell');
  const reviewCard = document.getElementById('review-card');
  const exportsCard = document.getElementById('exports-card');
  const exportButton = document.getElementById('download-json-button');
  const previewButton = document.getElementById('preview-json-button');
  const jsonMetaNote = document.getElementById('json-meta-note');
  const analysisOverlay = document.getElementById('analysis-overlay');
  const overlayHint = document.getElementById('overlay-hint');
  const statusBox = document.getElementById('status-box');
  const statusText = document.getElementById('status-text');
  const statusSpinner = statusBox ? statusBox.querySelector('.spinner') : null;
  const discoveryGrid = document.getElementById('discovery-grid');
  const recommendationsBox = document.getElementById('module-recommendations');
  const exportsList = document.getElementById('exports-list');
  const llmsPreview = document.getElementById('llms-preview');
  const floatingDownload = document.getElementById('floating-download');
  const reviewStateStore = {
    current: null
  };

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function ensureStyles() {
    if (document.getElementById('review-layer-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'review-layer-styles';
    style.textContent = `
      .review-shell {
        display: grid;
        gap: 14px;
      }

      .review-board {
        display: grid;
        gap: 12px;
      }

      .review-card {
        padding: 16px;
        border: 1px solid var(--border-color);
        background: var(--surface-muted);
        box-shadow: var(--shadow-soft);
      }

      .review-card__head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }

      .review-summary {
        display: grid;
        gap: 12px;
      }

      .review-summary__row {
        display: grid;
        grid-template-columns: minmax(160px, 240px) 1fr;
        gap: 12px;
        padding: 12px;
        border: 1px solid var(--border-muted);
        background: var(--surface-color);
      }

      .review-summary__label {
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 11px;
      }

      .review-summary__value {
        color: var(--text-secondary);
      }

      .review-items {
        display: grid;
        gap: 12px;
      }

      .review-item {
        padding: 12px;
        border: 1px solid var(--border-color);
        background: var(--surface-soft);
      }

      .review-item__top {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
        margin-bottom: 10px;
      }

      .review-item__title {
        font-weight: 700;
      }

      .review-item__meta {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
        color: var(--text-secondary);
        font-size: 12px;
      }

      .review-pill {
        display: inline-flex;
        align-items: center;
        padding: 4px 8px;
        border: 1px solid var(--border-color);
        background: var(--surface-color);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .review-item__textarea {
        width: 100%;
        min-height: 84px;
        resize: vertical;
        margin-top: 10px;
        font-family: var(--font-mono);
        font-size: 13px;
      }

      .review-item__row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 10px;
        margin-top: 10px;
      }

      .review-item__toggle {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: var(--text-secondary);
      }

      .review-item__toggle input {
        width: 16px;
        height: 16px;
        margin: 0;
        padding: 0;
      }

      .review-empty {
        padding: 14px;
        border: 1px dashed var(--border-muted);
        color: var(--text-secondary);
        background: var(--surface-soft);
      }

      .review-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
      }

      @media (max-width: 768px) {
        .review-summary__row,
        .review-item__row {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function uniqueFaqRecords(records) {
    const seen = new Set();
    const output = [];

    records.forEach((item) => {
      if (!item || !item.question || !item.answer) {
        return;
      }

      const key = `${String(item.question).trim().toLowerCase()}\n${String(item.answer).trim().toLowerCase()}`;

      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      output.push(item);
    });

    return output;
  }

  function parsePipeLine(text) {
    const raw = String(text || '').trim();
    const index = raw.indexOf('|');

    if (index === -1) {
      return { label: raw, url: '' };
    }

    return {
      label: raw.slice(0, index).trim(),
      url: raw.slice(index + 1).trim()
    };
  }

  function parseCustomEntries(text) {
    return String(text || '')
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split('|');
        return {
          title: (parts[0] || '').trim(),
          url: (parts[1] || '').trim(),
          description: (parts.slice(2).join('|') || '').trim()
        };
      })
      .filter((item) => item.title && item.url);
  }

  function inferSourceType(url, fallback) {
    const source = `${url || ''} ${fallback || ''}`.toLowerCase();

    if (source.includes('robots.txt')) {
      return 'robots';
    }

    if (source.includes('sitemap')) {
      return 'sitemap';
    }

    if (source.includes('faq')) {
      return 'faq';
    }

    return 'page';
  }

  function makeItemId(prefix, index) {
    return `${prefix}-${index}`;
  }

  function mapLinkItems(items, prefix) {
    return items.map((item, index) => ({
      id: makeItemId(prefix, index),
      kind: 'link',
      title: item.label,
      text: `${item.label}|${item.url}`,
      sourceType: item.sourceType || inferSourceType(item.url, prefix),
      sourceUrl: item.sourceUrl || item.url,
      confidence: item.confidence || 'verified',
      selected: item.selected !== false
    }));
  }

  function mapRuleItems(items) {
    return items.map((text, index) => ({
      id: makeItemId('rule', index),
      kind: 'rule',
      title: `Правило ${index + 1}`,
      text,
      sourceType: 'inference',
      sourceUrl: '',
      confidence: 'inference',
      selected: true
    }));
  }

  function mapFaqItems(records) {
    return records.map((item, index) => ({
      id: makeItemId('faq', index),
      kind: 'faq',
      title: item.question,
      question: item.question,
      answer: item.answer,
      sourceType: item.sourceType || 'inference',
      sourceUrl: item.sourceUrl || '',
      confidence: item.confidence || 'inference',
      selected: item.selected !== false
    }));
  }

  function mapCustomBlockItems(items) {
    return items.map((block, index) => ({
      id: makeItemId('custom', index),
      kind: 'custom',
      title: block.title,
      text: block.entries.map((entry) => `${entry.title}|${entry.url}|${entry.description}`).join('\n'),
      sourceType: 'inference',
      sourceUrl: '',
      confidence: 'inference',
      selected: true
    }));
  }

  function buildReviewState(base) {
    const extractedFaq = core.extractFaqRecords
      ? core.extractFaqRecords(base.primarySourceText, base.siteUrl)
      : [];
    const generatedFaq = buildFaq(base.siteTitle, base.focus, base.servicePages, base.blogPages).map((item) => ({
      question: item.question,
      answer: item.answer,
      sourceType: 'inference',
      sourceUrl: base.siteUrl,
      confidence: 'inference',
      selected: extractedFaq.length === 0
    }));
    const faqItems = uniqueFaqRecords([
      ...mapFaqItems(extractedFaq.map((item) => ({
        ...item,
        selected: true
      }))),
      ...mapFaqItems(generatedFaq)
    ]);

    return {
      siteUrl: base.siteUrl,
      siteTitle: base.siteTitle,
      tagline: base.tagline,
      aiProfile: base.aiProfile,
      urlLogic: base.urlLogic,
      recommendations: base.recommendations,
      sitemaps: mapLinkItems(base.sitemaps, 'sitemap'),
      officialSources: mapLinkItems(base.officialSources, 'source'),
      priorityLinks: mapLinkItems(base.priorityLinks, 'priority'),
      rules: mapRuleItems(base.rules),
      faq: faqItems,
      customBlocks: mapCustomBlockItems(base.customBlocks),
      focus: base.focus,
      primarySourceText: base.primarySourceText
    };
  }

  function renderReviewPanel(state) {
    if (!reviewShell) {
      return;
    }

    const sourceCounts = [state.sitemaps.length, state.officialSources.length, state.priorityLinks.length, state.rules.length, state.faq.length, state.customBlocks.length];
    const totalItems = sourceCounts.reduce((sum, value) => sum + value, 0);
    const sections = [
      {
        title: 'Сводка',
        hint: 'Что пойдёт в JSON после подтверждения',
        rows: [
          { label: 'Сайт', value: state.siteTitle },
          { label: 'Tagline', value: state.tagline },
          { label: 'AI-профиль', value: state.aiProfile }
        ],
        kind: 'summary'
      },
      {
        title: 'Ссылки и источники',
        hint: 'Проверяйте источник и при необходимости отключайте лишнее',
        items: [...state.sitemaps, ...state.officialSources, ...state.priorityLinks]
      },
      {
        title: 'Правила и логика URL',
        hint: 'Текстовые подсказки можно оставить или поправить вручную',
        items: [...state.rules]
      },
      {
        title: 'FAQ',
        hint: 'FAQ можно редактировать прямо здесь перед экспортом',
        items: [...state.faq]
      },
      {
        title: 'Кастомные блоки',
        hint: 'Отдельные списки для сервисных страниц и полезных материалов',
        items: [...state.customBlocks]
      }
    ];

    reviewShell.innerHTML = '';

    const board = document.createElement('div');
    board.className = 'review-board';

    sections.forEach((section) => {
      const card = document.createElement('article');
      card.className = 'review-card';

      const head = document.createElement('div');
      head.className = 'review-card__head';
      head.innerHTML = `
        <div>
          <h3 class="review-section__title">${escapeHtml(section.title)}</h3>
          <p class="review-section__hint">${escapeHtml(section.hint)}</p>
        </div>
        <div class="review-actions">
          <span class="review-pill">${escapeHtml(String(section.items ? section.items.length : section.rows.length))} элементов</span>
          <span class="review-pill">${escapeHtml(String(totalItems))} всего</span>
        </div>
      `;

      card.appendChild(head);

      if (section.kind === 'summary') {
        const summary = document.createElement('div');
        summary.className = 'review-summary';
        section.rows.forEach((row) => {
          const rowEl = document.createElement('div');
          rowEl.className = 'review-summary__row';
          rowEl.innerHTML = `
            <div class="review-summary__label">${escapeHtml(row.label)}</div>
            <div class="review-summary__value">${escapeHtml(row.value)}</div>
          `;
          summary.appendChild(rowEl);
        });
        card.appendChild(summary);
      } else {
        const itemsWrap = document.createElement('div');
        itemsWrap.className = 'review-items';

        section.items.forEach((item) => {
          const entry = document.createElement('div');
          entry.className = 'review-item';
          entry.dataset.reviewId = item.id;
          entry.dataset.reviewKind = item.kind;
          entry.innerHTML = item.kind === 'faq'
            ? `
              <div class="review-item__top">
                <div>
                  <div class="review-item__title">${escapeHtml(item.title)}</div>
                  <div class="review-item__meta">
                    <span class="review-pill">${escapeHtml(item.sourceType)}</span>
                    <span class="review-pill">${escapeHtml(item.confidence)}</span>
                    ${item.sourceUrl ? `<span>${escapeHtml(item.sourceUrl)}</span>` : ''}
                  </div>
                </div>
                <label class="review-item__toggle">
                  <input type="checkbox" data-review-field="selected" ${item.selected ? 'checked' : ''}>
                  включить
                </label>
              </div>
              <div class="review-item__row">
                <textarea class="review-item__textarea" data-review-field="question" rows="2">${escapeHtml(item.question || '')}</textarea>
                <textarea class="review-item__textarea" data-review-field="answer" rows="2">${escapeHtml(item.answer || '')}</textarea>
              </div>
            `
            : `
              <div class="review-item__top">
                <div>
                  <div class="review-item__title">${escapeHtml(item.title)}</div>
                  <div class="review-item__meta">
                    <span class="review-pill">${escapeHtml(item.sourceType)}</span>
                    <span class="review-pill">${escapeHtml(item.confidence)}</span>
                    ${item.sourceUrl ? `<span>${escapeHtml(item.sourceUrl)}</span>` : ''}
                  </div>
                </div>
                <label class="review-item__toggle">
                  <input type="checkbox" data-review-field="selected" ${item.selected ? 'checked' : ''}>
                  включить
                </label>
              </div>
              <textarea class="review-item__textarea" data-review-field="text" rows="3">${escapeHtml(item.text || '')}</textarea>
            `;

          itemsWrap.appendChild(entry);
        });

        card.appendChild(itemsWrap);
      }

      board.appendChild(card);
    });

    reviewShell.appendChild(board);
  }

  function syncReviewStateFromDom() {
    const state = reviewStateStore.current;

    if (!state || !reviewShell) {
      return;
    }

    reviewShell.querySelectorAll('[data-review-id]').forEach((entry) => {
      const id = entry.dataset.reviewId;
      const kind = entry.dataset.reviewKind;
      const item = [
        ...state.sitemaps,
        ...state.officialSources,
        ...state.priorityLinks,
        ...state.rules,
        ...state.faq,
        ...state.customBlocks
      ].find((candidate) => candidate.id === id);

      if (!item) {
        return;
      }

      const toggle = entry.querySelector('[data-review-field="selected"]');
      if (toggle) {
        item.selected = toggle.checked;
      }

      if (kind === 'faq') {
        const question = entry.querySelector('[data-review-field="question"]');
        const answer = entry.querySelector('[data-review-field="answer"]');
        if (question) {
          item.question = question.value;
          item.title = question.value;
        }
        if (answer) {
          item.answer = answer.value;
        }
      } else {
        const textarea = entry.querySelector('[data-review-field="text"]');
        if (textarea) {
          item.text = textarea.value;
        }
      }
    });
  }

  function collectExportData(state) {
    const selectedLinks = (items) => items.filter((item) => item.selected !== false).map((item) => parsePipeLine(item.text));

    return {
      siteUrl: state.siteUrl,
      siteTitle: state.siteTitle,
      tagline: state.tagline,
      aiProfile: state.aiProfile,
      sitemaps: selectedLinks(state.sitemaps).filter((item) => item.url),
      officialSources: selectedLinks(state.officialSources).filter((item) => item.url),
      priorityLinks: selectedLinks(state.priorityLinks).filter((item) => item.url),
      rules: state.rules.filter((item) => item.selected !== false).map((item) => String(item.text || '').trim()).filter(Boolean),
      faq: uniqueFaqRecords(state.faq.filter((item) => item.selected !== false).map((item) => ({
        question: String(item.question || '').trim(),
        answer: String(item.answer || '').trim(),
        sourceType: item.sourceType,
        sourceUrl: item.sourceUrl,
        confidence: item.confidence,
        confirmed: item.confidence === 'verified'
      })).filter((item) => item.question && item.answer)),
      urlLogic: state.urlLogic,
      customBlocks: state.customBlocks.filter((item) => item.selected !== false).map((item) => ({
        title: item.title,
        entries: parseCustomEntries(item.text)
      })),
      recommendations: state.recommendations
    };
  }

  function buildJsonDownloadPayload(data) {
    const faqEntries = Array.isArray(data.faq) ? data.faq : [];
    const payload = core.buildJsonExportPayload
      ? core.buildJsonExportPayload(
        {
          settings: buildJsonSettingsPayload(data),
          faqEntries
        },
        {
          generatedAt: new Date().toISOString(),
          source: {
            tool: 'llms-setup-advisor',
            site_url: data.siteUrl
          },
          summary: {
            site_title: data.siteTitle,
            sitemap_count: data.sitemaps.length,
            faq_count: faqEntries.length,
            custom_section_count: data.customBlocks.length,
            source: 'review-state',
            summary: `confirmed:${faqEntries.length}`
          },
          confirmedFaqOnly: true
        }
      )
      : {
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
          faq_count: faqEntries.length,
          custom_section_count: data.customBlocks.length,
          source: 'review-state'
        },
        settings: buildJsonSettingsPayload(data)
      };

    return payload;
  }

  function refreshExportState() {
    if (!reviewStateStore.current) {
      return;
    }

    syncReviewStateFromDom();
    const exportData = collectExportData(reviewStateStore.current);
    const payload = buildJsonDownloadPayload(exportData);
    latestDownloadPayload = payload;
    window.latestDownloadPayload = payload;

    if (exportButton) {
      exportButton.disabled = false;
    }

    if (previewButton) {
      previewButton.disabled = false;
    }

    if (jsonMetaNote) {
      const meta = getJsonMeta(payload);
      jsonMetaNote.textContent = `Файл готов к скачиванию: ${meta.fileName} • размер примерно ${formatBytes(meta.bytes)}. JSON уже собран из подтверждённых полей review.`;
    }
  }

  function setReviewState(base) {
    reviewStateStore.current = buildReviewState(base);
    renderReviewPanel(reviewStateStore.current);
    refreshExportState();
    return reviewStateStore.current;
  }

  if (reviewShell) {
    reviewShell.addEventListener('input', () => {
      refreshExportState();
    });
    reviewShell.addEventListener('change', () => {
      refreshExportState();
    });
  }

  window.buildJsonDownloadPayload = buildJsonDownloadPayload;
  window.buildReviewState = buildReviewState;
  window.setReviewState = setReviewState;
  window.collectReviewExportData = collectExportData;
  window.refreshReviewExportState = refreshExportState;
  window.showReviewHint = function showReviewHint(text) {
    if (reviewShell && !reviewShell.querySelector('[data-review-id]')) {
      reviewShell.innerHTML = `<div class="review-empty">${escapeHtml(text)}</div>`;
    }
  };


  document.addEventListener('input', (event) => {
    if (event.target.closest && event.target.closest('#review-shell')) {
      refreshExportState();
    }
  });

  document.addEventListener('change', (event) => {
    if (event.target.closest && event.target.closest('#review-shell')) {
      refreshExportState();
    }
  });
})();
