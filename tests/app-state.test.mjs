import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import * as dates from '../date-utils.mjs';

// Evaluate the real app functions, omitting only module import declarations and
// its final browser boot call. Rendering still runs against small DOM doubles.
const source = (await readFile(new URL('../app.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '')
  .replace(/\r?\nboot\(\);\s*$/, '\n');

const clone = (value) => JSON.parse(JSON.stringify(value));
const state = () => ({ anniversaries: [], whispers: [], moods: {}, habits: [], checkins: [], profiles: {
  me: { role: 'me', name: '阿汐', city: '', _sha: 'profile-me' },
  partner: { role: 'partner', name: '小林', city: '', _sha: 'profile-partner' }
}, weather: null });

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function element() {
  const classes = new Set();
  return {
    innerHTML: '', textContent: '', open: false,
    classList: {
      add: (...values) => values.forEach(value => classes.add(value)),
      remove: (...values) => values.forEach(value => classes.delete(value)),
      toggle(value, force) {
        const enabled = force === undefined ? !classes.has(value) : force;
        if (enabled) classes.add(value); else classes.delete(value);
        return enabled;
      }
    },
    querySelector: () => null,
    showModal() { this.open = true; },
    close() { this.open = false; },
    matches: () => false,
    focus() {}, setSelectionRange() {}
  };
}

function form(fields, kind = 'settings') {
  return { fields, dataset: { form: kind }, get: (key) => fields[key] ?? '', has: (key) => Object.hasOwn(fields, key) };
}

function connectionForm(overrides = {}) {
  return form({ owner: 'our-space', repo: 'private-data', branch: 'main', token: 'test-only-token', role: 'partner',
    'name-me': 'stale device name one', 'city-me': '', 'name-partner': 'stale device name two', 'city-partner': '', ...overrides });
}

function harness(Store = class {}) {
  const storage = new Map();
  const nodes = new Map(['#app', '#modal', '#modal-content', '#toast', '.sync-button'].map(selector => [selector, element()]));
  const listeners = new Map();
  const document = {
    activeElement: null, visibilityState: 'visible',
    querySelector: selector => nodes.get(selector) || null,
    addEventListener(name, listener) { listeners.set(name, listener); }
  };
  class FormDataDouble {
    constructor(value) { this.fields = value.fields; }
    get(key) { return this.fields[key] ?? ''; }
    has(key) { return Object.hasOwn(this.fields, key); }
  }
  const context = vm.createContext({
    ...dates, GithubStore: Store, document, window: { addEventListener() {} }, navigator: {},
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    FormData: FormDataDouble, crypto: { randomUUID }, URL, URLSearchParams, AbortSignal,
    fetch: async () => ({ ok: false }), confirm: () => true,
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, console
  });
  vm.runInContext(`${source}\n globalThis.__appTest = {
    get data() { return data; }, set data(value) { data = value; },
    get remote() { return remote; }, set remote(value) { remote = value; },
    ui, connectGithub, syncNow, submitForm, markRead, markVisibleUnread, archiveHabit, disconnect,
    renderShell, unreadCount, saveProfileSettings, whisperRow, moodFor
  };`, context, { filename: 'app.js' });
  return { app: context.__appTest, nodes, storage, listeners, document };
}

test('failed repository validation or load preserves the original connection and visible data', async (t) => {
  for (const failingStage of ['validate', 'load']) {
    await t.test(failingStage, async () => {
      class Candidate {
        constructor(config) { this.branch = config.branch; }
        async validate() { if (failingStage === 'validate') throw new Error('validation failed'); }
        async load() { throw new Error('load failed'); }
      }
      const { app, storage } = harness(Candidate);
      const original = state();
      original.whispers.push({ id: 'original', sender: 'partner', recipient: 'me', content: '保留原来的记录', createdAt: '2026-10-22T08:00:00Z', readAt: null });
      const previousRemote = { owner: 'previous', repo: 'existing' };
      app.data = original;
      app.remote = previousRemote;
      app.ui.role = 'me';
      await assert.rejects(app.connectGithub(connectionForm()), /failed/);
      assert.equal(app.data, original);
      assert.equal(app.remote, previousRemote);
      assert.equal(app.ui.role, 'me');
      assert.equal(storage.has('between-us-repo-v1'), false);
    });
  }
});

test('a second device connection adopts existing profiles without saving stale device values', async () => {
  const existing = state();
  existing.profiles.me.city = '杭州';
  existing.profiles.partner.city = '成都';
  const before = clone(existing.profiles);
  const writes = [];
  class Candidate {
    constructor(config) { this.branch = config.branch; }
    async validate() { return this; }
    async load() { return existing; }
    async save(folder, record) { writes.push({ folder, record }); throw new Error('existing profiles must not be written'); }
  }
  const { app, storage } = harness(Candidate);
  await app.submitForm(connectionForm(), 'connect');
  assert.ok(app.remote instanceof Candidate);
  assert.equal(app.ui.role, 'partner');
  assert.deepEqual(clone(app.data.profiles), before);
  assert.equal(writes.length, 0);
  assert.equal(storage.get('between-us-repo-v1').includes('test-only-token'), false);
});

test('successive mood changes pass the last saved SHA and keep the file path', async () => {
  const { app } = harness();
  app.data = state();
  app.data.moods.me = { role: 'me', key: 'busy', note: '以前的状态', _sha: 'initial-sha', _path: 'couple-data/moods/me.json' };
  const writes = [];
  app.remote = {
    async save(folder, record) {
      writes.push({ folder, record: clone(record) });
      return { ...record, _sha: `saved-sha-${writes.length}` };
    }
  };
  await app.submitForm(form({ key: 'miss', note: '想你' }, 'mood'));
  await app.submitForm(form({ key: 'calm', note: '现在平静了' }, 'mood'));
  assert.deepEqual(writes.map(write => write.record._sha), ['initial-sha', 'saved-sha-1']);
  assert.ok(writes.every(write => write.folder === 'moods' && write.record._path === 'couple-data/moods/me.json'));
  assert.equal(app.data.moods.me._sha, 'saved-sha-2');
  assert.equal(app.data.moods.me.note, '现在平静了');
});

test('a failed read acknowledgement leaves the record unread and the displayed state intact', async () => {
  const { app, nodes } = harness();
  app.data = state();
  app.data.whispers.push({ id: 'incoming', sender: 'partner', recipient: 'me', content: '不要丢失这条留言', createdAt: '2026-10-22T08:00:00Z', readAt: null, _sha: 'note-sha' });
  const original = clone(app.data.whispers);
  app.remote = { async save() { throw new Error('permission denied'); } };
  app.ui.view = 'whispers';
  app.renderShell();
  const displayed = nodes.get('#app').innerHTML;
  await app.markRead('incoming');
  assert.deepEqual(clone(app.data.whispers), original);
  assert.equal(app.unreadCount(), 1);
  assert.equal(nodes.get('#app').innerHTML, displayed);
  assert.match(nodes.get('#toast').textContent, /失败/);
});

test('a failed habit archive preserves its active state and original timestamp', async () => {
  const { app, nodes } = harness();
  app.data = state();
  app.data.habits.push({ id: 'reading', owner: 'me', name: '读书', active: true, updatedAt: '2026-10-01T00:00:00Z', _sha: 'habit-sha' });
  const original = clone(app.data.habits);
  app.remote = { async save() { throw new Error('version conflict'); } };
  app.renderShell();
  const displayed = nodes.get('#app').innerHTML;
  await app.archiveHabit('reading');
  assert.deepEqual(clone(app.data.habits), original);
  assert.equal(nodes.get('#app').innerHTML, displayed);
  assert.match(nodes.get('#toast').textContent, /失败/);
});

test('a stale sync result cannot restore private records after disconnect', async () => {
  const { app, nodes, storage } = harness();
  const pending = deferred();
  const privateData = state();
  privateData.whispers.push({ id: 'private', sender: 'partner', recipient: 'me', content: 'PRIVATE-MUST-NOT-RETURN', createdAt: '2026-10-22T08:00:00Z', readAt: null });
  app.data = privateData;
  app.remote = { load: () => pending.promise };
  const syncing = app.syncNow(true);
  assert.equal(app.ui.syncBusy, true);
  app.disconnect();
  pending.resolve(privateData);
  await syncing;
  assert.equal(app.remote, null);
  assert.equal(app.ui.syncBusy, false);
  assert.equal(JSON.stringify(app.data).includes('PRIVATE-MUST-NOT-RETURN'), false);
  assert.equal(nodes.get('#app').innerHTML.includes('PRIVATE-MUST-NOT-RETURN'), false);
  assert.equal(storage.get('between-us-demo-v1')?.includes('PRIVATE-MUST-NOT-RETURN') || false, false);
});

test('a stale save result cannot restore a private mood after disconnect', async () => {
  const { app } = harness();
  const pending = deferred();
  app.data = state();
  app.remote = { save: () => pending.promise };
  const saving = app.submitForm(form({ key: 'miss', note: 'PRIVATE-PENDING-MOOD' }, 'mood'));
  app.disconnect();
  pending.resolve({ role: 'me', key: 'miss', note: 'PRIVATE-PENDING-MOOD', _sha: 'late-result' });
  await saving;
  assert.equal(app.remote, null);
  assert.equal(JSON.stringify(app.data).includes('PRIVATE-PENDING-MOOD'), false);
});

test('an unread batch stops after disconnect instead of acknowledging a matching local demo message', async () => {
  const { app, storage } = harness();
  const pending = deferred();
  app.data = state();
  app.data.whispers = [
    { id: 'remote-first', sender: 'partner', recipient: 'me', content: 'first private message', createdAt: '2026-10-22T08:00:00Z', readAt: null, _sha: 'remote-first-sha' },
    // Imported/copied repositories may contain IDs also present in a device's
    // local data. A stale operation must not act on that unrelated new state.
    { id: 'demo-note-1', sender: 'partner', recipient: 'me', content: 'different private message', createdAt: '2026-10-22T08:01:00Z', readAt: null, _sha: 'remote-second-sha' }
  ];
  app.remote = { save: () => pending.promise };
  const batch = app.markVisibleUnread();
  app.disconnect();
  const localMessage = app.data.whispers.find(message => message.id === 'demo-note-1');
  assert.equal(localMessage.readAt, null);
  const localBefore = clone(app.data);
  pending.resolve({ id: 'remote-first', readAt: '2026-10-22T09:00:00Z', _sha: 'late-sha' });
  await batch;
  assert.deepEqual(clone(app.data), localBefore, 'a remote unread batch must not modify the disconnected local space');
  assert.equal(storage.has('between-us-demo-v1'), false, 'disconnect must not trigger an implicit local save');
});

test('background sync skips an unfinished composer draft and an active save', async () => {
  const { app } = harness();
  let loads = 0;
  app.remote = { async load() { loads++; return state(); } };
  app.ui.draft = '还没写完的话 <3';
  await app.syncNow(true);
  assert.equal(loads, 0);
  assert.equal(app.ui.draft, '还没写完的话 <3');
  app.ui.draft = '';
  app.ui.busy = true;
  await app.syncNow(true);
  assert.equal(loads, 0);
});

test('saving one selected profile preserves the partner profile', async () => {
  const { app } = harness();
  app.data = state();
  const partner = clone(app.data.profiles.partner);
  const writes = [];
  app.remote = { async save(folder, record) { writes.push({ folder, record }); return { ...record, _sha: 'updated-profile' }; } };
  await app.saveProfileSettings(connectionForm({ role: 'me', 'name-me': '新的昵称', 'name-partner': 'should not overwrite partner' }));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].record.role, 'me');
  assert.equal(app.data.profiles.me.name, '新的昵称');
  assert.deepEqual(clone(app.data.profiles.partner), partner);
});

test('outgoing whispers render read receipts while treating malicious message text as plain text', () => {
  const { app } = harness();
  app.data = state();
  const malicious = '<img src=x onerror="alert(1)"><script>stealToken()</script> & \'quoted\'';
  const message = { id: 'outgoing', sender: 'me', recipient: 'partner', content: malicious, createdAt: '2026-10-22T08:00:00Z', readAt: null };
  const unreadHtml = app.whisperRow(message);
  assert.match(unreadHtml, /<span class="read-status">对方未读<\/span>/);
  assert.ok(!unreadHtml.includes('<img src=x'));
  assert.ok(!unreadHtml.includes('<script>'));
  assert.ok(unreadHtml.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
  assert.ok(unreadHtml.includes('&lt;script&gt;stealToken()&lt;/script&gt;'));
  assert.ok(unreadHtml.includes('&amp; &#39;quoted&#39;'));

  const readHtml = app.whisperRow({ ...message, readAt: '2026-10-22T08:01:00Z' });
  assert.match(readHtml, /<span class="read-status">对方已读<\/span>/);
  assert.ok(!readHtml.includes('对方未读'));
});

test('an absent mood is displayed as not set instead of implying a known emotional state', () => {
  const { app } = harness();
  app.data = state();
  assert.equal(app.moodFor('me').label, '尚未设置');
  assert.equal(app.moodFor('partner').label, '尚未设置');
});
