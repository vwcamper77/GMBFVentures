import { cp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = new URL('../src/site/', import.meta.url);
const output = new URL('../dist/', import.meta.url);
const aboutPage = fileURLToPath(new URL('about.html', source));
const hosted = process.argv.includes('--hosted');
const production = hosted && (process.env.VERCEL_ENV === 'production' || process.env.VERCEL_TARGET_ENV === 'production');
const formsEnabled = !hosted || Boolean(process.env.CONTACT_FORMS_ENABLED === '1' && process.env.RESEND_API_KEY && process.env.MAIL_FROM);
const utilityPages = new Set(['404.html', 'enquiry-sent.html', 'enquiry-error.html']);
const contentPages = [];
const forbidden = /(?:MAPM|First Rail|Avanti|Macclesfield|linkedin|Guest Set Go|£|day rate|(?<!Capital )Programme Health Check)/i;
for (const entry of await readdir(source, { withFileTypes: true, recursive: true })) {
  if (entry.isDirectory()) continue;
  const allowed = /\.(?:html|css|js|svg|png|jpg|webp|woff2|webmanifest|pdf|xml)$/.test(entry.name) || entry.name === 'robots.txt';
  if (!entry.isFile() || !allowed) throw new Error('Unexpected public file: ' + entry.name);
  if (!entry.name.endsWith('.html')) continue;
  const path = join(entry.parentPath || entry.path, entry.name);
  let copy = await readFile(path, 'utf8');
  if (path === aboutPage) {
    copy = copy
      .replace('<p class="eyebrow">First Rail · 2025–2026</p>', '')
      .replace('<h3>Macclesfield station refurbishment</h3>', '');
  }
  if (forbidden.test(copy)) throw new Error('Review publication restrictions in ' + entry.name);
  if (!utilityPages.has(entry.name)) contentPages.push(join(fileURLToPath(output), relative(fileURLToPath(source), path)));
}
await rm(output, { recursive: true, force: true });
await cp(source, output, { recursive: true });
if (!formsEnabled) {
  const contactPage = new URL('contact.html', output);
  const contact = await readFile(contactPage, 'utf8');
  let replaced = 0;
  const emailOnly = contact.replace(/<form class="enquiry"[^>]*data-subject="([^"]+)"[^>]*>[\s\S]*?<\/form>/g, (_form, subject) => {
    replaced++;
    const href = 'mailto:hello@gmbfventures.co.uk?subject=' + encodeURIComponent(subject);
    return '<div class="enquiry"><p>Contact Gavin at <a href="mailto:hello@gmbfventures.co.uk">hello@gmbfventures.co.uk</a>.</p>' +
      '<div class="actions"><a class="btn" href="' + href + '">Open email</a></div></div>';
  });
  if (replaced !== 3) throw new Error('Expected three enquiry routes for the email-only release');
  await writeFile(contactPage, emailOnly);
}
if (production) {
  for (const page of contentPages) {
    const html = await readFile(page, 'utf8');
    await writeFile(page, html.replace('<meta name="robots" content="noindex, nofollow">', ''));
  }
  await writeFile(new URL('robots.txt', output), 'User-agent: *\nAllow: /\nSitemap: https://www.gmbfventures.co.uk/sitemap.xml\n');
}
console.log('Built the qualitative public site in dist/.');
