const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { apiOrigin, createApiClient } = require('../desktop/api-client.cjs');

test('production API default, legacy config and insecure URL rejection', () => {
  assert.equal(apiOrigin({}), 'https://api.8sianracha.com');
  assert.equal(apiOrigin({ url: 'https://api.8sianracha.com/pos/' }), 'https://api.8sianracha.com');
  for (const apiUrl of [
    'http://example.com',
    'https://example.com/api',
    'https://a:b@example.com',
    'file:///app',
  ])
    assert.throws(() => apiOrigin({ apiUrl }));
});

test('desktop session is sent only to POS API and clears after logout/401', async (t) => {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push({ path: req.url, cookie: req.headers.cookie, origin: req.headers.origin });
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/pos/login')
      res.setHeader('Set-Cookie', 'pos_session=test-session; HttpOnly; Path=/');
    if (req.url === '/api/pos/expired') res.statusCode = 401;
    res.end('{}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  const client = createApiClient(origin);
  await client('login', { username: 'cashier', password: 'test' });
  await client('products');
  assert.equal(requests[1].cookie, 'pos_session=test-session');
  assert.equal(requests[1].origin, origin);
  await client('logout', {});
  await client('me');
  assert.equal(requests.at(-1).cookie, undefined);
  await client('login', {});
  await client('expired');
  await client('me');
  assert.equal(requests.at(-1).cookie, undefined);
  for (const route of [
    '../admin',
    '/../../admin',
    'https://evil.example',
    '//evil.example',
    'me#x',
  ])
    await assert.rejects(client(route));
  await assert.rejects(client('products', {}, 'DELETE'));
});
