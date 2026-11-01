import test from 'node:test';
import assert from 'node:assert/strict';
import { GithubStore } from '../github-store.mjs';

const config = { owner: 'test-pair', repo: 'test-data', branch: 'main', token: 'mock-only' };
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64');
const photo = (changes = {}) => ({ id: 'photo-1', owner: 'me', caption: '一起', createdAt: '2026-11-01T08:00:00Z', mime: 'image/webp', imagePath: 'couple-data/images/photo-1.webp', size: 3, width: 1, height: 1, ...changes });

test('new collections roundtrip through GitHub trees while image files remain lazy', async () => {
  const records = {
    'places/city-1': { id: 'city-1', name: '杭州', latitude: 30.25, longitude: 120.16, visitedAt: '2026-10-01' },
    'treeholes/note-1': { id: 'note-1', owner: 'me', recipient: 'partner', content: '听我说说', status: 'pending', createdAt: '2026-11-01T08:00:00Z', readAt: null },
    'photos/photo-1': photo()
  };
  const tree = Object.keys(records).map((name, index) => ({ type: 'blob', path: 'couple-data/' + name + '.json', sha: 'blob-' + index }));
  tree.push({ type: 'blob', path: 'couple-data/images/photo-1.webp', sha: 'image-must-not-fetch' });
  let blobReads = 0;
  const store = new GithubStore(config, async url => {
    if (String(url).includes('/git/trees/')) return response({ tree });
    blobReads++;
    const entry = tree.find(item => String(url).endsWith('/' + item.sha));
    assert.notEqual(entry.sha, 'image-must-not-fetch');
    return response({ content: encoded(records[entry.path.slice(12, -5)]) });
  });
  const loaded = await store.load();
  assert.equal(loaded.places[0].name, '杭州');
  assert.equal(loaded.treeholes[0].content, '听我说说');
  assert.equal(loaded.photos[0].imagePath, photo().imagePath);
  assert.equal(blobReads, 3);
});

test('photo metadata rejects traversal, unsupported formats, invalid dimensions and oversize images before a request', async () => {
  let calls = 0;
  const store = new GithubStore(config, async () => { calls++; return response({}); });
  for (const changes of [{ id: '../escape' }, { imagePath: 'couple-data/whispers/secret.json' }, { mime: 'image/svg+xml' }, { size: 1000000 }, { size: 0 }, { width: 1601 }, { height: 0 }, { owner: 'stranger' }]) {
    await assert.rejects(store.savePhoto(photo(changes), 'AQID'), /格式/);
    await assert.rejects(store.readPhoto(photo(changes)), /格式/);
  }
  for (const base64 of ['AQI=', 'AQID=', 'AQ**', '']) await assert.rejects(store.savePhoto(photo(), base64), /大小/);
  assert.equal(calls, 0);
});

test('photo upload sends authenticated binary content, then metadata can save its image SHA', async () => {
  const calls = [];
  const store = new GithubStore(config, async (url, options) => {
    calls.push({ url: String(url), options });
    assert.equal(options.headers.Authorization, 'Bearer mock-only');
    return response({ content: { sha: calls.length === 1 ? 'image-sha' : 'metadata-sha' } });
  });
  const uploaded = await store.savePhoto(photo(), 'AQID');
  assert.equal(uploaded.imageSha, 'image-sha');
  const saved = await store.save('photos', uploaded);
  assert.equal(saved._sha, 'metadata-sha');
  assert.ok(calls[0].url.endsWith('/contents/couple-data/images/photo-1.webp'));
  assert.equal(JSON.parse(calls[0].options.body).content, 'AQID');
  assert.ok(calls[1].url.endsWith('/contents/couple-data/photos/photo-1.json'));
  assert.equal(JSON.stringify(calls.map(call => JSON.parse(call.options.body))).includes(config.token), false);
});

test('photo read decodes authenticated bytes and rejects size mismatches', async () => {
  const store = new GithubStore(config, async (url, options) => {
    assert.ok(String(url).endsWith('.webp?ref=main'));
    assert.equal(options.cache, 'no-store');
    return response({ content: 'AQID\n' });
  });
  assert.deepEqual(await store.readPhoto(photo()), Uint8Array.from([1, 2, 3]));
  await assert.rejects(store.readPhoto(photo({ size: 4 })), /不一致/);
});

test('photo deletion uses the image SHA first, then the metadata SHA', async () => {
  const calls = [];
  const store = new GithubStore(config, async (url, options) => {
    calls.push({ url: String(url), method: options.method, body: JSON.parse(options.body) });
    return response({});
  });
  await store.removePhoto(photo({ imageSha: 'image-sha', _sha: 'metadata-sha', _path: 'couple-data/photos/photo-1.json' }));
  assert.deepEqual(calls.map(call => call.method), ['DELETE', 'DELETE']);
  assert.deepEqual(calls.map(call => call.body.sha), ['image-sha', 'metadata-sha']);
});

test('missing photo files allow metadata cleanup, but image conflicts retain metadata', async (t) => {
  for (const status of [404, 409]) await t.test(String(status), async () => {
    const calls = [];
    const store = new GithubStore(config, async (url, options) => {
      calls.push({ url: String(url), method: options.method });
      return response({}, calls.length === 1 ? status : 200);
    });
    const record = photo({ imageSha: 'old-image-sha', _sha: 'metadata-sha', _path: 'couple-data/photos/photo-1.json' });
    if (status === 404) assert.equal(await store.removePhoto(record), true);
    else await assert.rejects(store.removePhoto(record), { status });
    assert.equal(calls.length, status === 404 ? 2 : 1);
  });
});

test('cached nested mood history is isolated between loads', async () => {
  const mood = { role: 'me', key: 'calm', history: [{ key: 'calm', note: 'original', setAt: '2026-11-01T08:00:00Z' }] };
  const store = new GithubStore(config, async url => String(url).includes('/git/trees/')
    ? response({ tree: [{ type: 'blob', path: 'couple-data/moods/me.json', sha: 'unchanged' }] })
    : response({ content: encoded(mood) }));
  const first = await store.load(); first.moods.me.history[0].note = 'changed locally';
  assert.equal((await store.load()).moods.me.history[0].note, 'original');
});
