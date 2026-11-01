import test from 'node:test';
import assert from 'node:assert/strict';
import { recentMoods, MOOD_WINDOW_MS, distanceKm, validCoordinates, anniversaryText, photoPath, PHOTO_MAX_BYTES } from '../v2-utils.mjs';

test('48-hour history includes the boundary but excludes older, invalid and future states', () => {
  const now = Date.parse('2026-11-01T12:00:00Z');
  const entry = (key, offset) => ({ key, note: key, setAt: new Date(now + offset).toISOString() });
  const mood = { history: [entry('boundary', -MOOD_WINDOW_MS), entry('old', -MOOD_WINDOW_MS - 1), entry('now', 0), entry('future', 1), { key: 'invalid', setAt: 'bad date' }, null] };
  const before = structuredClone(mood);
  assert.deepEqual(recentMoods(mood, now).map(item => item.key), ['now', 'boundary']);
  assert.deepEqual(mood, before, 'rendering must not mutate source history');
});

test('legacy current moods are included once without requiring a history array', () => {
  const now = Date.parse('2026-11-01T12:00:00Z');
  const legacy = { key: 'calm', note: '平静', updatedAt: new Date(now).toISOString() };
  assert.deepEqual(recentMoods(legacy, now), [{ key: 'calm', note: '平静', setAt: legacy.updatedAt }]);
  const withHistory = { ...legacy, history: recentMoods(legacy, now) };
  assert.equal(recentMoods(withHistory, now).length, 1);
  assert.deepEqual(recentMoods(undefined, now), []);
});

test('city distance handles same point, quarter-earth, antipodes and the date line', () => {
  const at = (latitude, longitude) => ({ latitude, longitude });
  assert.equal(distanceKm(at(30, 120), at(30, 120)), 0);
  assert.ok(Math.abs(distanceKm(at(0, 0), at(0, 90)) - Math.PI * 6371.0088 / 2) < 0.001);
  assert.ok(Math.abs(distanceKm(at(0, 0), at(0, 180)) - Math.PI * 6371.0088) < 0.001);
  assert.ok(distanceKm(at(0, 179), at(0, -179)) < 223);
  for (const invalid of [null, {}, at(NaN, 0), at(91, 0), at(0, 181), at('30', 120)]) {
    assert.equal(validCoordinates(invalid), false);
    assert.equal(distanceKm(invalid, at(0, 0)), null);
  }
});

test('anniversaries use the requested already wording and retain future countdowns', () => {
  assert.equal(anniversaryText(-123), '已经 123 天');
  assert.equal(anniversaryText(0), '就是今天');
  assert.equal(anniversaryText(12), '还有 12 天');
});

test('photo paths accept only safe ids and supported raster formats', () => {
  assert.equal(photoPath('photo-1', 'image/webp'), 'couple-data/images/photo-1.webp');
  assert.equal(photoPath('photo_2', 'image/jpeg'), 'couple-data/images/photo_2.jpg');
  for (const id of ['../secret', 'x/y', 'x.json', 'a?token=x', '']) assert.throws(() => photoPath(id, 'image/png'));
  assert.throws(() => photoPath('photo-1', 'image/svg+xml'));
  assert.ok(PHOTO_MAX_BYTES < 1000000);
});
