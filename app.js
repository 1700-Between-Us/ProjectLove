import { GithubStore } from './github-store.mjs';
import { dateKey, daysBetween, nextAnniversary, streakCountFor, parseDay } from './date-utils.mjs';

const DATA_KEY = "between-us-demo-v1";
const ROLE_KEY = "between-us-role-v1";
const REPO_KEY = "between-us-repo-v1";
const app = document.querySelector("#app");
const modal = document.querySelector("#modal");
const modalContent = document.querySelector("#modal-content");
const toast = document.querySelector("#toast");

const moodOptions = [
  { key: "sunny", icon: "☀", label: "晴朗", color: "sun" },
  { key: "calm", icon: "◌", label: "平静", color: "mint" },
  { key: "miss", icon: "♡", label: "想念", color: "rose" },
  { key: "tired", icon: "☁", label: "疲惫", color: "blue" },
  { key: "low", icon: "◒", label: "低落", color: "lavender" },
  { key: "busy", icon: "↗", label: "忙碌", color: "amber" },
  { key: "anxious", icon: "⌁", label: "有点焦虑", color: "coral" },
  { key: "angry", icon: "✳", label: "生气", color: "red" }
];

const weatherText = {
  0: "晴朗", 1: "大致晴朗", 2: "局部多云", 3: "阴天", 45: "雾", 48: "冻雾",
  51: "毛毛雨", 53: "小雨", 55: "中雨", 56: "冻毛毛雨", 57: "冻雨",
  61: "小雨", 63: "中雨", 65: "大雨", 66: "冻雨", 67: "冻雨",
  71: "小雪", 73: "中雪", 75: "大雪", 77: "雪粒", 80: "阵雨", 81: "阵雨",
  82: "强阵雨", 85: "阵雪", 86: "强阵雪", 95: "雷雨", 96: "雷雨伴冰雹", 99: "强雷雨伴冰雹"
};

const weatherIcon = (code) => {
  if (code === 0) return "☀";
  if ([1, 2].includes(code)) return "◒";
  if ([3, 45, 48].includes(code)) return "☁";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄";
  if (code >= 95) return "ϟ";
  if (code >= 51) return "☂";
  return "◒";
};

const makeId = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const isoNow = () => new Date().toISOString();
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const icon = (name, size = 18) => {
  const paths = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    message: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    spark: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/>',
    cloud: '<path d="M20 16.2A4.5 4.5 0 0 0 18 7.5a6 6 0 0 0-11.7 1A4 4 0 0 0 6 16.5h13"/>',
    settings: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m19.4 15 .1.1 1.3 1-1.3 2.3-1.6-.5a8 8 0 0 1-1.5.9l-.3 1.7h-2.7l-.4-1.7a8 8 0 0 1-1.6-.9l-1.6.5-1.3-2.3 1.3-1a7 7 0 0 1 0-1.9l-1.3-1 1.3-2.3 1.6.5a8 8 0 0 1 1.6-.9l.4-1.7h2.7l.3 1.7a8 8 0 0 1 1.5.9l1.6-.5 1.3 2.3-1.3 1a7 7 0 0 1-.1 1.9Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 6.8L20 12M4 12l2 5.2A7 7 0 0 0 18.4 15"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    close: '<path d="m18 6-12 12M6 6l12 12"/>',
    pin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/>',
    edit: '<path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 14h12l1-14M9 7V4h6v3"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.spark}</svg>`;
};

function emptyState() {
  return { anniversaries: [], whispers: [], moods: {}, habits: [], checkins: [], profiles: {}, weather: null };
}

function demoState() {
  const today = new Date();
  const ago = (days) => { const d = new Date(today); d.setDate(d.getDate() - days); return dateKey(d); };
  return {
    anniversaries: [
      { id: "demo-anniversary", title: "在一起的日子", date: "2025-05-20", repeatYearly: true, updatedAt: isoNow() },
      { id: "demo-first-trip", title: "第一次一起旅行", date: "2025-11-08", repeatYearly: true, updatedAt: isoNow() }
    ],
    whispers: [
      { id: "demo-note-1", sender: "partner", recipient: "me", content: "路过面包店的时候，想起你喜欢的那款。下次见面带给你。", createdAt: new Date(Date.now() - 1000 * 60 * 82).toISOString(), readAt: null },
      { id: "demo-note-2", sender: "me", recipient: "partner", content: "今天下班的路上看到很漂亮的晚霞，想和你一起看。", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(), readAt: new Date(Date.now() - 1000 * 60 * 60 * 7).toISOString() }
    ],
    moods: {
      me: { key: "busy", note: "今天事情有点多，晚一点再好好聊。", updatedAt: isoNow() },
      partner: { key: "miss", note: "有一點想你。", updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString() }
    },
    habits: [
      { id: "demo-habit-1", name: "睡前互道晚安", owner: "me", active: true, createdAt: isoNow(), updatedAt: isoNow() },
      { id: "demo-habit-2", name: "读书 15 分钟", owner: "partner", active: true, createdAt: isoNow(), updatedAt: isoNow() },
      { id: "demo-habit-3", name: "午休后散步", owner: "me", active: true, createdAt: isoNow(), updatedAt: isoNow() }
    ],
    checkins: [
      { id: "demo-check-1", habitId: "demo-habit-1", date: dateKey(today), owner: "me", createdAt: isoNow() },
      { id: "demo-check-2", habitId: "demo-habit-1", date: ago(1), owner: "me", createdAt: isoNow() },
      { id: "demo-check-3", habitId: "demo-habit-1", date: ago(2), owner: "me", createdAt: isoNow() },
      { id: "demo-check-4", habitId: "demo-habit-2", date: ago(1), owner: "partner", createdAt: isoNow() },
      { id: "demo-check-5", habitId: "demo-habit-2", date: ago(3), owner: "partner", createdAt: isoNow() },
      { id: "demo-check-6", habitId: "demo-habit-3", date: ago(2), owner: "me", createdAt: isoNow() }
    ],
    profiles: {
      me: { name: "阿汐", city: "杭州", timezone: "Asia/Shanghai", updatedAt: isoNow() },
      partner: { name: "小林", city: "成都", timezone: "Asia/Shanghai", updatedAt: isoNow() }
    },
    weather: null
  };
}

function readDemo() {
  try {
    const saved = localStorage.getItem(DATA_KEY);
    return saved ? { ...demoState(), ...JSON.parse(saved) } : demoState();
  } catch {
    return demoState();
  }
}

const savedRepository = () => { try { return JSON.parse(localStorage.getItem(REPO_KEY) || "null"); } catch { return null; } };
const ui = { view: "home", role: localStorage.getItem(ROLE_KEY) === "partner" ? "partner" : "me", weatherBusy: false, weatherError: "", syncLabel: "此设备体验数据", installEvent: null, syncBusy: false, busy: false, draft: "" };
let data = readDemo();
let remote = null;
let weatherCache = null;
let toastTimer;
let connectionVersion = 0;
let weatherRequest = 0;

