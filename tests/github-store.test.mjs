import test from 'node:test';
import assert from 'node:assert/strict';
import { GithubStore } from '../github-store.mjs';

const config = { owner: 'our-space', repo: 'private-data', branch: 'main', token: 'test-token-not-for-storage' };
const encode = (value) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
const reply = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', ...headers }
});
const treeEntry = (folder, name, sha) => ({ type: 'blob', path: `couple-data/${folder}/${name}.json`, sha });

function scriptedFetch(handler) {
  const calls = [];
  const fetcher = async (url, options = {}) => {
    const call = { url: String(url), options };
    calls.push(call);
    return handler(call, calls.length);
  };
  return { calls, fetcher };
}

test('binds a native-style fetch receiver before making the first repository request', async () => {
  let receiver;
  function nativeStyleFetch(url) {
    receiver = this;
    return reply({ private: true, default_branch: 'main', permissions: { push: true } });
  }
  await new GithubStore(config, nativeStyleFetch).validate();
  assert.equal(receiver, globalThis);
});

test('unchanged trees reuse blob content while still checking the latest tree', async () => {
  const mood = { role: 'me', key: 'miss', note: '今天也想你' };
  const entry = treeEntry('moods', 'me', 'mood-sha-1');
  const { calls, fetcher } = scriptedFetch(({ url }) => {
    if (url.endsWith('/git/trees/main?recursive=1')) return reply({ tree: [entry], truncated: false });
    if (url.endsWith('/git/blobs/mood-sha-1')) return reply({ content: encode(mood) });
    throw new Error(`Unexpected request: ${url}`);
  });
  const store = new GithubStore(config, fetcher);

  const first = await store.load();
  first.moods.me.note = 'a local edit must not modify the cached raw record';
  const second = await store.load();

  assert.equal(calls.filter(({ url }) => url.includes('/git/trees/')).length, 2);
  assert.equal(calls.filter(({ url }) => url.includes('/git/blobs/')).length, 1);
  assert.equal(second.moods.me.note, mood.note);
  assert.equal(second.moods.me._sha, 'mood-sha-1');
  assert.equal(second.moods.me._path, entry.path);
});

test('a changed blob is reloaded but unchanged blobs stay cached', async () => {
  const profile = { role: 'partner', name: '小林', city: '成都' };
  let treeReads = 0;
  const { calls, fetcher } = scriptedFetch(({ url }) => {
    if (url.includes('/git/trees/')) {
      treeReads++;
      return reply({ tree: [treeEntry('profiles', 'partner', 'profile-stable'), treeEntry('moods', 'me', treeReads === 1 ? 'mood-old' : 'mood-new')] });
    }
    if (url.endsWith('/git/blobs/profile-stable')) return reply({ content: encode(profile) });
    if (url.endsWith('/git/blobs/mood-old')) return reply({ content: encode({ role: 'me', key: 'busy' }) });
    if (url.endsWith('/git/blobs/mood-new')) return reply({ content: encode({ role: 'me', key: 'calm' }) });
    throw new Error(`Unexpected request: ${url}`);
  });
  const store = new GithubStore(config, fetcher);
  await store.load();
  const state = await store.load();

  assert.equal(state.moods.me.key, 'calm');
  assert.equal(calls.filter(({ url }) => url.endsWith('/git/blobs/profile-stable')).length, 1);
  assert.equal(calls.filter(({ url }) => url.includes('/git/blobs/')).length, 3);
});

