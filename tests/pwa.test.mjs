import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicFiles = [
  'app.js', 'couple-mark.svg', 'date-utils.mjs', 'github-store.mjs',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'index.html', 'manifest.webmanifest', 'styles.css', 'sw.js'
];
const workerSource = await readFile(join(root, 'sw.js'), 'utf8');
const workerUrl = 'https://example.github.io/couple/sw.js';

async function listFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? listFiles(join(directory, entry.name), relative) : [relative];
  }));
  return files.flat().sort();
}

function createWorker({ network = async () => { throw new TypeError('offline'); } } = {}) {
  const listeners = new Map();
  const stores = new Map();
  const opened = [];
  const deleted = [];
  const fetched = [];
  let skipped = 0;
  let claimed = 0;
  const urlFor = (request) => new URL(typeof request === 'string' ? request : request.url, workerUrl).href;
  const caches = {
    async open(name) {
      opened.push(name);
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async addAll(paths) {
          for (const path of paths) entries.set(urlFor(path), new Response(`shell:${path}`));
        },
        async put(request, response) { entries.set(urlFor(request), response); },
        async match(request) { return entries.get(urlFor(request))?.clone(); }
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { deleted.push(name); return stores.delete(name); }
  };
  const self = {
    location: { href: workerUrl },
    addEventListener(type, listener) { listeners.set(type, listener); },
    skipWaiting() { skipped += 1; return Promise.resolve(); },
    clients: { claim() { claimed += 1; return Promise.resolve(); } }
  };
  vm.runInNewContext(workerSource, {
    self, caches, URL, Response,
    fetch: async (request) => { fetched.push(request); return network(request); }
  }, { filename: 'sw.js' });
  return {
    stores, opened, deleted, fetched,
    get skipped() { return skipped; },
    get claimed() { return claimed; },
    async lifecycle(type) {
      let pending;
      listeners.get(type)({ waitUntil(value) { pending = value; } });
      await pending;
    },
    request(path, method = 'GET') {
      let response;
      listeners.get('fetch')({
        request: { url: new URL(path, workerUrl).href, method },
        respondWith(value) { response = value; }
      });
      return response;
    }
  };
}

test('manifest supports project-subpath installs and its PNG icons have their declared dimensions', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.id, './');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512'));
  for (const icon of [...manifest.icons, { src: './icons/icon-180.png', sizes: '180x180', type: 'image/png' }]) {
    const bytes = await readFile(resolve(root, icon.src));
    assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.equal(icon.type, 'image/png');
    assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.sizes);
  }
});

