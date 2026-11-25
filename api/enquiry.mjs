import core from '../lib/enquiry-core.js';

const limiter = core.createRateLimiter();
const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };

function reply(request, status, body, extraHeaders) {
  const responseHeaders = { ...headers, ...extraHeaders };
  if (request.method === 'POST' &&
      !request.headers.get('accept')?.includes('application/json') &&
      !request.headers.get('content-type')?.startsWith('application/json')) {
    responseHeaders.Location = body.ok ? '/enquiry-sent.html' : '/enquiry-error.html';
    return new Response(null, { status: 303, headers: responseHeaders });
  }
  return Response.json(body, { status, headers: responseHeaders });
}

async function readBody(request) {
  const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (type !== 'application/json' && type !== 'application/x-www-form-urlencoded') {
    return { error: 'unsupported_media_type', status: 415 };
  }
  if (Number(request.headers.get('content-length')) > core.MAX_BODY_BYTES) {
    return { error: 'too_large', status: 413 };
  }
  if (!request.body) return { error: 'bad_request', status: 400 };

  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > core.MAX_BODY_BYTES) {
        void reader.cancel().catch(() => {});
        return { error: 'too_large', status: 413 };
      }
      chunks.push(value);
    }
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    const body = type === 'application/json' ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'bad_request', status: 400 };
    return { body };
  } catch {
    return { error: 'bad_request', status: 400 };
  } finally {
    reader.releaseLock();
  }
}

export function createEnquiryHandler({ env = process.env, send = core.sendViaResend, rateLimiter = limiter } = {}) {
  return async function handle(request) {
    const fail = (status, error, extra, headers) => reply(request, status, { ok: false, error, ...extra }, headers);
    if (request.method !== 'POST') return fail(405, 'method_not_allowed', {}, { Allow: 'POST' });

    const origin = request.headers.get('origin');
    const allowed = (env.ALLOWED_ORIGINS || new URL(request.url).origin).split(',').map(value => value.trim());
    if (origin && !allowed.includes(origin)) return fail(403, 'origin');

    const ip = request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim() || 'unknown';
    const rate = rateLimiter.check(ip);
    if (!rate.allowed) return fail(429, 'rate_limited', {}, { 'Retry-After': String(rate.retryAfter) });

    const { body, status, error } = await readBody(request);
    if (error) return fail(status, error);
    if (typeof body.website === 'string' && body.website.trim()) return fail(400, 'spam_check');
    const validation = core.validate(body);
    if (!validation.ok) return fail(400, 'validation', { errors: validation.errors });

    if (!env.RESEND_API_KEY || !env.MAIL_FROM) return fail(503, 'not_configured');
    try {
      const key = request.headers.get('idempotency-key');
      const id = await send(core.buildEmail(validation.data, env), env, core.validRequestId(key) ? key : undefined);
      console.info(JSON.stringify({ event: 'enquiry_accepted', route: validation.data.route, id }));
    } catch (error) {
      console.error(JSON.stringify({ event: 'enquiry_provider_error', status: error.status, type: error.name }));
      return fail(502, 'send_failed');
    }
    return reply(request, 200, { ok: true });
  };
}

export default { fetch: createEnquiryHandler() };
