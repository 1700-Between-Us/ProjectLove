import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dateKey, parseDay, daysBetween, nextAnniversary, streakCountFor } from '../date-utils.mjs';

test('dateKey uses the local calendar date and pads month and day', () => {
  assert.equal(dateKey(new Date(2026, 0, 2, 12, 0)), '2026-01-02');
});

test('parseDay accepts valid leap dates and rejects impossible or noncanonical dates', () => {
  assert.equal(parseDay('2024-02-29').toISOString(), '2024-02-29T00:00:00.000Z');
  for (const value of ['2025-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '2026-1-02', '', 'not-a-date']) {
    assert.throws(() => parseDay(value), /日期/, value);
  }
});

test('calendar-day counts include leap days and support zero and negative intervals', () => {
  assert.equal(daysBetween('2024-02-28', '2024-03-01'), 2);
  assert.equal(daysBetween('2025-02-28', '2025-03-01'), 1);
  assert.equal(daysBetween('2026-10-22', '2026-10-22'), 0);
  assert.equal(daysBetween('2024-03-01', '2024-02-28'), -2);
});

test('day counts and streaks remain correct through spring and fall DST transitions', () => {
  const moduleUrl = new URL('../date-utils.mjs', import.meta.url).href;
  const script = `import { daysBetween, streakCountFor } from ${JSON.stringify(moduleUrl)};
    const records = ['2026-03-07', '2026-03-08', '2026-03-09'].map(date => ({ habitId: 'walk', date }));
    console.log(JSON.stringify({ spring: daysBetween('2026-03-07', '2026-03-09'), fall: daysBetween('2026-10-31', '2026-11-02'), streak: streakCountFor(records, 'walk', '2026-03-09') }));`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, TZ: 'America/New_York' }, encoding: 'utf8'
  });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), { spring: 2, fall: 2, streak: 3 });
});

test('February 29 repeats on February 28 in a non-leap year and remains on February 29 in leap years', () => {
  const item = { date: '2020-02-29', repeatYearly: true };
  assert.deepEqual(nextAnniversary(item, '2025-02-27'), { date: '2025-02-28', days: 1 });
  assert.deepEqual(nextAnniversary(item, '2025-02-28'), { date: '2025-02-28', days: 0 });
  assert.deepEqual(nextAnniversary(item, '2025-03-01'), { date: '2026-02-28', days: 364 });
  assert.deepEqual(nextAnniversary(item, '2024-02-28'), { date: '2024-02-29', days: 1 });
  assert.deepEqual(nextAnniversary(item, '2023-03-01'), { date: '2024-02-29', days: 365 });
});

test('annual dates roll into the next year while one-time dates retain their actual date', () => {
  assert.deepEqual(nextAnniversary({ date: '2025-05-20', repeatYearly: true }, '2026-05-21'), { date: '2027-05-20', days: 364 });
  assert.deepEqual(nextAnniversary({ date: '2025-05-20', repeatYearly: false }, '2025-05-21'), { date: '2025-05-20', days: -1 });
});

test('streaks deduplicate dates and ignore other habits and deleted check-ins', () => {
  const records = [
    { habitId: 'read', date: '2026-10-22' },
    { habitId: 'read', date: '2026-10-22' },
    { habitId: 'read', date: '2026-10-21' },
    { habitId: 'read', date: '2026-10-20' },
    { habitId: 'read', date: '2026-10-19', deletedAt: '2026-10-19T20:00:00Z' },
    { habitId: 'walk', date: '2026-10-19' },
    { habitId: 'read', date: '2026-10-18' }
  ];
  assert.equal(streakCountFor(records, 'read', '2026-10-22'), 3);
  assert.equal(streakCountFor(records, 'missing', '2026-10-22'), 0);
});

test('a streak may end yesterday but a gap yesterday resets it', () => {
  const records = ['2026-10-21', '2026-10-20', '2026-10-19'].map(date => ({ habitId: 'read', date }));
  assert.equal(streakCountFor(records, 'read', '2026-10-22'), 3);
  assert.equal(streakCountFor(records, 'read', '2026-10-23'), 0);
});
