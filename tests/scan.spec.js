const fs = require('fs');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const pixelmatch = require('pixelmatch');
const { PNG } = require('pngjs');

const urlsFile = process.env.URLS_FILE || 'urls.txt';
const urls = fs.readFileSync(urlsFile, 'utf-8').split('\n').map(s => s.trim()).filter(Boolean);

for (const url of urls) {
  test(`scan: ${url}`, async ({ page }, testInfo) => {
    const consoleErrors = [];
    page.on('console', m => { if (['error','warning'].includes(m.type())) consoleErrors.push(m.text()); });

    const failedRequests = [];
    page.on('requestfailed', r => failedRequests.push({ url: r.url(), failure: r.failure()?.errorText }));

    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
    const status = response?.status() ?? 0;

    // screenshot early
    const shot1 = await page.screenshot();

    // Accessibility scan
    const axe = new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa']);
    const a11y = await axe.analyze();
    await testInfo.attach('a11y.json', { body: JSON.stringify(a11y, null, 2), contentType: 'application/json' });

    // MathJax + layout checks
    const math = await page.evaluate(async () => {
      // Wait for MathJax to finish if present
      if (window.MathJax?.startup?.promise) {
        try { await window.MathJax.startup.promise; } catch (e) {}
      }

      const hasRenderedMath = !!document.querySelector('mjx-container'); // MathJax v3 renders to <mjx-container>
      const mjxErrors = Array.from(document.querySelectorAll('mjx-merror')).map(e => e.textContent?.trim()).slice(0, 10);

      // Look for raw TeX that leaked into the page (not inside code/pre/script/style)
      const raw = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const rx = /(\$\$[^$]+\$\$|\$[^$]+\$|\\\[.+?\\\]|\\\(.+?\\\))/s;
      while (walker.nextNode()) {
        const n = walker.currentNode;
        const p = n.parentElement;
        if (p && ['SCRIPT','STYLE','CODE','PRE','NOSCRIPT'].includes(p.tagName)) continue;
        const t = (n.textContent || '').trim();
        if (rx.test(t)) { raw.push(t.slice(0,120)); if (raw.length>10) break; }
      }

      const horizontalOverflow = document.documentElement.scrollWidth > window.innerWidth + 1;
      const brokenImgs = Array.from(document.images).filter(i => i.complete && i.naturalWidth === 0).map(i => i.src);

      return { hasRenderedMath, mjxErrors, rawTexSamples: raw, horizontalOverflow, brokenImgs };
    });
    await testInfo.attach('math.json', { body: JSON.stringify(math, null, 2), contentType: 'application/json' });

    // Wait & compare for layout shift (simple pixel diff)
    await page.waitForTimeout(3000);
    const shot2 = await page.screenshot();
    const img1 = PNG.sync.read(shot1); const img2 = PNG.sync.read(shot2);
    const { width, height } = img1; const diff = new PNG({ width, height });
    const diffPixels = pixelmatch(img1.data, img2.data, diff.data, width, height, { threshold: 0.1 });
    const diffRatio = diffPixels / (width * height);
    await testInfo.attach('layout-diff.png', { body: PNG.sync.write(diff), contentType: 'image/png' });

    // Save useful artifacts
    if (consoleErrors.length) await testInfo.attach('console.txt', { body: consoleErrors.join('\n'), contentType: 'text/plain' });
    if (failedRequests.length) await testInfo.attach('request-failures.json', { body: JSON.stringify(failedRequests, null, 2), contentType: 'application/json' });

    // Soft checks (report problems but keep going)
    expect.soft(status).toBeGreaterThanOrEqual(200);
    expect.soft(status).toBeLessThan(400);
    expect.soft(consoleErrors.length, 'No console errors').toBe(0);
    expect.soft(failedRequests.length, 'No failed requests').toBe(0);
    expect.soft(math.horizontalOverflow, 'No horizontal overflow').toBeFalsy();
    expect.soft(math.mjxErrors.length, 'No MathJax errors').toBe(0);
    expect.soft(math.rawTexSamples.length === 0 || math.hasRenderedMath, 'Raw TeX should be rendered').toBeTruthy();

    // Nice labels in the HTML report
    testInfo.annotations.push({ type: 'status', description: String(status) });
    testInfo.annotations.push({ type: 'layoutShift', description: (diffRatio*100).toFixed(2) + '% pixels changed' });
    if (math.rawTexSamples.length && !math.hasRenderedMath) testInfo.annotations.push({ type: 'math', description: 'Unprocessed TeX detected' });
    if (math.mjxErrors.length) testInfo.annotations.push({ type: 'math', description: `MathJax errors: ${math.mjxErrors.length}` });
    if (math.brokenImgs.length) testInfo.annotations.push({ type: 'img', description: `Broken images: ${math.brokenImgs.length}` });
  });
}