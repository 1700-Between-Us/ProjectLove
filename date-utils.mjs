export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new Error('日期格式应为 YYYY-MM-DD');
  const [year, month, day] = value.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day));
  if (result.getUTCFullYear() !== year || result.getUTCMonth() !== month - 1 || result.getUTCDate() !== day) throw new Error('日期无效');
  return result;
}

export function daysBetween(start, end) {
  return Math.round((parseDay(end) - parseDay(start)) / 86400000);
}

export function nextAnniversary(item, today = dateKey()) {
  parseDay(item.date);
  return { date: item.date, days: daysBetween(today, item.date) };
}

export function streakCountFor(records, habitId, today = dateKey()) {
  const days = new Set(records.filter((r) => r.habitId === habitId && !r.deletedAt).map((r) => r.date));
  let cursor = parseDay(today);
  const key = () => cursor.toISOString().slice(0, 10);
  if (!days.has(key())) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let count = 0;
  while (days.has(key())) { count++; cursor.setUTCDate(cursor.getUTCDate() - 1); }
  return count;
}