function roleName(role) { return data.profiles?.[role]?.name || (role === "me" ? "我" : "TA"); }
function currentRole() { return ui.role; }
function counterpartRole() { return ui.role === "me" ? "partner" : "me"; }
function profile(role = ui.role) { return data.profiles?.[role] || { name: role === "me" ? "我" : "TA", city: "" }; }
function fmtDay(value, options = { month: "long", day: "numeric" }) {
  if (!value) return "";
  const [y, m, d] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("zh-CN", options).format(new Date(y, m - 1, d));
}
function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = dateKey(d) === dateKey(now);
  if (sameDay) return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  return `${d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })} ${d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
}
function firstAnniversary() {
  return [...(data.anniversaries || [])].sort((a, b) => {
    const aDays = nextAnniversary(a).days, bDays = nextAnniversary(b).days;
    if (aDays < 0 && bDays >= 0) return 1;
    if (bDays < 0 && aDays >= 0) return -1;
    return Math.abs(aDays) - Math.abs(bDays);
  })[0];
}
function relativeTime(iso) {
  if (!iso) return "尚未更新";
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "刚刚更新";
  if (mins < 60) return `${mins} 分钟前更新`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前更新`;
  return `${Math.floor(hours / 24)} 天前更新`;
}
function moodFor(role) { return moodOptions.find((m) => m.key === data.moods?.[role]?.key) || { label: "尚未设置", color: "mint", icon: "◌" }; }
function avatar(role, size = "") {
  return `<span class="avatar avatar-${role} ${size}" aria-label="${escapeHtml(roleName(role))}">${escapeHtml((roleName(role).trim()[0] || "?").toUpperCase())}</span>`;
}
function navItem(view, label, iconName, count = 0) {
  const active = ui.view === view ? "active" : "";
  return `<button class="nav-item ${active}" data-action="navigate" data-view="${view}"><span class="nav-icon">${icon(iconName)}</span><span>${label}</span>${count ? `<span class="nav-count">${count}</span>` : ""}</button>`;
}
function unreadCount() { return (data.whispers || []).filter((m) => m.recipient === ui.role && !m.readAt && !m.deletedAt).length; }
function weekStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
function weeklyCount(habitId) {
  const start = dateKey(weekStart());
  return (data.checkins || []).filter((c) => c.habitId === habitId && c.date >= start && !c.deletedAt).length;
}
function streakCount(habitId) {
  return streakCountFor(data.checkins || [], habitId);
}
function didCheckIn(habitId) { return (data.checkins || []).some((c) => c.habitId === habitId && c.date === dateKey() && !c.deletedAt); }

