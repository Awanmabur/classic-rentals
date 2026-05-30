const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../src/app');

test('GET /healthz returns ok payload', async () => {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/healthz`, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => resolve({ statusCode: response.statusCode, body: JSON.parse(body) }));
      }).on('error', reject);
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.service, 'classic-rentals');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
