import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import * as dates from '../date-utils.mjs';
import * as v2 from '../v2-utils.mjs';

// Evaluate the real app functions, omitting only module import declarations and
// its final browser boot call. Rendering still runs against small DOM doubles.
const source = (await readFile(new URL('../app.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '')
  .replace(/\r?\nboot\(\);\s*$/, '\n');

const clone = (value) => JSON.parse(JSON.stringify(value));
const state = () => ({ anniversaries: [], whispers: [], moods: {}, habits: [], checkins: [], profiles: {
  me: { role: 'me', name: '阿汐', city: '', _sha: 'profile-me' },
  partner: { role: 'partner', name: '小林', city: '', _sha: 'profile-partner' }
}, places: [], treeholes: [], photos: [], weather: null });

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
  return { fields, dataset: { form: kind }, reset() {}, get: (key) => fields[key] ?? '', has: (key) => Object.hasOwn(fields, key) };
}

function connectionForm(overrides = {}) {
  return form({ owner: 'our-space', repo: 'private-data', branch: 'main', token: 'test-only-token', role: 'partner',
    'name-me': 'stale device name one', 'city-me': '', 'name-partner': 'stale device name two', 'city-partner': '', ...overrides });
}

function harness(Store = class {}, overrides = {}, initialStorage = []) {
  const storage = new Map(initialStorage);
  const nodes = new Map(['#app', '#modal', '#modal-content', '#toast', '.sync-button'].map(selector => [selector, element()]));
  const listeners = new Map();
  const document = {
    activeElement: null, visibilityState: 'visible',
    querySelector: selector => nodes.get(selector) || null,
    querySelectorAll: () => [], createElement: () => element(),
    addEventListener(name, listener) { listeners.set(name, listener); }
  };
  class FormDataDouble {
    constructor(value) { this.fields = value.fields; }
    get(key) { return this.fields[key] ?? ''; }
    has(key) { return Object.hasOwn(this.fields, key); }
  }
  const context = vm.createContext({
    ...dates, ...v2, mountCityMap() {}, unmountCityMap() {}, compressPhoto: async () => ({ base64: 'AQID', mime: 'image/webp', size: 3, width: 1, height: 1 }), GithubStore: Store, document, window: { addEventListener() {} }, navigator: {},
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    FormData: FormDataDouble, crypto: { randomUUID }, URL, URLSearchParams, AbortSignal, Blob,
    fetch: async () => ({ ok: false }), confirm: () => true,
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, console, ...overrides
  });
  vm.runInContext(`${source}\n globalThis.__appTest = {
    get data() { return data; }, set data(value) { data = value; },
    get remote() { return remote; }, set remote(value) { remote = value; },
    ui, connectGithub, syncNow, submitForm, markRead, markVisibleUnread, archiveHabit, disconnect,
    renderShell, unreadCount, saveProfileSettings, whisperRow, moodFor, autoConnect, uploadPhoto, loadVisiblePhotos,
    answerTreehole, showTreeholePrompt, treeholeStatus, refreshWeather, renderTreeholesPage, showSettings,
    photoUrls, photoLoads, resetDemo, handleAction, showAnniversaryForm,
    get weather() { return weatherCache; }
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

test('remembered authorization restores a fresh page and preserves the device role', async () => {
  const configs = [];
  class Store {
    constructor(config) { Object.assign(this, config); configs.push(config); }
    async validate() {}
    async load() { return state(); }
  }
  const first = harness(Store);
  await first.app.connectGithub(connectionForm());
  const remembered = JSON.parse(first.storage.get('between-us-token-v2'));
  assert.deepEqual(remembered, { owner: 'our-space', repo: 'private-data', branch: 'main', token: 'test-only-token' });
  const reopened = harness(Store, {}, [...first.storage]);
  await reopened.app.autoConnect();
  assert.ok(reopened.app.remote instanceof Store);
  assert.equal(reopened.app.ui.role, 'partner');
  assert.equal(configs.length, 2);
  assert.equal(configs[1].token, remembered.token);
  assert.equal(reopened.app.ui.connectionStatus, '');
  assert.equal(reopened.nodes.get('#app').innerHTML.includes(remembered.token), false);
});

test('a remembered token is never reused for a different owner, repository, or branch', async () => {
  let constructions = 0;
  const saved = JSON.stringify({ owner: 'our-space', repo: 'private-data', branch: 'main', token: 'stored-test-token' });
  const { app } = harness(class { constructor() { constructions++; } }, {}, [['between-us-token-v2', saved]]);
  for (const fields of [{ owner: 'someone-else' }, { repo: 'other-data' }, { branch: 'other-branch' }]) {
    await assert.rejects(app.connectGithub(connectionForm({ ...fields, token: '' })), /Token/);
  }
  assert.equal(constructions, 0);
});

test('auto-connect clears invalid authorization but retains it for temporary failures', async (t) => {
  for (const status of [401, 403, 429, undefined]) await t.test(String(status), async () => {
    const saved = JSON.stringify({ owner: 'our-space', repo: 'private-data', branch: 'main', token: 'stored-test-token' });
    class Store { async validate() { throw Object.assign(new Error('mock connection failure'), { status }); } }
    const { app, storage, nodes } = harness(Store, {}, [['between-us-token-v2', saved]]);
    await app.autoConnect();
    assert.equal(app.remote, null);
    assert.equal(storage.has('between-us-token-v2'), status !== 401);
    assert.match(app.ui.connectionStatus, /自动连接失败/);
    assert.match(nodes.get('#toast').textContent, /重新连接/);
  });
});

test('disconnect cancels an in-flight automatic connection and removes remembered authorization', async () => {
  const pending = deferred();
  class Store { async validate() {} load() { return pending.promise; } }
  const saved = JSON.stringify({ owner: 'our-space', repo: 'private-data', branch: 'main', token: 'stored-test-token' });
  const { app, storage } = harness(Store, {}, [['between-us-token-v2', saved]]);
  const connecting = app.autoConnect();
  await Promise.resolve();
  app.disconnect();
  const privateData = state();
  privateData.treeholes.push({ content: 'PRIVATE-LATE-AUTOCONNECT' });
  pending.resolve(privateData);
  await connecting;
  assert.equal(app.remote, null);
  assert.equal(storage.has('between-us-token-v2'), false);
  assert.equal(JSON.stringify(app.data).includes('PRIVATE-LATE-AUTOCONNECT'), false);
});

const incomingTreehole = () => ({ id: 'gentle-note', owner: 'partner', recipient: 'me', content: 'PRIVATE-TREEHOLE <script>unsafe()</script>', createdAt: new Date().toISOString(), status: 'pending', readAt: null, _sha: 'treehole-original' });

test('treehole content stays hidden until willing; needs-time sends the exact requested receipt', async () => {
  const { app, nodes } = harness();
  app.data = state();
  app.data.treeholes.push(incomingTreehole());
  const writes = [];
  app.remote = { async save(folder, record) { writes.push({ folder, record }); return { ...record, _sha: 'treehole-saved' }; } };
  assert.equal(app.renderTreeholesPage().includes('PRIVATE-TREEHOLE'), false);
  app.showTreeholePrompt('gentle-note');
  assert.match(nodes.get('#modal-content').innerHTML, /如果你心情好的话愿意哄哄我嘛？/);
  assert.equal(nodes.get('#modal-content').innerHTML.includes('PRIVATE-TREEHOLE'), false);
  await app.answerTreehole('gentle-note', false);
  assert.equal(writes[0].folder, 'treeholes');
  assert.equal(app.data.treeholes[0].status, 'needs-time');
  assert.equal(app.data.treeholes[0].readAt, null);
  assert.equal(nodes.get('#modal').open, false);
  assert.equal(app.renderTreeholesPage().includes('PRIVATE-TREEHOLE'), false);
  app.ui.role = 'partner';
  assert.equal(app.treeholeStatus(app.data.treeholes[0]), '你的小宝已经知道你需要哄啦，再给他一点时间好不好');
  app.ui.role = 'me';
  await app.answerTreehole('gentle-note', true);
  assert.equal(writes[1].record._sha, 'treehole-saved');
  assert.ok(Number.isFinite(Date.parse(app.data.treeholes[0].readAt)));
  assert.equal(nodes.get('#modal').open, true);
  assert.match(nodes.get('#modal-content').innerHTML, /PRIVATE-TREEHOLE &lt;script&gt;/);
  assert.equal(nodes.get('#modal-content').innerHTML.includes('<script>'), false);
  app.ui.role = 'partner';
  assert.equal(app.treeholeStatus(app.data.treeholes[0]), '对方已读');
});

test('treehole failed acknowledgement preserves pending state and never reveals the content', async () => {
  const { app, nodes } = harness();
  app.data = state(); app.data.treeholes.push(incomingTreehole());
  app.remote = { async save() { throw new Error('conflict'); } };
  app.showTreeholePrompt('gentle-note');
  await assert.rejects(app.answerTreehole('gentle-note', true), /conflict/);
  assert.equal(app.data.treeholes[0].status, 'pending');
  assert.equal(app.data.treeholes[0].readAt, null);
  assert.equal(nodes.get('#modal-content').innerHTML.includes('PRIVATE-TREEHOLE'), false);
});

test('treehole replies require acknowledgement and render as plain text', async () => {
  const { app } = harness();
  app.data = state(); app.data.treeholes.push(incomingTreehole());
  const replyForm = form({ reply: '<img src=x onerror=unsafe()>我在' }, 'treehole-reply');
  replyForm.dataset.id = 'gentle-note';
  await app.submitForm(replyForm);
  assert.equal(app.data.treeholes[0].reply, undefined);
  await app.answerTreehole('gentle-note', true);
  await app.submitForm(replyForm);
  assert.equal(app.data.treeholes[0].status, 'replied');
  app.ui.role = 'partner';
  assert.ok(app.renderTreeholesPage().includes('&lt;img src=x onerror=unsafe()&gt;我在'));
  assert.equal(app.renderTreeholesPage().includes('<img src=x'), false);
});

test('new mood history retains only the previous 48 hours and preserves the last SHA', async () => {
  const { app } = harness();
  app.data = state();
  const now = Date.now();
  app.data.moods.me = { role: 'me', key: 'calm', note: 'recent', updatedAt: new Date(now - 3600000).toISOString(), _sha: 'mood-v1', history: [{ key: 'low', note: 'expired', setAt: new Date(now - 49 * 3600000).toISOString() }] };
  app.remote = { async save(folder, record) { assert.equal(record._sha, 'mood-v1'); return { ...record, _sha: 'mood-v2' }; } };
  await app.submitForm(form({ key: 'miss', note: 'new' }, 'mood'));
  assert.deepEqual(clone(app.data.moods.me.history).map(item => item.note), ['new', 'recent']);
  assert.equal(app.data.moods.me._sha, 'mood-v2');
});

test('anniversary editor omits annual repetition and removes the legacy flag when saved', async () => {
  const { app, nodes } = harness();
  app.data = state();
  app.data.anniversaries.push({ id: 'old', title: '旧纪念日', date: '2024-02-29', repeatYearly: true });
  app.showAnniversaryForm('old');
  assert.doesNotMatch(nodes.get('#modal-content').innerHTML, /repeatYearly|每年重复/);
  const edit = form({ title: '旧纪念日', date: '2024-02-29' }, 'anniversary'); edit.dataset.id = 'old';
  await app.submitForm(edit);
  assert.equal(Object.hasOwn(app.data.anniversaries[0], 'repeatYearly'), false);
});

test('photo upload cleans up definitive metadata rejection but retains uncertain network results', async (t) => {
  for (const status of [409, undefined]) await t.test(String(status), async () => {
    const { app } = harness(); app.data = state();
    let removed = 0;
    app.remote = {
      async savePhoto(record) { return { ...record, imageSha: 'photo-blob-sha' }; },
      async save() { throw Object.assign(new Error('metadata failed'), { status }); },
      async removePhotoFile(record) { assert.equal(record.imageSha, 'photo-blob-sha'); removed++; }
    };
    await assert.rejects(app.uploadPhoto(form({ image: {}, caption: 'test photo' })), status ? /metadata failed/ : /上传结果尚不确定/);
    assert.equal(removed, status ? 1 : 0);
    assert.equal(app.data.photos.length, 0);
  });
});

test('photo upload is blocked while disconnected or when the current album has 50 photos', async () => {
  const { app } = harness(); app.data = state();
  await assert.rejects(app.uploadPhoto(form({})), /私有仓库/);
  app.remote = {}; app.data.photos = Array.from({ length: 50 }, () => ({}));
  await assert.rejects(app.uploadPhoto(form({})), /50/);
});

test('a pending photo upload cannot restore a photo into a disconnected page', async () => {
  const { app } = harness(); app.data = state();
  const pending = deferred(), started = deferred();
  app.remote = { async savePhoto(record) { return { ...record, imageSha: 'image-sha' }; }, save() { started.resolve(); return pending.promise; } };
  const uploading = app.uploadPhoto(form({ image: {}, caption: 'PRIVATE-LATE-PHOTO' }));
  await started.promise;
  app.disconnect(); pending.resolve({ id: 'late', caption: 'PRIVATE-LATE-PHOTO' });
  await uploading;
  assert.equal(app.remote, null);
  assert.equal(JSON.stringify(app.data).includes('PRIVATE-LATE-PHOTO'), false);
});

test('weather uses confirmed coordinates and an older request cannot overwrite a switched role', async () => {
  const pending = deferred(); let calls = 0;
  const response = temperature => ({ ok: true, async json() { return { current: { weather_code: 0, temperature_2m: temperature, apparent_temperature: temperature }, daily: { temperature_2m_max: [temperature], temperature_2m_min: [temperature] } }; } });
  const { app } = harness(undefined, { fetch: async url => { calls++; assert.ok(String(url).includes('latitude=')); return calls === 1 ? pending.promise : response(10); } });
  app.data = state();
  app.data.profiles.me.city = '杭州'; app.data.profiles.me.location = { latitude: 30, longitude: 120 };
  app.data.profiles.partner.city = '成都'; app.data.profiles.partner.location = { latitude: 30, longitude: 104 };
  const first = app.refreshWeather();
  app.ui.role = 'partner';
  await app.refreshWeather();
  pending.resolve(response(99)); await first;
  assert.equal(app.weather.requestedCity, '杭州');
  assert.equal(app.weather.temperature, 10);
  delete app.data.profiles.me.location;
  await app.refreshWeather();
  assert.equal(calls, 2, 'unconfirmed cities must not silently use the first geocoder result');
  assert.equal(app.weather, null);
  assert.match(app.ui.weatherError, /确认/);
});

test('unavailable browser storage does not break settings or local reset', () => {
  const deny = () => { throw new Error('storage denied'); };
  const { app, nodes } = harness(undefined, { localStorage: { getItem: deny, setItem: deny, removeItem: deny } });
  assert.doesNotThrow(() => app.showSettings());
  assert.doesNotThrow(() => app.resetDemo());
  assert.equal(app.remote, null);
  assert.match(nodes.get('#toast').textContent, /无法清除|无法持久/);
});

test('changing the device role in settings discards the old role composer draft', async () => {
  const { app } = harness(); app.data = state();
  app.ui.draft = 'private unsent draft';
  await app.saveProfileSettings(connectionForm({ role: 'partner' }));
  assert.equal(app.ui.draft, '');
  assert.equal(app.ui.role, 'partner');
});

test('explicit navigation resets scroll without moving the page on background renders', async () => {
  const scrolls = [];
  const { app, nodes } = harness(undefined, { window: { addEventListener() {}, scrollTo(options) { scrolls.push(clone(options)); } } });
  app.data = state();
  await app.handleAction({ dataset: { action: 'navigate', view: 'map' } });
  assert.equal(app.ui.view, 'map');
  assert.match(nodes.get('#app').innerHTML, /我们的地图/);
  assert.deepEqual(scrolls, [{ top: 0, left: 0, behavior: 'instant' }]);
  app.renderShell();
  assert.equal(scrolls.length, 1);
});
