import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const assets = new Set(['index.html', 'app.js', 'styles.css', 'date-utils.mjs', 'github-store.mjs', 'sw.js', 'couple-mark.svg', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png']);
// A development-only fixture exercises real iframe viewports without browser emulation.
assets.add('tests/responsive.html');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const port = Number(process.env.PORT || 4174);
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const path = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (!assets.has(path)) { res.writeHead(404); res.end('Not found'); return; }
    const bytes = await readFile(resolve(root, path));
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(bytes);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`两地之间：http://127.0.0.1:${port}/（Ctrl+C 停止）`));
