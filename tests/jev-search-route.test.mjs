import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../src/pages/api/jev-search.js';

const url = 'https://maggieappleton.com/api/jev-search';

test('a valid search request without a server key returns a safe 503 response', async () => {
  const previousKey = process.env.TYPESAFE_API_KEY;
  delete process.env.TYPESAFE_API_KEY;
  try {
    const request = new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'digital gardens' }),
    });
    const response = await POST({ request, clientAddress: 'route-test-missing-key' });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'Live search needs a server API key.' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally {
    if (previousKey === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previousKey;
  }
});

test('the public route rejects cross-site and malformed requests before searching', async () => {
  const cases = [
    { name: 'cross-site origin', headers: { origin: 'https://example.com', 'content-type': 'application/json' }, body: '{"query":"garden"}', status: 403 },
    { name: 'wrong content type', headers: { 'content-type': 'text/plain' }, body: 'garden', status: 415 },
    { name: 'oversized body', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'x'.repeat(5000) }), status: 413 },
    { name: 'invalid JSON', headers: { 'content-type': 'application/json' }, body: '{', status: 400 },
    { name: 'short query', headers: { 'content-type': 'application/json' }, body: '{"query":"ab"}', status: 400 },
  ];

  for (const [index, input] of cases.entries()) {
    const request = new Request(url, { method: 'POST', headers: input.headers, body: input.body });
    const response = await POST({ request, clientAddress: `route-test-invalid-${index}` });
    assert.equal(response.status, input.status, input.name);
    assert.equal(response.headers.get('content-type'), 'application/json');
  }
});
