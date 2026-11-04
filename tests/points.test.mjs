import test from 'node:test';
import assert from 'node:assert/strict';
import * as p from '../points.mjs';
import { GithubStore } from '../github-store.mjs';
const fund = (s, value = 100) => p.entry(s, { id: 'seed', owner: 'me', actor: 'partner', amount: value, reason: '测试', source: 'rule:test' });
const habit = { id: 'walk', owner: 'me', name: '散步', active: true, gain: 5, loss: 3 };

test('habit check-in, cancellation and retry keep the ledger and completion atomic', () => {
  const s = p.empty();
  p.saveHabit(s, habit, '2026-11-01');
  p.checkin(s, habit.id, 'me', 'one', '2026-11-01');
  p.checkin(s, habit.id, 'me', 'one', '2026-11-01');
  assert.equal(p.balance(s, 'me'), 5); assert.equal(s.checkins.length, 1);
  p.checkin(s, habit.id, 'me', 'two', '2026-11-01');
  assert.equal(p.balance(s, 'me'), 0); assert.equal(s.checkins.length, 0);
  p.saveHabit(s, { ...habit, gain: 99 }, '2026-11-01');
  p.checkin(s, habit.id, 'me', 'three', '2026-11-01');
  assert.equal(p.balance(s, 'me'), 5);
  assert.ok(p.valid(s));
});
test('overdue penalties settle once, honor disabled periods, and retain past rates', () => {
  const s = p.empty(); fund(s);
  p.saveHabit(s, habit, '2026-11-01');
  p.checkin(s, habit.id, 'me', 'done', '2026-11-01');
  p.saveHabit(s, { ...habit, active: false }, '2026-11-03');
  assert.equal(p.balance(s, 'me'), 102); // Nov 2 penalty only
  p.saveHabit(s, { ...habit, loss: 8 }, '2026-11-05');
  p.settle(s, '2026-11-07');
  assert.equal(p.balance(s, 'me'), 86);
  const length = s.ledger.length; p.settle(s, '2026-11-07');
  assert.equal(s.ledger.length, length);
  assert.ok(p.valid(s));
});
test('deductions floor at zero and never become later debt', () => {
  const s = p.empty(); fund(s, 2);
  p.entry(s, { id:'deduct', owner:'me', actor:'me', amount:-10, reason:'test', source:'rule:test' });
  assert.equal(p.balance(s, 'me'), 0); assert.equal(s.ledger.at(-1).amount, -2);
});
test('diary redemption charges once and prevents spending insufficient funds', () => {
  const s = p.empty();
  s.diaries.push({ id:'letter', owner:'partner', title:'想你', content:'正文', price:20 });
  assert.throws(() => p.redeem(s, 'letter', 'me', 'fail'), /不足/);
  assert.equal(s.ledger.length, 0);
  fund(s, 20); p.redeem(s, 'letter', 'me', 'buy');
  p.redeem(s, 'letter', 'me', 'retry');
  assert.equal(p.balance(s, 'me'), 0); assert.ok(p.unlocked(s, 'letter', 'me'));
  assert.equal(s.ledger.length, 2);
  assert.ok(p.valid(s));
});
test('spent habit credit cannot be recycled by cancelling and checking in again', () => {
  const s = p.empty(); p.saveHabit(s, habit, '2026-11-01');
  p.checkin(s, habit.id, 'me', 'done', '2026-11-01');
  s.diaries.push({ id:'letter', owner:'partner', title:'想你', content:'正文', price:5 });
  p.redeem(s, 'letter', 'me', 'buy');
  assert.throws(() => p.checkin(s, habit.id, 'me', 'undo', '2026-11-01'), /不足/);
  assert.equal(s.checkins.length, 1); assert.equal(p.balance(s, 'me'), 0);
});
test('dates use Beijing midnight regardless of device time zone', () => {
  assert.equal(p.today(new Date('2026-11-04T15:59:59Z')), '2026-11-04');
  assert.equal(p.today(new Date('2026-11-04T16:00:00Z')), '2026-11-05');
});
test('GitHub stores the whole points transaction with a SHA and rejects stale saves', async () => {
  const s = p.empty(); fund(s); let latest = null, version = 0;
  const store = new GithubStore({owner:'test',repo:'data',branch:'main',token:'mock'}, async (url, options) => {
    if (options.method === 'PUT') {
      const body = JSON.parse(options.body);
      if (version && body.sha !== String(version)) return new Response('{}',{status:409});
      latest = JSON.parse(Buffer.from(body.content, 'base64').toString()); version++;
      return new Response(JSON.stringify({content:{sha:String(version)}}));
    }
    if (url.includes('/git/trees/')) return new Response(JSON.stringify({tree:[{type:'blob',path:'couple-data/points/shared.json',sha:String(version)}]}));
    return new Response(JSON.stringify({content:Buffer.from(JSON.stringify(latest)).toString('base64')}));
  });
  const saved = await store.save('points', s);
  assert.equal(saved._sha, '1');
  assert.equal((await store.load()).points[0].ledger.length, 1);
  await assert.rejects(store.save('points', s), /冲突/);
  assert.equal(version, 1);
});
