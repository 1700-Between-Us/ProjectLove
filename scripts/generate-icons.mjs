// Optional development helper: pass a path to an installed sharp package.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const sharp = require(process.argv[2] || 'sharp');
const dir = new URL('../icons/', import.meta.url);
await mkdir(dir, { recursive: true });
// Keep all artwork within the maskable icon safe zone.
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 64 64"><rect width="64" height="64" fill="#163C31"/><g transform="translate(7 7) scale(.78)"><path d="M8 38c8-14 16-14 24 0s16 14 24 0" stroke="#F6D47A" stroke-width="4" stroke-linecap="round" fill="none"/><circle cx="22" cy="23" r="5" fill="#F3A38D"/><circle cx="42" cy="23" r="5" fill="#9EC6B1"/></g></svg>`);
for (const size of [180, 192, 512]) await sharp(svg).resize(size, size).png().toFile(fileURLToPath(new URL(`icon-${size}.png`, dir)));
console.log('PWA icons generated.');
