// One shared record makes balances, redemptions and habit check-ins atomic.
export const today = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
export const nextDay = day => new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
export const empty = () => ({ id: 'shared', rules: [], diaries: [], habits: [], checkins: [], ledger: [], settled: {} });
export const balance = (state, owner) => state.ledger.filter(e => e.owner === owner).reduce((n, e) => n + e.amount, 0);
export const unlocked = (state, id, owner) => state.ledger.some(e => e.source === `diary:${id}` && e.owner === owner);
export function amount(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0 || n > 100000) throw new Error('积分须为 0 到 100000 的整数。');
  return n;
}
export function entry(state, { id, owner, actor, amount: requested, reason, source, at = new Date().toISOString() }) {
  if (state.ledger.some(e => e.id === id)) return;
  const change = Math.max(-balance(state, owner), requested);
  state.ledger.push({ id, owner, actor, amount: change, requested, reason, source, at });
}
export function settle(state, day = today()) {
  let changed = false;
  for (const habit of state.habits) {
    let cursor = state.settled[habit.id] || habit.startDate;
    while (cursor < day) {
      const policy = habit.policies.filter(p => p.day <= cursor).at(-1);
      if (policy?.active && policy.loss && !state.checkins.some(c => c.habitId === habit.id && c.date === cursor)) {
        entry(state, { id: `miss-${habit.id}-${cursor}`, owner: habit.owner, actor: 'system', amount: -policy.loss, reason: `${habit.name} · ${cursor} 未完成`, source: `habit:${habit.id}` });
      }
      cursor = nextDay(cursor); changed = true;
    }
    state.settled[habit.id] = cursor;
  }
  return changed;
}
export function saveHabit(state, value, day = today()) {
  settle(state, day);
  const existing = state.habits.find(h => h.id === value.id);
  if (existing && existing.owner !== value.owner) throw new Error('已接入积分的习惯不能转移归属，请另建一个习惯。');
  const policy = { day, active: value.active, gain: amount(value.gain), loss: amount(value.loss) };
  const policies = existing ? [...existing.policies] : [];
  // Already completed days retain their original credited amount in the check-in.
  if (policies.at(-1)?.day === day) policies.pop();
  policies.push(policy);
  const saved = { ...value, startDate: existing?.startDate || day, policies };
  state.habits = [saved, ...state.habits.filter(h => h.id !== value.id)];
}
export function checkin(state, id, actor, eventId, day = today()) {
  if (state.ledger.some(e => e.id === eventId)) return;
  settle(state, day);
  const habit = state.habits.find(h => h.id === id);
  if (!habit?.active || habit.owner !== actor) throw new Error('只能打卡自己的启用习惯。');
  const current = state.checkins.find(c => c.habitId === id && c.date === day);
  const policy = habit.policies.filter(p => p.day <= day).at(-1);
  if (current) {
    if (balance(state, actor) < current.credit) throw new Error('这次打卡的积分已使用，余额不足以撤回，请补足积分后再取消。');
    entry(state, { id: eventId, owner: actor, actor, amount: -current.credit, reason: `${habit.name} · 撤销打卡`, source: `habit:${id}` });
    state.checkins = state.checkins.filter(c => c !== current);
  } else {
    // Keep the day's first configured award even if rules change after a cancellation.
    const first = state.ledger.find(e => e.source === `habit:${id}:${day}:complete`);
    const credit = first ? first.requested : policy.gain;
    entry(state, { id: eventId, owner: actor, actor, amount: credit, reason: `${habit.name} · ${day} 完成`, source: `habit:${id}:${day}:complete` });
    state.checkins.push({ id: `${id}-${day}-${actor}`, habitId: id, owner: actor, date: day, credit });
  }
}
export function redeem(state, diaryId, owner, eventId) {
  const diary = state.diaries.find(d => d.id === diaryId);
  if (!diary || diary.owner === owner) throw new Error('请选择对方的日记。');
  if (unlocked(state, diaryId, owner)) return;
  if (balance(state, owner) < diary.price) throw new Error('积分不足，暂时无法兑换。');
  entry(state, { id: eventId, owner, actor: owner, amount: -diary.price, reason: `解锁 LoveDiary · ${diary.title}`, source: `diary:${diaryId}` });
}
export function valid(state) {
  const role = v => ['me', 'partner'].includes(v);
  const int = v => Number.isSafeInteger(v) && v >= 0 && v <= 100000;
  const day = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
  return state?.id === 'shared' && ['rules', 'diaries', 'habits', 'checkins', 'ledger'].every(k => Array.isArray(state[k])) && state.settled && typeof state.settled === 'object'
    && state.rules.every(r => typeof r.id === 'string' && typeof r.name === 'string' && typeof r.reason === 'string' && ['gain', 'loss', 'reward'].includes(r.kind) && int(r.value) && typeof r.active === 'boolean')
    && state.diaries.every(d => typeof d.id === 'string' && role(d.owner) && typeof d.title === 'string' && typeof d.content === 'string' && int(d.price))
    && state.habits.every(h => typeof h.id === 'string' && role(h.owner) && typeof h.name === 'string' && int(h.gain) && int(h.loss) && typeof h.active === 'boolean' && day(h.startDate) && Array.isArray(h.policies) && h.policies.length > 0 && h.policies.every(p => day(p.day) && int(p.gain) && int(p.loss) && typeof p.active === 'boolean'))
    && state.checkins.every(c => typeof c.habitId === 'string' && role(c.owner) && day(c.date) && int(c.credit))
    && state.ledger.every(e => typeof e.id === 'string' && role(e.owner) && (role(e.actor) || e.actor === 'system') && Number.isSafeInteger(e.amount) && Number.isSafeInteger(e.requested) && typeof e.reason === 'string' && typeof e.source === 'string' && Number.isFinite(Date.parse(e.at)))
    && new Set(state.ledger.map(e => e.id)).size === state.ledger.length
    && Object.values(state.settled).every(day) && ['me', 'partner'].every(r => balance(state, r) >= 0);
}