test('Unicode survives save payload and remote blob decoding; credentials and metadata stay out of JSON', async () => {
  const record = {
    id: 'note-1', sender: 'me', recipient: 'partner', content: '想和你看晚霞 🌇\n明天见，café！',
    createdAt: '2026-10-22T08:00:00Z', _sha: 'previous-sha', _path: 'couple-data/whispers/note-1.json'
  };
  let encodedPayload;
  const { calls, fetcher } = scriptedFetch(({ options }) => {
    assert.equal(options.method, 'PUT');
    const body = JSON.parse(options.body);
    encodedPayload = body.content;
    assert.equal(body.sha, 'previous-sha');
    assert.equal(body.branch, 'main');
    const decoded = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
    assert.equal(decoded.content, record.content);
    assert.equal('_sha' in decoded, false);
    assert.equal('_path' in decoded, false);
    assert.equal(JSON.stringify(body).includes(config.token), false);
    return reply({ content: { sha: 'next-sha' } }, 200);
  });
  const store = new GithubStore(config, fetcher);
  const saved = await store.save('whispers', record);

  assert.notEqual(saved, record);
  assert.equal(saved._sha, 'next-sha');
  assert.equal(record._sha, 'previous-sha');
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${config.token}`);
  assert.equal(Object.hasOwn(store, 'token'), false);
  assert.equal(JSON.stringify(store).includes(config.token), false);

  // A fresh client must decode the wire format, rather than reuse save's in-memory cache.
  const second = new GithubStore(config, async (url) => String(url).includes('/git/trees/')
    ? reply({ tree: [treeEntry('whispers', 'note-1', 'next-sha')] })
    : reply({ content: encodedPayload.match(/.{1,12}/g).join('\n') }));
  const loaded = await second.load();
  assert.equal(loaded.whispers[0].content, record.content);
});

test('stale SHA save surfaces conflict without retrying or mutating the record', async () => {
  const record = { id: 'day-1', title: '初次见面', date: '2025-05-20', _sha: 'stale-sha' };
  const before = structuredClone(record);
  const { calls, fetcher } = scriptedFetch(({ options }) => {
    assert.equal(JSON.parse(options.body).sha, 'stale-sha');
    return reply({ message: 'is at a newer SHA' }, 409);
  });
  await assert.rejects(new GithubStore(config, fetcher).save('anniversaries', record), (error) => {
    assert.equal(error.status, 409);
    assert.match(error.message, /冲突/);
    return true;
  });
  assert.equal(calls.length, 1, 'conflicts must not trigger a blind overwrite retry');
  assert.deepEqual(record, before);
});

test('remove uses the loaded file SHA and does not retry a conflict', async () => {
  const record = { _path: 'couple-data/whispers/note-1.json', _sha: 'old-sha' };
  const { calls, fetcher } = scriptedFetch(({ url, options }) => {
    assert.ok(url.endsWith('/contents/couple-data/whispers/note-1.json'));
    assert.equal(options.method, 'DELETE');
    assert.equal(JSON.parse(options.body).sha, 'old-sha');
    return reply({}, 409);
  });
  await assert.rejects(new GithubStore(config, fetcher).remove(record), { status: 409 });
  assert.equal(calls.length, 1);
});

test('public or read-only repositories are rejected before loading private app data', async (t) => {
  for (const [name, repository, expected] of [
    ['public', { private: false, default_branch: 'main', permissions: { push: true } }, /Private/],
    ['read only', { private: true, default_branch: 'main', permissions: { push: false } }, /写入权限/]
  ]) {
    await t.test(name, async () => {
      const { calls, fetcher } = scriptedFetch(() => reply(repository));
      await assert.rejects(new GithubStore(config, fetcher).validate(), expected);
      assert.equal(calls.length, 1);
    });
  }
});

test('validation discovers a non-main default branch', async () => {
  const store = new GithubStore({ ...config, branch: '' }, async () => reply({ private: true, default_branch: 'shared', permissions: { push: true } }));
  assert.equal(await store.validate(), store);
  assert.equal(store.branch, 'shared');
});

test('an initialized repository with no app files produces an empty state', async () => {
  const store = new GithubStore(config, async () => reply({ tree: [{ type: 'blob', path: 'README.md', sha: 'readme' }], truncated: false }));
  assert.deepEqual(await store.load(), { anniversaries: [], whispers: [], habits: [], checkins: [], moods: {}, profiles: {} });
});

test('empty repository, malformed tree and truncated tree reject rather than return incomplete data', async (t) => {
  await t.test('uninitialized repository API error', async () => {
    await assert.rejects(new GithubStore(config, async () => reply({ message: 'Git Repository is empty.' }, 409)).load(), { status: 409 });
  });
  await t.test('malformed tree', async () => {
    await assert.rejects(new GithubStore(config, async () => reply({})).load(), Error);
  });
  await t.test('truncated tree', async () => {
    await assert.rejects(new GithubStore(config, async () => reply({ tree: [], truncated: true })).load(), /不完整/);
  });
});

test('invalid blob JSON or schema rejects with the affected file path', async (t) => {
  const entry = treeEntry('whispers', 'broken', 'broken-sha');
  for (const [name, content, expected] of [
    ['bad JSON', Buffer.from('{invalid', 'utf8').toString('base64'), /无法解析/],
    ['bad schema', encode({ id: 'broken', sender: 'stranger', content: 'hello' }), /格式不正确/]
  ]) {
    await t.test(name, async () => {
      const store = new GithubStore(config, async (url) => String(url).includes('/git/trees/')
        ? reply({ tree: [entry] }) : reply({ content }));
      await assert.rejects(store.load(), (error) => {
        assert.match(error.message, expected);
        assert.ok(error.message.includes(entry.path));
        return true;
      });
    });
  }
});

test('rate limiting backs off instead of issuing another immediate API request', async () => {
  const { calls, fetcher } = scriptedFetch(() => reply({}, 429, { 'retry-after': '60' }));
  const store = new GithubStore(config, fetcher);
  await assert.rejects(store.load(), { status: 429 });
  assert.ok(store.retryAt > Date.now());
  await assert.rejects(store.load(), /稍后/);
  assert.equal(calls.length, 1);
});
