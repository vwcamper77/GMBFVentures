import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import core from '../lib/enquiry-core.js';
import { createEnquiryHandler } from '../api/enquiry.mjs';
import { createLocalServer } from '../scripts/dev.mjs';

const enquiry = { route: 'consultancy', type: 'Capital Programme Health Check', name: 'Local test', organisation: 'Example', email: 'person@example.test', message: 'Synthetic <example> enquiry.' };
const configured = { RESEND_API_KEY: 'local-test', MAIL_FROM: 'sender@example.test', MAIL_TO: 'inbox@example.test' };
const permit = { check: () => ({ allowed: true }) };
const requestId = 'd71ea451-5206-4b58-9fc1-1f87e7523820';

function fixture(options) {
  return createEnquiryHandler({ env: configured, rateLimiter: permit, send: async () => 'mock', ...options });
}

function jsonRequest(body, headers) {
  return new Request('http://localhost/api/enquiry', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
}

test('all three routes preserve the message and use the form address for Reply-To', async () => {
  const send = async (email, env, id) => {
    assert.equal(env, configured);
    assert.equal(id, requestId);
    assert.equal(email.from, configured.MAIL_FROM);
    assert.deepEqual(email.to, [configured.MAIL_TO]);
    assert.equal(email.reply_to, enquiry.email);
    assert.ok(email.text.includes(enquiry.message));
    assert.ok(email.html.includes('&lt;example&gt;'));
    assert.equal(email.tags[0].name, 'route');
    return 'mock';
  };
  for (const [route, options] of Object.entries(core.ROUTES)) {
    const response = await fixture({ send })(jsonRequest({ ...enquiry, route, type: options.types[0] }, { 'Idempotency-Key': requestId }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  }
});

test('fast and link-rich valid enquiries are accepted', async () => {
  const message = 'Please review ' + Array.from({ length: 8 }, (_, i) => 'https://example.test/' + i).join(' ');
  const response = await fixture()(jsonRequest({ ...enquiry, message, ts: 1 }));
  assert.equal(response.status, 200);
});

test('invalid details and triggered spam check get recoverable errors', async () => {
  const send = async () => assert.fail('Rejected data reached the provider');
  const handler = fixture({ send });
  const invalid = await handler(jsonRequest({ ...enquiry, email: 'bad address', organisation: [] }));
  assert.equal(invalid.status, 400);
  assert.deepEqual(Object.keys((await invalid.json()).errors).sort(), ['email', 'organisation']);
  const rejected = await handler(jsonRequest({ ...enquiry, website: 'filled' }));
  assert.equal(rejected.status, 400);
  assert.equal((await rejected.json()).ok, false);
});

test('request parser enforces shape, supported media and UTF-8 byte size', async () => {
  const handler = fixture();
  assert.equal((await handler(jsonRequest(null))).status, 400);
  assert.equal((await handler(jsonRequest([]))).status, 400);
  assert.equal((await handler(jsonRequest({ ...enquiry, message: 'é'.repeat(core.MAX_BODY_BYTES / 2) }))).status, 413);
  assert.equal((await handler(new Request('http://localhost/api/enquiry', {
    method: 'POST', headers: { accept: 'application/json' }, body: 'Unaccepted media type',
  }))).status, 415);
  const maximumPlainMessage = new URLSearchParams({ ...enquiry, message: '漢'.repeat(5000) });
  const response = await handler(new Request('http://localhost/api/enquiry', { method: 'POST', body: maximumPlainMessage }));
  assert.equal(response.headers.get('location'), '/enquiry-sent.html');
});

test('different browser origins and unsupported methods are rejected', async () => {
  const handler = fixture();
  assert.equal((await handler(jsonRequest(enquiry, { origin: 'https://other.example.test' }))).status, 403);
  assert.equal((await handler(jsonRequest(enquiry, { origin: 'http://localhost' }))).status, 200);
  const response = await handler(new Request('http://localhost/api/enquiry'));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'POST');
});

test('delivery errors are distinct from success and responses are not cached', async () => {
  const missing = await fixture({ env: {} })(jsonRequest(enquiry));
  assert.equal(missing.status, 503);
  const failure = await fixture({ send: async () => { throw new Error('Mock delivery error'); } })(jsonRequest(enquiry));
  assert.equal(failure.status, 502);
  assert.equal(failure.headers.get('cache-control'), 'no-store');
  assert.equal((await failure.json()).ok, false);
});

test('mail provider gets a timeout and stable idempotency key', async () => {
  const payload = core.buildEmail(enquiry, configured);
  const id = await core.sendViaResend(payload, configured, requestId, async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(options.headers['Idempotency-Key'], 'gmbf-enquiry/' + requestId);
    assert.equal(options.headers.Authorization, 'Bearer local-test');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ id: 'mock-confirmation' });
  });
  assert.equal(id, 'mock-confirmation');
  await assert.rejects(core.sendViaResend(payload, configured, undefined, async () => Response.json({})), /no confirmation/);
});

test('instance rate limit expires and bounds memory', () => {
  const limiter = core.createRateLimiter({ limit: 1, windowMs: 1000, maxEntries: 1 });
  assert.equal(limiter.check('first', 10).allowed, true);
  assert.deepEqual(limiter.check('first', 11), { allowed: false, retryAfter: 1 });
  assert.equal(limiter.check('second', 12).allowed, false);
  assert.equal(limiter.check('second', 1010).allowed, true);
});

test('local HTTP server handles enhanced forms, native forms and public assets', async t => {
  const server = createLocalServer();
  t.after(() => new Promise(resolve => server.close(resolve)));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const page = await fetch(origin + '/contact.html');
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal((await page.text()).match(/action="\/api\/enquiry"/g).length, 3);
  const asset = await fetch(origin + '/favicon.svg');
  assert.ok((await asset.text()).includes('GF monogram'));
  const api = origin + '/api/enquiry';
  const json = await fetch(api, { method: 'POST', body: JSON.stringify(enquiry), headers: { 'content-type': 'application/json', origin } });
  assert.equal(json.status, 200);
  const native = await fetch(api, { method: 'POST', body: new URLSearchParams(enquiry), redirect: 'manual' });
  assert.equal(native.status, 303);
  assert.equal(native.headers.get('location'), '/enquiry-sent.html');
  const invalid = await fetch(api, { method: 'POST', body: new URLSearchParams({ ...enquiry, name: '' }), redirect: 'manual' });
  assert.equal(invalid.status, 303);
  assert.equal(invalid.headers.get('location'), '/enquiry-error.html');
});
