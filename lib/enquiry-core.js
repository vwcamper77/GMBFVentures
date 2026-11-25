'use strict';

const ROUTES = {
  consultancy: { label: 'Consultancy enquiry', types: ['Capital Programme Health Check', 'Capital Delivery', 'Infrastructure Transformation', 'Other consultancy'] },
  'ai-digital': { label: 'AI and digital project enquiry', types: ['Applied AI delivery improvement', 'Knowledge Management', 'SnagSort', 'Other digital project'] },
  partnerships: { label: 'Partnership enquiry', types: ['Delivery or consultancy partnership', 'Product or technology partnership', 'Other partnership'] },
};
const LIMITS = { name: [1, 100], organisation: [0, 150], email: [3, 254], message: [10, 5000] };
const MAX_BODY_BYTES = 64 * 1024;
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;

const clean = value => typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : '';
const oneLine = value => clean(value).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ');

function validate(body) {
  const data = {
    route: oneLine(body.route), name: oneLine(body.name), organisation: oneLine(body.organisation),
    email: oneLine(body.email), type: oneLine(body.type), message: clean(body.message),
  };
  const errors = {};
  if (!Object.hasOwn(ROUTES, data.route)) errors.route = 'Choose an enquiry route.';
  for (const [field, [min, max]] of Object.entries(LIMITS)) {
    if ((field !== 'organisation' || Object.hasOwn(body, field)) && typeof body[field] !== 'string') {
      errors[field] = 'Enter a valid value.';
    } else if (data[field].length < min) {
      errors[field] = field === 'message' ? 'Enter at least 10 characters.' : 'Enter your ' + field + '.';
    } else if (data[field].length > max) {
      errors[field] = 'Use ' + max + ' characters or fewer.';
    }
  }
  if (!errors.email && !EMAIL_RE.test(data.email)) errors.email = 'Enter a valid email address.';
  if (!errors.route && !ROUTES[data.route].types.includes(data.type)) errors.type = 'Choose an enquiry type.';
  return { ok: Object.keys(errors).length === 0, data, errors };
}

// The hosting firewall must enforce the shared limit. This also caps local bursts and memory.
function createRateLimiter({ limit = 5, windowMs = 600000, maxEntries = 5000 } = {}) {
  const hits = new Map();
  function prune(now) {
    for (const [key, entry] of hits) {
      if (entry.expires > now) break;
      hits.delete(key);
    }
  }
  return {
    check(key, now = Date.now()) {
      prune(now);
      const entry = hits.get(key);
      if (entry) {
        if (entry.count >= limit) return { allowed: false, retryAfter: Math.ceil((entry.expires - now) / 1000) };
        entry.count++;
      } else {
        if (hits.size >= maxEntries) return { allowed: false, retryAfter: 60 };
        hits.set(key, { expires: now + windowMs, count: 1 });
      }
      return { allowed: true };
    },
  };
}

const escape = value => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function buildEmail(data, env) {
  const route = ROUTES[data.route];
  const rows = [['Route', route.label], ['Name', data.name], ['Organisation', data.organisation || '—'], ['Email', data.email], ['Enquiry type', data.type]];
  return {
    from: env.MAIL_FROM,
    to: (env.MAIL_TO || 'hello@gmbfventures.co.uk').split(',').map(value => value.trim()).filter(Boolean),
    reply_to: data.email,
    subject: route.label,
    text: rows.map(([label, value]) => label + ': ' + value).join('\n') + '\n\n' + data.message,
    html: '<dl>' + rows.map(([label, value]) => '<dt>' + escape(label) + '</dt><dd>' + escape(value) + '</dd>').join('') + '</dl><p style="white-space:pre-wrap">' + escape(data.message) + '</p>',
    tags: [{ name: 'route', value: data.route }],
  };
}

const validRequestId = key => typeof key === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(key);

async function sendViaResend(payload, env, requestId, fetcher = globalThis.fetch) {
  const headers = { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' };
  if (requestId) headers['Idempotency-Key'] = 'gmbf-enquiry/' + requestId;
  const response = await fetcher('https://api.resend.com/emails', {
    method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw Object.assign(new Error('Mail provider rejected the request'), { status: response.status });
  const { id } = await response.json();
  if (typeof id !== 'string' || !id) throw new Error('Mail provider returned no confirmation ID');
  return id;
}

module.exports = { ROUTES, MAX_BODY_BYTES, validate, createRateLimiter, buildEmail, validRequestId, sendViaResend };