test('HTML and native module asset references resolve to included public files', async () => {
  const html = await readFile(join(root, 'index.html'), 'utf8');
  const references = [...html.matchAll(/(?:href|src)="(\.\/[^"#]+)"/g)].map((match) => match[1].slice(2));
  assert.ok(references.includes('manifest.webmanifest'));
  assert.ok(references.includes('app.js'));
  assert.ok(references.includes('icons/icon-180.png'));
  for (const reference of references) assert.ok(publicFiles.includes(reference), reference);
  for (const file of ['app.js', 'github-store.mjs', 'date-utils.mjs']) {
    const source = await readFile(join(root, file), 'utf8');
    for (const match of source.matchAll(/(?:from\s*|import\s*)['"](\.\/[^'"]+)['"]/g)) {
      assert.ok(publicFiles.includes(match[1].slice(2)), `${file}: ${match[1]}`);
    }
  }
  assert.doesNotMatch(html, /<(?:script|link)\b[^>]+(?:src|href)="https?:/i);
});

test('the actual build removes stale output and produces only public assets in an isolated fixture', async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), 'project-love-pwa-test-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  await mkdir(join(fixture, 'scripts'));
  await cp(join(root, 'scripts/build.mjs'), join(fixture, 'scripts/build.mjs'));
  for (const file of publicFiles) {
    await mkdir(dirname(join(fixture, file)), { recursive: true });
    await cp(join(root, file), join(fixture, file));
  }
  await mkdir(join(fixture, 'couple-data'));
  await writeFile(join(fixture, 'couple-data/private.json'), '{"private":"must not deploy"}');
  await writeFile(join(fixture, '.env'), 'SECRET=must-not-deploy');
  await writeFile(join(fixture, 'README.md'), 'Developer instructions');
  await mkdir(join(fixture, 'dist/stale-private-data'), { recursive: true });
  await writeFile(join(fixture, 'dist/stale-private-data/private.json'), '{"private":"must not survive rebuild"}');
  await writeFile(join(fixture, 'dist/.env'), 'SECRET=must-not-survive-rebuild');
  const result = spawnSync(process.execPath, [join(fixture, 'scripts/build.mjs')], { cwd: tmpdir(), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(await listFiles(join(fixture, 'dist')), [...publicFiles].sort());
  for (const file of publicFiles) {
    assert.deepEqual(await readFile(join(fixture, 'dist', file)), await readFile(join(root, file)), file);
  }
});

test('service worker installs the complete shell under a GitHub Pages project subpath', async () => {
  const worker = createWorker();
  await worker.lifecycle('install');
  assert.equal(worker.skipped, 1);
  assert.equal(worker.stores.size, 1);
  const cachedUrls = [...[...worker.stores.values()][0].keys()];
  const expected = ['./', ...publicFiles.filter((file) => file !== 'sw.js').map((file) => `./${file}`)]
    .map((file) => new URL(file, workerUrl).href).sort();
  assert.deepEqual(cachedUrls.sort(), expected);
  assert.ok(cachedUrls.every((url) => url.startsWith('https://example.github.io/couple/')));
});

test('activation removes only obsolete app-shell caches and preserves unrelated applications', async () => {
  const worker = createWorker();
  await worker.lifecycle('install');
  const currentCache = [...worker.stores.keys()][0];
  worker.stores.set('between-us-shell-v0', new Map());
  worker.stores.set('another-app-cache', new Map());
  await worker.lifecycle('activate');
  assert.deepEqual(worker.deleted, ['between-us-shell-v0']);
  assert.ok(worker.stores.has(currentCache));
  assert.ok(worker.stores.has('another-app-cache'));
  assert.equal(worker.claimed, 1);
});

test('the service worker never intercepts GitHub/weather APIs, private paths, writes, or query variants', async () => {
  const worker = createWorker();
  for (const [url, method] of [
    ['https://api.github.com/repos/owner/private/contents/couple-data/whispers', 'GET'],
    ['https://api.open-meteo.com/v1/forecast?latitude=30', 'GET'],
    ['https://geocoding-api.open-meteo.com/v1/search?name=Chengdu', 'GET'],
    ['./couple-data/private.json', 'GET'],
    ['./.env', 'GET'],
    ['./app.js?token=private', 'GET'],
    ['./app.js', 'POST'],
    ['./index.html', 'PUT'],
    ['./styles.css', 'DELETE']
  ]) assert.equal(worker.request(url, method), undefined, `${method} ${url}`);
  assert.equal(worker.opened.length, 0);
  assert.equal(worker.fetched.length, 0);
});

test('shell requests prefer a successful network response and update only the shell cache', async () => {
  const worker = createWorker({ network: async () => new Response('updated public shell') });
  await worker.lifecycle('install');
  const response = await worker.request('./app.js');
  assert.equal(await response.text(), 'updated public shell');
  const stored = [...worker.stores.values()][0].get(new URL('./app.js', workerUrl).href);
  assert.equal(await stored.clone().text(), 'updated public shell');
  assert.equal(worker.fetched.length, 1);
});

test('offline shell requests return previously cached content while a missing entry is a network error', async () => {
  const worker = createWorker();
  await worker.lifecycle('install');
  const response = await worker.request('./index.html');
  assert.equal(await response.text(), 'shell:./index.html');
  [...worker.stores.values()][0].delete(new URL('./app.js', workerUrl).href);
  assert.equal((await worker.request('./app.js')).type, 'error');
});

test('HTTP error responses never overwrite an already usable cached shell', async () => {
  const worker = createWorker({ network: async () => new Response('unavailable', { status: 503 }) });
  await worker.lifecycle('install');
  assert.equal((await worker.request('./index.html')).status, 503);
  const stored = [...worker.stores.values()][0].get(new URL('./index.html', workerUrl).href);
  assert.equal(await stored.clone().text(), 'shell:./index.html');
});
