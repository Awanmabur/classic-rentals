'use strict';

/** Public SEO origin must come from trusted configuration, never a request Host header. */
function publicOrigin(env = process.env) {
  const raw = String(env.PUBLIC_SITE_URL || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const local = ['localhost', '127.0.0.1'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) return '';
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return '';
    if (parsed.pathname !== '/' && parsed.pathname !== '') return '';
    return parsed.origin;
  } catch {
    return '';
  }
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[ch]);
}

module.exports = { publicOrigin, escapeXml };
