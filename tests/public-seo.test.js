'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { publicOrigin, escapeXml } = require('../src/utils/publicSeo');

test('uses only a configured trusted public origin', () => {
  assert.equal(publicOrigin({ PUBLIC_SITE_URL: 'https://rentals.example.test/' }),
    'https://rentals.example.test');
  assert.equal(publicOrigin({ PUBLIC_SITE_URL: 'http://localhost:4000/' }),
    'http://localhost:4000');
  for (const bad of [
    '', 'http://insecure.example.test', 'https://evil.test/path',
    'https://evil.test/?redirect=1', 'https://user:pass@evil.test/',
    'javascript:alert(1)',
  ]) assert.equal(publicOrigin({ PUBLIC_SITE_URL: bad }), '');
});

test('sitemap XML safely escapes supplied content', () => {
  assert.equal(escapeXml('&<>"\''), '&amp;&lt;&gt;&quot;&apos;');
});

test('public discovery routes exclude all unpublished listings', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/web/discovery.js'), 'utf8');
  assert.match(source, /status:\s*'published'/);
  assert.match(source, /PUBLIC_SITE_URL must be configured/);
  assert.match(source, /escapeXml\(item\.url\)/);
  assert.match(source, /Disallow:/);
});

test('private views are noindex and public pages have canonical support', () => {
  const view = file => fs.readFileSync(path.join(__dirname, '../src/views', file), 'utf8');
  assert.match(view('partials/head.ejs'), /noindex,nofollow/);
  assert.match(view('pages/home.ejs'), /rel="canonical"/);
  assert.match(view('pages/listings/index.ejs'), /publicListingIndex/);
  assert.match(view('pages/listings/show.ejs'), /publicListing/);
  assert.match(view('pages/listings/show.ejs'), /encodeURIComponent\(listing.slug\)/);
});
