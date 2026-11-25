import { readFile } from 'node:fs/promises';
import { zipSync } from 'fflate';

export const brandPackPath = 'assets/downloads/gmbf-brand-pack.zip';

const brandAssets = '../src/site/assets/brand/';
const packFiles = {
  'README.md': '../brand-pack/README.md',
  'logos/gmbf-logo.svg': brandAssets + 'logo.svg',
  'logos/gmbf-logo-reverse.svg': brandAssets + 'logo-reverse.svg',
  'favicons/open-g.svg': brandAssets + 'open-g.svg',
  'favicons/open-g-64.png': brandAssets + 'open-g-64.png',
  'favicons/favicon-g.ico': '../brand-pack/favicon-g.ico',
  'favicons/favicon-gf.svg': '../src/site/favicon.svg',
  'favicons/favicon-gf-32.png': '../src/site/favicon-32.png',
  'favicons/apple-touch-icon-gf.png': '../src/site/apple-touch-icon.png',
  'favicons/app-icon-gf-192.png': brandAssets + 'icon-192.png',
  'favicons/app-icon-gf-512.png': brandAssets + 'icon-512.png',
  'email/email-logo.png': brandAssets + 'email-logo.png',
  'email/signature.html': '../brand-pack/signature.html',
  'email/signature.txt': '../brand-pack/signature.txt',
  'social/gmbf-social-card.png': brandAssets + 'og-image.png',
};

export async function createBrandPack() {
  const files = await Promise.all(Object.entries(packFiles).map(async ([name, file]) => {
    return [name, await readFile(new URL(file, import.meta.url))];
  }));
  return zipSync(Object.fromEntries(files), { mtime: new Date('2026-01-01T12:00:00') });
}
