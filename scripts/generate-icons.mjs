// Optional development helper: pass a path to an installed sharp package.
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const sharp = require(process.argv[2] || 'sharp');
const dir = new URL('../icons/', import.meta.url);
await mkdir(dir, { recursive: true });
// Keep all artwork within the maskable icon safe zone.
const artwork = await readFile(new URL('../couple-mark.svg', import.meta.url), 'utf8');
const inner = artwork.replace(/<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 64 64"><rect width="64" height="64" fill="#fff1f6"/><g transform="translate(6 6) scale(.8125)">${inner}</g></svg>`);
for (const size of [180, 192, 512]) await sharp(svg).resize(size, size).png().toFile(fileURLToPath(new URL(`icon-${size}.png`, dir)));
console.log('PWA icons generated.');
