import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { Readable } from 'node:stream';
import { createEnquiryHandler } from '../api/enquiry.mjs';
import { brandPackPath, createBrandPack } from './brand-pack.mjs';

const source = new URL('../src/site/', import.meta.url);
const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};
const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const previewHeaders = { ...Object.fromEntries(vercel.headers[0].headers.map(({ key, value }) => [key, value])), 'X-Robots-Tag': 'noindex, nofollow' };

export function createLocalServer({ send } = {}) {
  const handler = createEnquiryHandler({
    env: { RESEND_API_KEY: 'local-only', MAIL_FROM: 'sender@example.test', MAIL_TO: 'inbox@example.test' },
    send: send || (async () => 'local-mock-message'),
    rateLimiter: { check: () => ({ allowed: true }) },
  });
  return createServer(async (incoming, response) => {
    try {
      const address = new URL(incoming.url, 'http://127.0.0.1:' + incoming.socket.localPort);
      if (address.pathname === '/' + brandPackPath && ['GET', 'HEAD'].includes(incoming.method)) {
        const archive = await createBrandPack();
        response.writeHead(200, { ...previewHeaders, 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="gmbf-brand-pack.zip"' });
        response.end(incoming.method === 'HEAD' ? undefined : archive);
        return;
      }
      if (address.pathname === '/api/enquiry') {
        const hasBody = !['GET', 'HEAD'].includes(incoming.method);
        const result = await handler(new Request(address, {
          method: incoming.method,
          headers: incoming.headers,
          ...(hasBody ? { body: Readable.toWeb(incoming), duplex: 'half' } : {}),
        }));
        response.writeHead(result.status, Object.fromEntries(result.headers));
        response.end(result.body ? Buffer.from(await result.arrayBuffer()) : undefined);
        return;
      }
      const name = address.pathname === '/' ? 'index.html' : address.pathname.slice(1);
      const type = contentTypes[extname(name)];
      const target = new URL(name, source);
      if (type && target.href.startsWith(source.href) && !name.includes('%')) {
        const data = await readFile(target).catch(() => null);
        if (data) {
          response.writeHead(200, { ...previewHeaders, 'Content-Type': type });
          response.end(incoming.method === 'HEAD' ? undefined : data);
          return;
        }
      }
      response.writeHead(404, { ...previewHeaders, 'Content-Type': contentTypes['.html'] });
      response.end(await readFile(new URL('404.html', source)));
    } catch {
      response.writeHead(500);
      response.end();
    }
  });
}

if (process.argv[1] && process.argv[1].endsWith('dev.mjs')) {
  createLocalServer().listen(Number(process.env.PORT) || 59052, '127.0.0.1', function () {
    console.log('Local preview with mock email at http://127.0.0.1:' + this.address().port);
  });
}
