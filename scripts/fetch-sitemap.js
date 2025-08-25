#!/usr/bin/env node
const { XMLParser } = require('fast-xml-parser');
const parser = new XMLParser({ ignoreAttributes: false });

const root = process.argv[2];
if (!root) { console.error('Usage: node scripts/fetch-sitemap.js https://yoursite.com/sitemap.xml'); process.exit(1); }

const seen = new Set();

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'site-qa/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function collect(url) {
  if (seen.has(url)) return [];
  seen.add(url);
  const xml = await get(url);
  const doc = parser.parse(xml);

  if (doc.sitemapindex?.sitemap) {
    const items = Array.isArray(doc.sitemapindex.sitemap) ? doc.sitemapindex.sitemap : [doc.sitemapindex.sitemap];
    const out = [];
    for (const s of items) if (s.loc) out.push(...await collect(s.loc));
    return out;
  }
  if (doc.urlset?.url) {
    const items = Array.isArray(doc.urlset.url) ? doc.urlset.url : [doc.urlset.url];
    return items.map(u => u.loc).filter(Boolean);
  }
  return [];
}

(async () => {
  const urls = await collect(root);
  urls.sort();
  console.log(urls.join('\n'));
})().catch(err => { console.error(err); process.exit(1); });