function renderShell() {
  const focused = document.activeElement?.matches('.quick-compose textarea') ? { start: document.activeElement.selectionStart, end: document.activeElement.selectionEnd } : null;
  const today = new Intl.DateTimeFormat("zh-CN", { weekday: "long", month: "long", day: "numeric" }).format(new Date());
  const unread = unreadCount();
  const mode = remote ? `同步于 ${escapeHtml(ui.syncLabel)}` : "体验数据 · 仅此设备";
  const installButton = ui.installEvent ? `<button class="icon-button install-button" data-action="install" title="添加到主屏幕" aria-label="添加到主屏幕">${icon("plus")}</button>` : "";
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <a class="brand" href="./" data-action="navigate" data-view="home" aria-label="两地之间主页">
          <span class="brand-mark"><img src="./couple-mark.svg" alt="" /></span>
          <span class="brand-copy"><strong>两地之间</strong><small>BETWEEN US</small></span>
        </a>
        <div class="side-label">空间</div>
        <nav class="primary-nav" aria-label="主导航">
          ${navItem("home", "今天", "home")}
          ${navItem("whispers", "悄悄话", "message", unread)}
          ${navItem("habits", "好习惯", "check")}
        </nav>
        <div class="side-spacer"></div>
        <div class="sidebar-note">
          <div class="note-overline">只属于你们</div>
          <p>每一个小小的<br />日常，都算数。</p>
          <span class="note-line"><i></i><i></i><i></i></span>
        </div>
        <button class="account-button" data-action="settings">
          ${avatar(ui.role)}
          <span class="account-copy"><strong>${escapeHtml(roleName(ui.role))}</strong><small>${remote ? "私有仓库已连接" : "本地体验空间"}</small></span>
          <span class="account-menu">${icon("settings", 16)}</span>
        </button>
      </aside>
      <main class="main-area">
        <header class="topbar">
          <div class="crumb"><span>${today}</span><span class="crumb-dot"></span><span class="sync-label ${remote ? "is-synced" : ""}" title="${mode}"><i></i>${mode}</span></div>
          <div class="top-actions">
            ${installButton}
            <button class="icon-button sync-button" data-action="refresh" title="立即同步" aria-label="立即同步">${icon("refresh")}</button>
            <button class="role-button" data-action="switch-role" title="切换展示档案（双方信任使用，非身份验证）"><span class="role-stack">${avatar("me", "tiny")}${avatar("partner", "tiny")}</span><span>以 ${escapeHtml(roleName(ui.role))} 的视角</span><span class="down-caret">⌄</span></button>
            <button class="icon-button settings-button" data-action="settings" title="设置" aria-label="设置">${icon("settings")}</button>
          </div>
        </header>
        <section class="page-content">${renderView()}</section>
      </main>
      <nav class="mobile-nav" aria-label="底部导航">
        ${navItem("home", "今天", "home")}${navItem("whispers", "悄悄话", "message", unread)}${navItem("habits", "好习惯", "check")}
        <button class="nav-item ${ui.view === "settings" ? "active" : ""}" data-action="settings"><span class="nav-icon">${icon("settings")}</span><span>设置</span></button>
      </nav>
    </div>`;
  if (focused) {
    const input = document.querySelector('.quick-compose textarea');
    input?.focus({ preventScroll: true });
    input?.setSelectionRange(focused.start, focused.end);
  }
}

function renderView() {
  if (ui.view === "whispers") return renderWhispersPage();
  if (ui.view === "habits") return renderHabitsPage();
  return renderDashboard();
}

function renderDashboard() {
  const ann = firstAnniversary();
  const other = counterpartRole();
  const partnerProfile = profile(other);
  const ownProfile = profile(ui.role);
  const otherMood = moodFor(other);
  const myMood = moodFor(ui.role);
  const unreads = unreadCount();
  const next = ann ? nextAnniversary(ann) : null;
  const yearDays = ann && !ann.repeatYearly ? daysBetween(ann.date, dateKey()) : null;
  const elapsed = data.anniversaries.find((a) => a.date <= dateKey() && /在一起|相恋|相识/.test(a.title));
  const englishDate = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase();
  const activeHabits = (data.habits || []).filter((h) => h.active);
  const myHabits = activeHabits.filter((h) => h.owner === ui.role);
  const recentWhispers = [...(data.whispers || [])].filter((m) => !m.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 2);
  const weather = ui.weatherBusy ? `<div class="weather-loading"><span class="loader"></span><span>正在看 ${escapeHtml(partnerProfile.city || "对方城市")} 的天气</span></div>` : ui.weatherError ? `<div class="weather-empty"><span>${icon("cloud", 23)}</span><p>${escapeHtml(ui.weatherError)}</p><button class="text-button" data-action="weather">重试</button></div>` : weatherCache ? `<div class="weather-now"><span class="weather-symbol">${weatherIcon(weatherCache.code)}</span><div><div class="temperature">${Math.round(weatherCache.temperature)}<span>°</span></div><div class="weather-desc">${escapeHtml(weatherText[weatherCache.code] || "天气未知")} · 体感 ${Math.round(weatherCache.apparent)}°</div></div><div class="weather-range"><span>今日</span><strong>${Math.round(weatherCache.max)}° <i>/</i> ${Math.round(weatherCache.min)}°</strong></div></div>` : `<div class="weather-empty"><span>${icon("cloud", 23)}</span><p>设置城市后查看天气</p><button class="text-button" data-action="settings">设置城市</button></div>`;

  return `
    <div class="view-heading">
      <div><div class="eyebrow"><span class="eyebrow-dot"></span> ${englishDate}</div><h1>今天，也在彼此的日常里。</h1><p class="intro-copy">${escapeHtml(ownProfile.name)}，愿今天有一点点温柔的好事。</p></div>
      <div class="heading-actions"><span class="experience-badge"><i></i>${remote ? '双人共享空间' : '交互演示'}</span><button class="button button-dark" data-action="new-whisper">${icon("heart", 17)}写一句悄悄话</button></div>
    </div>

    <section class="connection-banner" aria-label="双城连接">
      <div class="banner-copy">
        <span class="banner-kicker">SAME SKY, DIFFERENT CITIES</span>
        <h2>距离很远，<br class="mobile-break" />日常很近。</h2>
        <p>把想说的话、想记住的日子，都放在这里。</p>
        <button class="banner-link" data-action="navigate" data-view="whispers">去看看悄悄话 ${icon("arrow", 16)}</button>
      </div>
      <div class="city-link-art" aria-hidden="true">
        <div class="city city-left"><span class="city-sun"></span><span class="building b1"></span><span class="building b2"></span><span class="building b3"></span><span class="city-name">${escapeHtml(ownProfile.city || "你的城市")}</span></div>
        <svg class="route-line" viewBox="0 0 300 120" preserveAspectRatio="none"><path d="M9 93 C 75 3, 210 4, 290 78"/><circle cx="150" cy="29" r="3"/><circle cx="174" cy="32" r="2"/><circle cx="196" cy="38" r="1.6"/></svg>
        <div class="city city-right"><span class="building b1"></span><span class="building b2"></span><span class="building b3"></span><span class="city-name">${escapeHtml(partnerProfile.city || "TA 的城市")}</span></div>
        <span class="distance-heart">${icon("heart", 18)}</span>
        <span class="art-caption">${elapsed ? `相伴 ${daysBetween(elapsed.date, dateKey())} 天 · ` : '两个城市 · '}同一份牵挂</span>
      </div>
    </section>

    <div class="dashboard-grid">
      <section class="panel anniversary-panel">
        <div class="panel-head"><div class="section-title"><span class="section-mark mark-coral">${icon("calendar", 16)}</span><div><span class="panel-kicker">IMPORTANT DAYS</span><h2>我们的纪念日</h2></div></div><button class="icon-button small" data-action="add-anniversary" title="添加纪念日" aria-label="添加纪念日">${icon("plus", 18)}</button></div>
        ${ann ? `<div class="anniversary-body"><div class="anniversary-date"><span class="date-month">${fmtDay(next.date, { month: "long" })}</span><strong>${Number(next.date.slice(-2))}</strong><span>${fmtDay(next.date, { weekday: "long" })}</span></div><div class="anniversary-info"><strong>${escapeHtml(ann.title)}</strong><span>${ann.repeatYearly ? `还有 ${next.days} 天` : yearDays === 0 ? "就是今天" : yearDays > 0 ? `已经过去 ${yearDays} 天` : `还有 ${next.days} 天`}</span><div class="countdown-rail"><i style="--progress:${Math.max(7, Math.min(98, 100 - (next.days / 365 * 100)))}%"></i></div><small>${ann.repeatYearly ? "每年都会再次相遇" : `记于 ${fmtDay(ann.date)}`}</small></div></div><div class="anniversary-footer"><span>${(data.anniversaries || []).length} 个值得记住的日子</span><button class="text-button" data-action="manage-anniversaries">查看全部 ${icon("arrow", 14)}</button></div>` : `<div class="empty-inline"><span class="empty-symbol">✳</span><p>还没有纪念日，<br />把重要的日子留在这里。</p><button class="text-button" data-action="add-anniversary">添加第一个纪念日 ${icon("arrow", 14)}</button></div>`}
      </section>

      <section class="panel mood-panel">
        <div class="panel-head"><div class="section-title"><span class="section-mark mark-mint">◌</span><div><span class="panel-kicker">HOW WE FEEL</span><h2>此刻的心情</h2></div></div><button class="text-button muted" data-action="set-mood">更新我的状态 ${icon("arrow", 14)}</button></div>
        <div class="mood-pair">
          <button class="mood-person" data-action="set-mood"><span class="mood-avatar mood-${myMood.color}">${myMood.icon}</span><span class="mood-copy"><strong>${escapeHtml(roleName(ui.role))}</strong><span>${escapeHtml(myMood.label)}${data.moods?.[ui.role]?.note ? ` · ${escapeHtml(data.moods[ui.role].note)}` : ""}</span><small>${relativeTime(data.moods?.[ui.role]?.updatedAt)}</small></span><span class="edit-dot">${icon("edit", 13)}</span></button>
          <div class="mood-divider"></div>
          <div class="mood-person"><span class="mood-avatar mood-${otherMood.color}">${otherMood.icon}</span><span class="mood-copy"><strong>${escapeHtml(roleName(other))}</strong><span>${escapeHtml(otherMood.label)}${data.moods?.[other]?.note ? ` · ${escapeHtml(data.moods[other].note)}` : ""}</span><small>${relativeTime(data.moods?.[other]?.updatedAt)}</small></span></div>
        </div>
        <p class="mood-footnote">只显示彼此主动分享的状态。</p>
      </section>

      <section class="panel whisper-panel">
        <div class="panel-head"><div class="section-title"><span class="section-mark mark-lilac">${icon("message", 16)}</span><div><span class="panel-kicker">A LITTLE NOTE</span><h2>悄悄话</h2></div></div><button class="icon-button small" data-action="new-whisper" title="写留言" aria-label="写留言">${icon("plus", 18)}</button></div>
        ${recentWhispers.length ? `<div class="whisper-list">${recentWhispers.map((m) => whisperRow(m, true)).join("")}</div>` : `<div class="empty-inline small-empty"><span class="empty-symbol">♡</span><p>留一句话给对方吧。</p></div>`}
        <div class="panel-footer"><span class="unread-caption">${unreads ? `${unreads} 条还没读` : "今天的思念有地方安放"}</span><button class="text-button" data-action="navigate" data-view="whispers">打开留言簿 ${icon("arrow", 14)}</button></div>
      </section>

      <section class="panel habits-panel">
        <div class="panel-head"><div class="section-title"><span class="section-mark mark-blue">${icon("check", 17)}</span><div><span class="panel-kicker">LITTLE RITUALS</span><h2>今天的小习惯</h2></div></div><button class="icon-button small" data-action="add-habit" title="添加习惯" aria-label="添加习惯">${icon("plus", 18)}</button></div>
        ${myHabits.length ? `<div class="habit-preview-list">${myHabits.slice(0, 3).map((h) => habitRow(h, true)).join("")}</div><div class="panel-footer"><span class="unread-caption">本周完成 ${myHabits.reduce((n, h) => n + weeklyCount(h.id), 0)} 次</span><button class="text-button" data-action="navigate" data-view="habits">查看习惯 ${icon("arrow", 14)}</button></div>` : `<div class="empty-inline small-empty"><span class="empty-symbol">✓</span><p>从一个小小的好习惯开始。</p><button class="text-button" data-action="add-habit">添加习惯 ${icon("arrow", 14)}</button></div>`}
      </section>

      <section class="panel points-panel">
        <div class="points-decoration" aria-hidden="true"><span class="coin coin-one">✳</span><span class="coin coin-two">♡</span><span class="coin coin-three">+1</span></div>
        <div class="points-content"><span class="panel-kicker">KINDNESS BANK · V2</span><h2>奖励与积分</h2><p>给彼此的努力，留一个以后再开启的位置。</p><span class="coming-soon">第二版再见 <span>↗</span></span></div>
        <span class="points-stub">—</span>
      </section>

      <section class="panel weather-panel">
        <div class="panel-head"><div class="section-title"><span class="section-mark mark-yellow">${icon("cloud", 16)}</span><div><span class="panel-kicker">OUTSIDE THEIR WINDOW</span><h2>${escapeHtml(partnerProfile.city || "对方城市")} 的天气</h2></div></div><button class="icon-button small" data-action="weather" title="刷新天气" aria-label="刷新天气">${icon("refresh", 16)}</button></div>
        ${weather}<div class="weather-foot"><a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">天气由 Open-Meteo 提供</a><span>${weatherCache ? `更新于 ${fmtTime(weatherCache.updatedAt)}` : "需联网查询"}</span></div>
      </section>
    </div>
    <footer class="page-footer"><span>一点点日常，也能跨过很远的距离。</span><button data-action="settings" class="footer-settings">${icon("lock", 13)} 数据与同步设置</button></footer>`;
}

function whisperRow(message, compact = false) {
  const sender = message.sender;
  const isMine = sender === ui.role;
  const unread = message.recipient === ui.role && !message.readAt;
  return `<article class="whisper-row ${compact ? "compact" : ""} ${unread ? "unread" : ""}">
    ${avatar(sender, "small-avatar")}<div class="whisper-message"><div class="whisper-meta"><strong>${escapeHtml(roleName(sender))}</strong><time>${fmtTime(message.createdAt)}</time>${isMine ? `<span class="read-status">${message.readAt ? "对方已读" : "对方未读"}</span>` : unread ? `<span class="new-dot" title="未读" aria-label="未读"></span>` : ""}</div><p>${escapeHtml(message.content)}</p></div>
    <div class="whisper-row-actions">${!compact && unread ? `<button class="icon-button small" data-action="mark-read" data-id="${escapeHtml(message.id)}" title="标记为已读" aria-label="标记为已读">${icon("check", 16)}</button>` : ""}${isMine ? `<button class="icon-button small subtle-danger" data-action="delete-whisper" data-id="${escapeHtml(message.id)}" title="删除留言" aria-label="删除留言">${icon("trash", 15)}</button>` : ""}</div>
  </article>`;
}

function renderWhispersPage() {
  const messages = [...(data.whispers || [])].filter((m) => !m.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const unread = unreadCount();
  return `<div class="view-heading compact-heading"><div><div class="eyebrow"><span class="eyebrow-dot"></span> THE LITTLE LETTERS</div><h1>悄悄话</h1><p class="intro-copy">${unread ? `有 ${unread} 句心意等你慢慢读。` : "想说的话，随时都可以留下。"}</p></div><div class="heading-actions"><button class="button button-dark" data-action="new-whisper">${icon("plus", 17)}写一句</button></div></div>
    <section class="letterbook panel"><div class="letterbook-head"><div><span class="panel-kicker">A SHARED INBOX</span><h2>你们的留言簿</h2></div><span class="letter-count">${messages.length} 句心意</span></div>
      <form class="quick-compose" data-form="whisper"><span class="compose-avatar">${avatar(ui.role)}</span><div class="compose-field"><textarea name="content" rows="2" maxlength="500" aria-label="悄悄话内容" placeholder="写下一句想让 TA 看到的话……" required>${escapeHtml(ui.draft)}</textarea><div class="compose-actions"><span>最多 500 字 · ${remote ? '联网后送出' : '本地体验'}</span><button class="button button-dark small-button" type="submit">送出悄悄话 ${icon("arrow", 15)}</button></div></div></form>
      <div class="letter-list">${messages.length ? messages.map((m) => whisperRow(m)).join("") : `<div class="empty-page"><span class="empty-symbol">♡</span><h3>这里还很安静</h3><p>写下第一句悄悄话，让它跨过城市抵达 TA。</p></div>`}</div>
      <div class="privacy-line">${icon("lock", 14)} ${remote ? "留言保存在你们的 GitHub 私有仓库中。" : "体验留言只保存在这台设备的浏览器中。"}</div>
    </section>`;
}

function habitRow(habit, compact = false) {
  const done = didCheckIn(habit.id);
  const owner = habit.owner;
  const completeControl = owner === ui.role ? `<button class="check-toggle ${done ? "checked" : ""}" data-action="toggle-checkin" data-id="${escapeHtml(habit.id)}" aria-label="${done ? "取消今天的打卡" : "完成今天的打卡"}" title="${done ? "今天已完成" : "完成今天的打卡"}">${done ? icon("check", 16) : ""}</button>` : `<span class="check-toggle other-check ${done ? "checked" : ""}" aria-label="${done ? "今天已打卡" : "尚未打卡"}">${done ? icon("check", 16) : ""}</span>`;
  return `<article class="habit-row ${done ? "is-done" : ""} ${compact ? "compact" : ""}">${completeControl}<div class="habit-title"><strong>${escapeHtml(habit.name)}</strong><span>${escapeHtml(roleName(owner))} · 连续 ${streakCount(habit.id)} 天</span></div><div class="habit-week"><span>${weeklyCount(habit.id)}<small>本周</small></span></div>${!compact ? `<button class="icon-button small habit-edit" data-action="edit-habit" data-id="${escapeHtml(habit.id)}" title="编辑习惯" aria-label="编辑习惯">${icon("edit", 15)}</button>` : ""}</article>`;
}

function renderHabitsPage() {
  const active = (data.habits || []).filter((h) => h.active);
  const mine = active.filter((h) => h.owner === ui.role);
  const theirs = active.filter((h) => h.owner === counterpartRole());
  const total = active.length;
  const complete = active.filter((h) => didCheckIn(h.id)).length;
  return `<div class="view-heading compact-heading"><div><div class="eyebrow"><span class="eyebrow-dot"></span> SMALL, STEADY THINGS</div><h1>好习惯</h1><p class="intro-copy">不用很厉害，先一起坚持一点点。</p></div><div class="heading-actions"><button class="button button-dark" data-action="add-habit">${icon("plus", 17)}添加习惯</button></div></div>
    <section class="habit-summary"><div><span class="panel-kicker">TODAY'S RITUALS</span><strong>${complete}<small> / ${total}</small></strong><span>今天完成</span></div><div class="summary-progress"><i style="--progress:${total ? `${complete / total * 100}%` : "0%"}"></i></div><p>小小的坚持，也会慢慢变成我们的默契。</p></section>
    <div class="habit-columns"><section class="habit-group panel"><div class="group-heading">${avatar(ui.role)}<div><h2>${escapeHtml(roleName(ui.role))} 的习惯</h2><span>本周已完成 ${mine.reduce((n, h) => n + weeklyCount(h.id), 0)} 次</span></div></div><div class="habit-list">${mine.length ? mine.map((h) => habitRow(h)).join("") : `<div class="empty-page"><span class="empty-symbol">✓</span><h3>从一个小习惯开始</h3><p>你可以先为自己选一件想坚持的小事。</p><button class="text-button" data-action="add-habit">添加我的习惯 ${icon("arrow", 14)}</button></div>`}</div></section>
    <section class="habit-group panel"><div class="group-heading">${avatar(counterpartRole())}<div><h2>${escapeHtml(roleName(counterpartRole()))} 的习惯</h2><span>本周已完成 ${theirs.reduce((n, h) => n + weeklyCount(h.id), 0)} 次</span></div></div><div class="habit-list">${theirs.length ? theirs.map((h) => habitRow(h)).join("") : `<div class="empty-page"><span class="empty-symbol">✳</span><h3>TA 的清单还空着</h3><p>把这页分享给 TA，一起添一个小目标。</p></div>`}</div></section></div>`;
}

function showModal(content, wide = false) {
  modalContent.innerHTML = content;
  modal.classList.toggle("modal-wide", wide);
  if (!modal.open) modal.showModal();
  const first = modalContent.querySelector("input:not([type=hidden]), textarea, select, button");
  if (first) setTimeout(() => first.focus(), 40);
}
function closeModal() { if (modal.open) modal.close(); }
function modalHeader(title, kicker = "BETWEEN US") {
  return `<div class="modal-head"><div><span class="panel-kicker">${kicker}</span><h2 id="modal-title">${title}</h2></div><button class="icon-button" data-action="close-modal" title="关闭" aria-label="关闭">${icon("close", 19)}</button></div>`;
}

function showAnniversaryForm(id = "") {
  const item = (data.anniversaries || []).find((a) => a.id === id);
  showModal(`<form class="form-stack" data-form="anniversary" data-id="${escapeHtml(id)}">${modalHeader(item ? "编辑纪念日" : "记住一个日子", "IMPORTANT DAYS")}<label class="field"><span>日子的名字</span><input name="title" maxlength="60" placeholder="例如：我们在一起" value="${escapeHtml(item?.title || "")}" required /></label><label class="field"><span>日期</span><input name="date" type="date" value="${escapeHtml(item?.date || dateKey())}" required /></label><label class="check-field"><input name="repeatYearly" type="checkbox" ${item?.repeatYearly ? "checked" : ""}/><span class="check-ui"></span><span>每年重复这个纪念日</span></label><div class="form-actions">${item ? `<button type="button" class="text-button danger-link" data-action="delete-anniversary" data-id="${escapeHtml(item.id)}">删除纪念日</button>` : `<span></span>`}<button class="button button-dark" type="submit">${item ? "保存修改" : "保存这个日子"}</button></div></form>`);
}

function showMoodForm() {
  const own = data.moods?.[ui.role] || {};
  const current = own.key || "calm";
  showModal(`<form class="form-stack" data-form="mood">${modalHeader("此刻的我", "HOW I FEEL")}<p class="form-intro">选一个最接近现在的状态，也可以只选状态、不写说明。</p><div class="mood-choices">${moodOptions.map((m) => `<label class="mood-choice"><input type="radio" name="key" value="${m.key}" ${current === m.key ? "checked" : ""}/><span class="mood-choice-icon mood-${m.color}">${m.icon}</span><span>${m.label}</span></label>`).join("")}</div><label class="field"><span>补充一句（可选）</span><textarea name="note" rows="3" maxlength="120" placeholder="比如：今天想安静一会儿">${escapeHtml(own.note || "")}</textarea></label><div class="form-actions"><span class="field-hint">状态会分享给对方</span><button class="button button-dark" type="submit">更新状态</button></div></form>`);
}

function showHabitForm(id = "") {
  const habit = (data.habits || []).find((h) => h.id === id);
  showModal(`<form class="form-stack" data-form="habit" data-id="${escapeHtml(id)}">${modalHeader(habit ? "编辑习惯" : "一起坚持一件小事", "LITTLE RITUALS")}<label class="field"><span>习惯名称</span><input name="name" maxlength="60" placeholder="例如：睡前互道晚安" value="${escapeHtml(habit?.name || "")}" required /></label><label class="field"><span>属于谁</span><select name="owner"><option value="${ui.role}" ${!habit || habit.owner === ui.role ? "selected" : ""}>${escapeHtml(roleName(ui.role))}</option><option value="${counterpartRole()}" ${habit?.owner === counterpartRole() ? "selected" : ""}>${escapeHtml(roleName(counterpartRole()))}</option></select></label><div class="form-actions">${habit ? `<button type="button" class="text-button danger-link" data-action="archive-habit" data-id="${escapeHtml(habit.id)}">停用习惯</button>` : `<span></span>`}<button class="button button-dark" type="submit">${habit ? "保存修改" : "创建习惯"}</button></div></form>`);
}

function showSettings() {
  const repo = savedRepository() || {};
  const activeRepo = remote ? `${remote.owner}/${remote.repo}` : repo.owner && repo.repo ? `${repo.owner}/${repo.repo}` : "尚未连接";
  showModal(`<form class="form-stack settings-form" data-form="settings">${modalHeader("你们的空间", "SPACE SETTINGS")}
    <div class="settings-section"><div class="settings-section-title"><strong>这台设备的使用者</strong><span>只影响当前设备</span></div><div class="segmented role-segment"><label><input type="radio" name="role" value="me" ${ui.role === "me" ? "checked" : ""}/><span>${escapeHtml(profile("me").name || "我")}</span></label><label><input type="radio" name="role" value="partner" ${ui.role === "partner" ? "checked" : ""}/><span>${escapeHtml(profile("partner").name || "TA")}</span></label></div></div>
    <p class="field-hint">展示档案由你们自行选择，双方互相信任使用，不代表 GitHub 已验证身份。第一版使用 GitHub Token 授权，不是自建账号密码登录。</p>
    <div class="settings-pair">${['me', 'partner'].map((role, index) => `<label class="field"><span>档案 ${index + 1} · 昵称</span><input name="name-${role}" maxlength="24" value="${escapeHtml(profile(role).name)}" required /></label><label class="field"><span>档案 ${index + 1} · 城市</span><input name="city-${role}" maxlength="40" value="${escapeHtml(profile(role).city)}" placeholder="例如：杭州" required /></label>`).join('')}</div>
    <div class="form-actions"><span class="field-hint">${remote ? '仅更新所选档案的资料' : '体验资料只保存在此设备'}</span><button class="button button-light" type="submit" name="intent" value="profile">保存资料与视角</button></div>
    <div class="settings-section sync-section"><div class="settings-section-title"><strong>GitHub 私有仓库</strong><span>${escapeHtml(activeRepo)}</span></div><div class="settings-pair"><label class="field"><span>仓库拥有者</span><input name="owner" autocomplete="off" value="${escapeHtml(remote?.owner || repo.owner || "")}" placeholder="GitHub 用户名" /></label><label class="field"><span>仓库名称</span><input name="repo" autocomplete="off" value="${escapeHtml(remote?.repo || repo.repo || "")}" placeholder="私有数据仓库" /></label></div><label class="field"><span>Fine-grained Token <em>每台设备单独授权</em></span><input name="token" type="password" autocomplete="new-password" placeholder="${remote ? "已连接；留空可保存个人设置" : "粘贴只授权此私有仓库的 Token"}" /></label><label class="field"><span>分支</span><input name="branch" value="${escapeHtml(remote?.branch || repo.branch || "main")}" placeholder="main" /></label><p class="security-note">Token 只保存在当前页面内存中，刷新后需重新输入。请只授权 Contents 读取与写入；仓库成员都可以访问全部数据，已删除内容仍会保留在 GitHub 历史中。</p></div>
    <p class="field-hint">建议数据仓库放在共同的 Organization 下，双方作为组织成员各自申请限权 Token；仅作为个人仓库的外部协作者可能无法使用这类 Token。重新连接需再次输入令牌。</p>
    <div class="form-actions settings-actions">${remote ? `<button class="text-button danger-link" type="button" data-action="disconnect">断开并清除此页数据</button>` : `<button class="text-button muted" type="button" data-action="reset-demo">恢复体验数据</button>`}<button class="button button-dark" type="button" data-action="connect">${remote ? "重新连接仓库" : "连接私有仓库"}</button></div><p class="field-hint">连接时只补齐仓库中缺失的档案，已有资料将保留。双人授权配置见 README。</p></form>`, true);
}

function toastMessage(message, error = false) {
  toast.textContent = message;
  toast.classList.toggle("error", error);
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2800);
}

async function persistRecord(folder, item) {
  if (!remote) return item;
  const connection = remote, version = connectionVersion;
  const saved = await connection.save(folder, item);
  if (connection !== remote || version !== connectionVersion) throw new Error('连接已变更，本次结果未载入页面。');
  ui.syncLabel = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  return saved;
}
async function persistDelete(item) {
  if (!remote) return;
  const connection = remote, version = connectionVersion;
  await connection.remove(item);
  if (connection !== remote || version !== connectionVersion) throw new Error('连接已变更，本次结果未载入页面。');
}

async function connectGithub(form) {
  const owner = form.get("owner").trim();
  const repo = form.get("repo").trim();
  const branch = form.get("branch").trim() || "main";
  const token = form.get("token").trim();
  if (!owner || !repo || !token) throw new Error("请填写仓库拥有者、仓库名称和 Token。");
  const version = connectionVersion;
  const candidate = new GithubStore({ owner, repo, branch, token });
  await candidate.validate();
  const loaded = await candidate.load();
  const myRole = form.get("role");
  const profiles = ['me', 'partner'].map((role) => ({ role, name: form.get(`name-${role}`).trim(), city: form.get(`city-${role}`).trim(), updatedAt: isoNow() }));
  for (const next of profiles) {
    if (version !== connectionVersion) throw new Error('连接操作已取消。');
    if (!loaded.profiles[next.role]) {
      loaded.profiles[next.role] = await candidate.save('profiles', next);
    }
  }
  if (version !== connectionVersion) throw new Error('连接操作已取消。');
  remote = candidate;
  connectionVersion++;
  data = loaded;
  ui.draft = '';
  ui.role = myRole;
  localStorage.setItem(ROLE_KEY, ui.role);
  localStorage.setItem(REPO_KEY, JSON.stringify({ owner, repo, branch: remote.branch }));
  ui.syncLabel = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  ui.view = "home";
  closeModal();
  renderShell();
  toastMessage("私有仓库已连接，数据已同步");
  refreshWeather();
}

async function syncNow(background = false) {
  if (!remote || ui.syncBusy || (background && ui.busy) || modal.open || (background && ui.draft) || document.visibilityState === "hidden") return;
  const connection = remote, version = connectionVersion;
  ui.syncBusy = true;
  const button = document.querySelector(".sync-button");
  if (button) button.classList.add("spinning");
  try {
    const loaded = await connection.load();
    if (connection !== remote || version !== connectionVersion) return;
    data = loaded;
    ui.syncLabel = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    if (!background) toastMessage("已同步到最新内容");
    renderShell();
  } catch (error) {
    if (connection !== remote || version !== connectionVersion) return;
    if (!background) toastMessage(`同步失败：${error.message}`, true);
    ui.syncLabel = "同步失败";
    renderShell();
  } finally {
    ui.syncBusy = false;
    document.querySelector('.sync-button')?.classList.remove('spinning');
  }
}

async function saveProfileSettings(form) {
  const role = form.get("role");
  const nextProfiles = Object.fromEntries(['me', 'partner'].map((key) => [key, { ...(data.profiles?.[key] || {}), role: key, name: form.get(`name-${key}`).trim(), city: form.get(`city-${key}`).trim(), updatedAt: isoNow() }]));
  if (remote) {
    data.profiles[role] = await persistRecord('profiles', nextProfiles[role]);
  } else {
    data.profiles = { ...data.profiles, ...nextProfiles };
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
  }
  ui.role = role;
  localStorage.setItem(ROLE_KEY, role);
  closeModal();
  renderShell();
  refreshWeather();
  toastMessage("设置已保存");
}

async function refreshWeather() {
  const request = ++weatherRequest;
  const city = profile(counterpartRole()).city?.trim();
  if (weatherCache?.requestedCity !== city) weatherCache = null;
  ui.weatherError = "";
  if (!city) { ui.weatherBusy = false; renderShell(); return; }
  ui.weatherBusy = true;
  renderShell();
  try {
    const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geoUrl.search = new URLSearchParams({ name: city, count: "1", language: "zh", format: "json" });
    const geoResponse = await fetch(geoUrl, { cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (!geoResponse.ok) throw new Error("城市查询暂时不可用");
    const geo = await geoResponse.json();
    const place = geo.results?.[0];
    if (!place) throw new Error("没有找到这个城市，请在设置中检查名称");
    const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
    weatherUrl.search = new URLSearchParams({ latitude: place.latitude, longitude: place.longitude, current: "temperature_2m,apparent_temperature,weather_code", daily: "temperature_2m_max,temperature_2m_min", timezone: "auto", forecast_days: "1" });
    const weatherResponse = await fetch(weatherUrl, { cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (!weatherResponse.ok) throw new Error("天气服务暂时不可用");
    const result = await weatherResponse.json();
    if (request !== weatherRequest) return;
    weatherCache = { requestedCity: city, city: place.name, code: result.current.weather_code, temperature: result.current.temperature_2m, apparent: result.current.apparent_temperature, max: result.daily.temperature_2m_max[0], min: result.daily.temperature_2m_min[0], updatedAt: isoNow() };
  } catch (error) {
    if (request !== weatherRequest) return;
    ui.weatherError = error.name === 'TimeoutError' ? '天气连接超时，可稍后重试' : '天气暂时不可用，请检查网络或城市名称';
  } finally {
    if (request === weatherRequest) { ui.weatherBusy = false; renderShell(); }
  }
}

async function handleAction(button) {
  const action = button.dataset.action;
  const id = button.dataset.id;
  if (action === "navigate") {
    ui.view = button.dataset.view || "home";
    renderShell();
    if (ui.view === "whispers") await markVisibleUnread();
    return;
  }
  if (action === "settings") { showSettings(); return; }
  if (action === "connect") {
    const form = button.closest("form[data-form=\"settings\"]");
    if (!form) throw new Error("设置表单没有正确加载，请刷新页面后重试。");
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    await submitForm(form, "connect");
    return;
  }
  if (action === "close-modal") { closeModal(); return; }
  if (action === "add-anniversary") { showAnniversaryForm(); return; }
  if (action === "manage-anniversaries") { showAnniversaryList(); return; }
  if (action === "edit-anniversary") { showAnniversaryForm(id); return; }
  if (action === "delete-anniversary") { await removeAnniversary(id); return; }
  if (action === "set-mood") { showMoodForm(); return; }
  if (action === "new-whisper") { ui.view = "whispers"; renderShell(); setTimeout(() => document.querySelector('[name="content"]')?.focus(), 60); return; }
  if (action === "delete-whisper") { await removeWhisper(id); return; }
  if (action === "mark-read") { await markRead(id); return; }
  if (action === "add-habit") { showHabitForm(); return; }
  if (action === "edit-habit") { showHabitForm(id); return; }
  if (action === "archive-habit") { await archiveHabit(id); return; }
  if (action === "toggle-checkin") { await toggleCheckin(id); return; }
  if (action === "refresh") { if (remote) await syncNow(); else { refreshWeather(); toastMessage("体验数据已刷新"); } return; }
  if (action === "weather") { refreshWeather(); return; }
  if (action === "switch-role") { ui.role = counterpartRole(); localStorage.setItem(ROLE_KEY, ui.role); renderShell(); refreshWeather(); return; }
  if (action === "disconnect") { disconnect(); return; }
  if (action === "reset-demo") { resetDemo(); return; }
  if (action === "install" && ui.installEvent) { ui.installEvent.prompt(); ui.installEvent = null; renderShell(); }
}

function showAnniversaryList() {
  const rows = [...(data.anniversaries || [])].sort((a, b) => nextAnniversary(a).days - nextAnniversary(b).days).map((a) => {
    const next = nextAnniversary(a);
    return `<div class="anniversary-list-row"><span class="anniversary-list-date">${fmtDay(next.date, { month: "numeric", day: "numeric" })}</span><span class="anniversary-list-title"><strong>${escapeHtml(a.title)}</strong><small>${a.repeatYearly ? `还有 ${next.days} 天` : fmtDay(a.date)}</small></span><button class="icon-button small" data-action="edit-anniversary" data-id="${escapeHtml(a.id)}" title="编辑纪念日" aria-label="编辑纪念日">${icon("edit", 15)}</button></div>`;
  }).join("");
  showModal(`<div class="form-stack">${modalHeader("值得记住的日子", "IMPORTANT DAYS")}<div class="anniversary-list">${rows || `<div class="empty-page"><span class="empty-symbol">✳</span><h3>还没有纪念日</h3><p>把重要的日子留在这里。</p></div>`}</div><div class="form-actions"><span></span><button class="button button-dark" data-action="add-anniversary">${icon("plus", 15)}添加纪念日</button></div></div>`);
}

async function removeAnniversary(id) {
  const item = data.anniversaries.find((a) => a.id === id);
  if (!item || !confirm(`删除“${item.title}”？GitHub 仓库会保留提交历史。`)) return;
  try {
    await persistDelete(item);
    data.anniversaries = data.anniversaries.filter((a) => a.id !== id);
    if (!remote) localStorage.setItem(DATA_KEY, JSON.stringify(data));
    showAnniversaryList(); renderShell(); toastMessage("纪念日已删除");
  } catch (error) { toastMessage(`删除失败：${error.message}`, true); }
}

async function removeWhisper(id) {
  const item = data.whispers.find((m) => m.id === id);
  if (!item || item.sender !== ui.role || !confirm("删除这条悄悄话？GitHub 仓库会保留提交历史。")) return;
  try {
    await persistDelete(item);
    data.whispers = data.whispers.filter((m) => m.id !== id);
    if (!remote) localStorage.setItem(DATA_KEY, JSON.stringify(data));
    renderShell(); toastMessage("悄悄话已删除");
  } catch (error) { toastMessage(`删除失败：${error.message}`, true); }
}

async function markRead(id) {
  const item = data.whispers.find((m) => m.id === id);
  if (!item || item.readAt || item.recipient !== ui.role) return;
  try {
    const saved = await persistRecord('whispers', { ...item, readAt: isoNow() });
    data.whispers = data.whispers.map((m) => m.id === id ? saved : m);
    if (!remote) localStorage.setItem(DATA_KEY, JSON.stringify(data));
    renderShell();
  }
  catch (error) { toastMessage(`更新已读状态失败：${error.message}`, true); }
}

async function markVisibleUnread() {
  const connection = remote, version = connectionVersion, role = ui.role;
  const unread = data.whispers.filter((m) => m.recipient === ui.role && !m.readAt);
  for (const item of unread) {
    if (connection !== remote || version !== connectionVersion || role !== ui.role) break;
    await markRead(item.id);
  }
}

async function toggleCheckin(habitId) {
  const habit = data.habits.find((h) => h.id === habitId);
  if (!habit || habit.owner !== ui.role) return;
  const current = data.checkins.find((c) => c.habitId === habitId && c.date === dateKey() && !c.deletedAt);
  try {
    if (current) {
      await persistDelete(current);
      data.checkins = data.checkins.filter((c) => c.id !== current.id);
      toastMessage("今天的打卡已撤销");
    } else {
      const item = { id: `${habitId}-${dateKey()}-${ui.role}`, habitId, date: dateKey(), owner: ui.role, createdAt: isoNow() };
      const saved = await persistRecord("checkins", item);
      data.checkins.push(saved);
      toastMessage("今天的小目标完成了");
    }
    if (!remote) localStorage.setItem(DATA_KEY, JSON.stringify(data));
    renderShell();
  } catch (error) { toastMessage(`打卡未保存：${error.message}`, true); }
}

async function archiveHabit(id) {
  const item = data.habits.find((h) => h.id === id);
  if (!item || !confirm(`停用“${item.name}”？已有打卡记录会保留。`)) return;
  try {
    const saved = await persistRecord('habits', { ...item, active: false, updatedAt: isoNow() });
    data.habits = data.habits.map((h) => h.id === id ? saved : h);
    if (!remote) localStorage.setItem(DATA_KEY, JSON.stringify(data));
    closeModal(); renderShell(); toastMessage('习惯已停用');
  }
  catch (error) { toastMessage(`保存失败：${error.message}`, true); }
}

async function submitForm(formElement, intent = 'profile') {
  const form = new FormData(formElement);
  const kind = formElement.dataset.form;
  try {
    if (kind === "anniversary") {
      const id = formElement.dataset.id || makeId();
      const existing = data.anniversaries.find((a) => a.id === id);
      const item = { ...(existing || {}), id, title: form.get("title").trim(), date: form.get("date"), repeatYearly: form.has("repeatYearly"), updatedAt: isoNow() };
      if (!item.title) throw new Error('请填写纪念日名称。');
      parseDay(item.date);
      const saved = await persistRecord("anniversaries", item);
      data.anniversaries = [saved, ...data.anniversaries.filter((a) => a.id !== id)];
      if (!remote) localStorage.setItem(DATA_KEY, JSON.stringify(data));
      closeModal(); renderShell(); toastMessage(existing ? "纪念日已更新" : "已经记下这个日子");
    } else if (kind === "mood") {
      const item = { ...(data.moods[ui.role] || {}), role: ui.role, key: form.get("key"), note: form.get("note").trim(), updatedAt: isoNow() };
      const saved = await persistRecord("moods", item);
      data.moods[ui.role] = saved;
      if (!remote) localStorage.setItem(DATA_KEY, JSON.stringify(data));
      closeModal(); renderShell(); toastMessage("心情状态已更新");
    } else if (kind === "habit") {
      const id = formElement.dataset.id || makeId();
      const existing = data.habits.find((h) => h.id === id);
      const item = { ...(existing || {}), id, name: form.get("name").trim(), owner: form.get("owner"), active: true, createdAt: existing?.createdAt || isoNow(), updatedAt: isoNow() };
      if (!item.name) throw new Error('请填写习惯名称。');
      const saved = await persistRecord("habits", item);
      data.habits = [saved, ...data.habits.filter((h) => h.id !== id)];
      if (!remote) localStorage.setItem(DATA_KEY, JSON.stringify(data));
      closeModal(); renderShell(); toastMessage(existing ? "习惯已更新" : "新习惯已经加入");
    } else if (kind === "whisper") {
      const content = form.get("content").trim();
      if (!content) return;
      const item = { id: makeId(), sender: ui.role, recipient: counterpartRole(), content, createdAt: isoNow(), readAt: null };
      const saved = await persistRecord("whispers", item);
      data.whispers.unshift(saved);
      ui.draft = '';
      if (!remote) localStorage.setItem(DATA_KEY, JSON.stringify(data));
      renderShell(); toastMessage("悄悄话已送出");
    } else if (kind === "settings") {
      if (intent === 'connect') {
        await connectGithub(form);
      } else {
        await saveProfileSettings(form);
      }
    }
  } catch (error) {
    if (kind === "settings") console.error("[between-us] connection failed", error);
    toastMessage(`${kind === "settings" ? "连接或保存失败" : "保存失败"}：${error.message}`, true);
  }
}

function disconnect() {
  connectionVersion++;
  remote = null;
  ui.draft = '';
  ui.syncLabel = "此设备体验数据";
  data = readDemo();
  localStorage.removeItem(REPO_KEY);
  ui.role = "me";
  localStorage.setItem(ROLE_KEY, "me");
  weatherCache = null;
  closeModal();
  renderShell();
  toastMessage("已断开连接，私有数据已从页面清除");
  refreshWeather();
}

function resetDemo() {
  connectionVersion++;
  data = demoState();
  localStorage.setItem(DATA_KEY, JSON.stringify(data));
  localStorage.removeItem(REPO_KEY);
  remote = null;
  ui.role = "me";
  ui.view = "home";
  ui.draft = '';
  closeModal();
  renderShell();
  refreshWeather();
  toastMessage("体验数据已恢复");
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  event.preventDefault();
  if (button.dataset.action === 'disconnect') { disconnect(); return; }
  if (ui.busy || ui.syncBusy) { toastMessage('正在同步或保存，请稍等片刻'); return; }
  ui.busy = true;
  button.disabled = true;
  try { await handleAction(button); }
  catch (error) { toastMessage(error.message || '操作没有完成，请重试', true); }
  finally { ui.busy = false; button.disabled = false; }
});

document.addEventListener("submit", async (event) => {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  if (ui.busy || ui.syncBusy) { toastMessage('正在同步或保存，请稍等片刻'); return; }
  ui.busy = true;
  const button = event.submitter;
  if (button) button.disabled = true;
  // FormData is the fallback for browsers/webviews that omit submitter.
  const intent = button?.value || new FormData(form).get('intent') || 'profile';
  try { await submitForm(form, intent); }
  finally { ui.busy = false; if (button) button.disabled = false; }
});

document.addEventListener('input', (event) => {
  if (event.target.matches('.quick-compose textarea')) ui.draft = event.target.value;
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modal.open) closeModal();
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  ui.installEvent = event;
  renderShell();
});

window.addEventListener("appinstalled", () => {
  ui.installEvent = null;
  toastMessage("两地之间已添加到主屏幕");
  renderShell();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && remote) syncNow(true);
});

function boot() {
  renderShell();
  refreshWeather();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js", { updateViaCache: 'none' }).catch(() => {});
  setInterval(() => { if (remote && document.visibilityState === "visible") syncNow(true); }, 30000);
  setInterval(() => { if (document.visibilityState === "visible") refreshWeather(); }, 10 * 60 * 1000);
}

boot();
