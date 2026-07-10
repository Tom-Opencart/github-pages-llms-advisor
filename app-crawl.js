(function() {
  const MAX_CRAWL_DEPTH = 2;
  const MAX_CRAWL_URLS = 18;
  const MAX_PAGE_FETCHES = 10;
  const CRAWL_HINTS = [
    { pattern: /\bcontacts?\b|контакт/i, weight: 40 },
    { pattern: /delivery|dostavk|shipping|доставк/i, weight: 38 },
    { pattern: /payment|oplata|оплат/i, weight: 36 },
    { pattern: /return|refund|vozzrat|возврат/i, weight: 34 },
    { pattern: /warranty|garant/i, weight: 32 },
    { pattern: /faq|questions?|vopros|вопрос/i, weight: 31 },
    { pattern: /blog|article|news|stati|novost/i, weight: 24 },
    { pattern: /category|catalog|collection|products?/i, weight: 20 },
    { pattern: /brand|manufacturer|proizvod/i, weight: 18 }
  ];

  function sameOrigin(url, origin) {
    try {
      return new URL(url).origin === origin;
    } catch (error) {
      return false;
    }
  }

  function normalizeCandidateUrl(raw, baseUrl) {
    try {
      const url = new URL(raw, baseUrl);
      url.hash = '';
      return url.href;
    } catch (error) {
      return '';
    }
  }

  function extractSitemapUrls(text, baseUrl) {
    const output = [];
    const raw = String(text || '');
    const locPattern = /<loc>(.*?)<\/loc>/gi;
    let match = null;

    while ((match = locPattern.exec(raw))) {
      const url = normalizeCandidateUrl(match[1].trim(), baseUrl);
      if (url) {
        output.push(url);
      }
    }

    const robotsPattern = /^\s*sitemap:\s*(\S+)/gim;
    while ((match = robotsPattern.exec(raw))) {
      const url = normalizeCandidateUrl(match[1].trim(), baseUrl);
      if (url) {
        output.push(url);
      }
    }

    return uniq(output);
  }

  function scoreUrl(url) {
    const source = String(url || '').toLowerCase();
    return CRAWL_HINTS.reduce((score, item) => score + (item.pattern.test(source) ? item.weight : 0), 0);
  }

  function pickPriorityUrls(urls, origin) {
    return uniq(urls)
      .filter((url) => sameOrigin(url, origin) && !isAssetUrl(url))
      .sort((left, right) => scoreUrl(right) - scoreUrl(left))
      .slice(0, MAX_PAGE_FETCHES);
  }

  async function crawlSitemaps(siteUrl, seedUrls, fetchErrors) {
    const origin = siteUrl.origin;
    const visited = new Set();
    const queue = seedUrls.slice(0, MAX_CRAWL_URLS).map((url) => ({ url, depth: 0 }));
    const discovered = [];

    while (queue.length) {
      const current = queue.shift();

      if (!current || visited.has(current.url)) {
        continue;
      }

      visited.add(current.url);

      if (!sameOrigin(current.url, origin)) {
        continue;
      }

      const result = await fetchTextWithFallback(current.url);
      if (!result.ok) {
        if (Array.isArray(result.errors)) {
          fetchErrors.push(...result.errors);
        }
        continue;
      }

      discovered.push(result);
      const links = extractSitemapUrls(result.text, current.url)
        .filter((url) => sameOrigin(url, origin))
        .filter((url) => !visited.has(url));

      if (current.depth < MAX_CRAWL_DEPTH) {
        links.forEach((url) => {
          queue.push({ url, depth: current.depth + 1 });
        });
      }
    }

    return discovered;
  }

  window.collectRemoteData = async function collectRemoteData(siteUrl) {
    const candidateSitemaps = buildCandidateSitemaps(siteUrl);
    const fetchErrors = [];
    const homeResult = await fetchTextWithFallback(siteUrl.href);
    if (!homeResult.ok && Array.isArray(homeResult.errors)) {
      fetchErrors.push(...homeResult.errors);
    }

    const auxiliary = await Promise.all(candidateSitemaps.map((url) => fetchTextWithFallback(url)));
    auxiliary.forEach((item) => {
      if (!item.ok && Array.isArray(item.errors)) {
        fetchErrors.push(...item.errors);
      }
    });

    const seedTexts = [homeResult, ...auxiliary].filter((item) => item.ok);
    const sitemapSeeds = candidateSitemaps.filter((url) => sameOrigin(url, siteUrl.origin));
    const crawledSitemaps = await crawlSitemaps(siteUrl, sitemapSeeds, fetchErrors);
    const pageSeeds = pickPriorityUrls([
      siteUrl.href,
      ...seedTexts.flatMap((item) => extractUrls(item.text, siteUrl.href)),
      ...crawledSitemaps.flatMap((item) => extractSitemapUrls(item.text, item.targetUrl || item.url))
    ], siteUrl.origin);
    const pageResults = await Promise.all(pageSeeds.map((url) => fetchTextWithFallback(url)));

    pageResults.forEach((item) => {
      if (!item.ok && Array.isArray(item.errors)) {
        fetchErrors.push(...item.errors);
      }
    });

    const textSources = uniq([
      ...seedTexts,
      ...crawledSitemaps,
      ...pageResults
    ].filter((item) => item.ok));
    const preferredSources = getPreferredReadableSources(textSources);
    const linkSources = preferredSources.length ? preferredSources : textSources;
    const combinedLinks = uniq([
      ...linkSources.flatMap((item) => extractUrls(item.text, item.targetUrl || item.url || siteUrl.href)),
      ...crawledSitemaps.flatMap((item) => extractSitemapUrls(item.text, item.targetUrl || item.url || siteUrl.href))
    ].filter((link) => sameOrigin(link, siteUrl.origin) && !isAssetUrl(link)));

    return {
      homeResult,
      primarySource: preferredSources[0] || homeResult,
      combined: preferredSources.map((item) => item.text).join('\n'),
      combinedLinks,
      readableSources: textSources,
      fetchErrors: uniq(fetchErrors)
    };
  };
})();
