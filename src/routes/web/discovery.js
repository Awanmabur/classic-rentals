'use strict';

const express = require('express');
const Listing = require('../../models/Listing');
const { publicOrigin, escapeXml } = require('../../utils/publicSeo');

const router = express.Router();
const blockedPaths = [
  '/api/', '/auth/', '/dashboard/', '/p/', '/listings/create',
  '/listings/manage', '/healthz',
];

router.get('/robots.txt', (_req, res) => {
  const origin = publicOrigin();
  res.type('text/plain').set('Cache-Control', 'public, max-age=900');
  res.send([
    'User-agent: *',
    'Allow: /',
    ...blockedPaths.map(p => 'Disallow: ' + p),
    ...(origin ? ['Sitemap: ' + origin + '/sitemap.xml'] : []),
    '',
  ].join('\n'));
});

router.get('/llms.txt', (_req, res) => {
  const origin = publicOrigin();
  res.type('text/plain').set('Cache-Control', 'public, max-age=900');
  res.send([
    '# Classic Rentals',
    '',
    '> Property, accommodation and vehicle rental listings.',
    '',
    'Public listings are discoverable at /listings. Listing availability,',
    'pricing and verification status should be confirmed on the live listing.',
    'Account, administrative, payment and private information is not public.',
    ...(origin ? ['', 'Public listings: ' + origin + '/listings',
      'Sitemap: ' + origin + '/sitemap.xml'] : []),
    '',
  ].join('\n'));
});

router.get('/sitemap.xml', async (_req, res, next) => {
  const origin = publicOrigin();
  if (!origin) {
    return res.status(503).set('Cache-Control', 'no-store')
      .type('text/plain').send('PUBLIC_SITE_URL must be configured before sitemap publication');
  }

  try {
    // Only actual published records; never include draft, paid or private pages.
    const listings = await Listing.find({
      status: 'published',
      slug: { $exists: true, $ne: '' },
    }).select('slug updatedAt').sort({ updatedAt: -1 }).limit(10000).lean();

    const items = [
      { url: origin + '/' },
      { url: origin + '/listings' },
      ...listings.filter(x => typeof x.slug === 'string' && x.slug.length)
        .map(x => ({
          url: origin + '/listings/' + encodeURIComponent(x.slug),
          date: x.updatedAt && !Number.isNaN(new Date(x.updatedAt).getTime())
            ? new Date(x.updatedAt).toISOString().slice(0, 10) : '',
        })),
    ];

    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      items.map(item => '  <url><loc>' + escapeXml(item.url) + '</loc>' +
        (item.date ? '<lastmod>' + item.date + '</lastmod>' : '') + '</url>').join('\n') +
      '\n</urlset>\n';

    res.type('application/xml').set('Cache-Control', 'public, max-age=900').send(xml);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
