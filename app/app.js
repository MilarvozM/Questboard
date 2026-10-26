// Questboard in the browser. Rendering is lifted from design/mockup.html; the server (questboard.js) owns the files,
// so this page reads /api/state, re-reads it when /api/events says something changed, and saves through the API.
'use strict';

// ---------------------------------------------------------------- state
let CFG, SETTINGS, GUILDS = [], PLAYER = { days: {} }, STYLES = [], NOW = new Date();
const LANGS = {};                      // locales/<lang>.json, by language
let QUESTS = [], JOURNAL = [];         // open quests (available, active) and closed ones (complete, abandoned)
const META = new WeakMap();            // quest → { rel, version, clash } from the server
const OPEN = ['available', 'active'];
const state = { lang: 'en', view: 'log', type: 'all', guild: null, sel: null, jsel: null, menu: false, theme: 'terminal', sound: true,
  calMode: 'quests', weekStart: 0, pby: 'type' };

const T = (k, x) => String(LANGS[state.lang]?.[k] ?? LANGS.en?.[k] ?? k).replace('{x}', x);
const LOC = () => T('locale');
// Everything that comes from a file is user content and is escaped before it goes into HTML.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------------------------------------------------------------- time (local; files write "YYYY-MM-DD HH:MM", a date alone means 23:59)
const P = s => { if (!s) return null; const [y, mo, d, h = 23, mi = 59] = s.split(/[- :]/).map(Number); return new Date(y, mo - 1, d, h, mi); };
const pad = n => String(n).padStart(2, '0');
const dkey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (k, n) => { const [y, m, d] = k.split('-').map(Number); return dkey(new Date(y, m - 1, d + n)); };
const fmt = (d, o) => new Intl.DateTimeFormat(LOC(), o).format(d);
const hm = d => fmt(d, { hour: '2-digit', minute: '2-digit', hour12: false });
const stamp = d => d ? fmt(d, { month: 'short', day: 'numeric' }) + ' ' + hm(d) : '';
const dateOnly = d => fmt(d, { month: 'short', day: 'numeric', weekday: 'short' });
const longDate = d => fmt(d, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
function dur(ms) {
  const m = Math.floor(Math.abs(ms) / 60000), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), mi = m % 60;
  return d ? `${d}${T('d')} ${h}${T('h')}` : `${h}${T('h')} ${mi}${T('m')}`;
}
const countdown = ms => T(ms < 0 ? 'over' : 'left', dur(ms));
const red = ms => ms !== null && ms < CFG.countdownRedHours * 36e5;

// ---------------------------------------------------------------- symbols (24px grid, line only)
const svg = (inner, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24">${inner}</svg>`;
const TYPE_IC = {
  main: '<path d="M12 2.5 21.5 12 12 21.5 2.5 12z"/><path d="M12 7.5 16.5 12 12 16.5 7.5 12z"/>',
  side: '<circle cx="12" cy="12" r="8.5"/>',
  activity: '<path d="M12 4 20.5 19h-17z"/>',
  all: '<path d="M4 6h16M4 12h16M4 18h16"/>',
};
const IC = {
  open: '<path d="M12 3 21 12 12 21 3 12z"/>',
  done: '<path class="f" d="M12 3 21 12 12 21 3 12z"/>',
  failed: '<path d="M12 3 21 12 12 21 3 12z"/><path d="M9 9l6 6M15 9l-6 6"/>',
  dropped: '<path d="M12 3 21 12 12 21 3 12z"/><path d="M8.5 12h7"/>',
  new: '<path d="M12 3 21 12 12 21 3 12z"/><path d="M12 8.5v7M8.5 12h7"/>',
  crit_open: '<circle cx="12" cy="12" r="8"/>',
  crit_done: '<circle cx="12" cy="12" r="8"/><circle class="f" cx="12" cy="12" r="4.5"/>',
  log: '<path d="M5 4h14v16H5z"/><path d="M8.5 9h7M8.5 13h7M8.5 17h4"/>',
  start: '<circle cx="12" cy="12" r="8"/><path d="M10 8.5 15.5 12 10 15.5z"/>',
  finish: '<path d="M6 21V4"/><path d="M6 4h12l-3 4 3 4H6"/>',
  branch: '<path d="M6 4v6c0 3 2 4 6 4s6 1 6 4v2M6 10c0 3-2 4-2 6v4"/><circle cx="6" cy="4" r="1.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  act_done: '<path class="f" d="M12 4 20.5 19h-17z"/>',
  act_todo: '<path d="M12 4 20.5 19h-17z"/>',
  act_miss: '<path d="M12 4 20.5 19h-17z"/><path d="M12 10v4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
  star_f: '<path class="f" d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
};
const EMBLEM = {
  nib: '<path d="M12 3l6 7-6 11-6-11z"/><path d="M12 3v8"/><circle cx="12" cy="13" r="1.6"/>',
  nodes: '<circle cx="12" cy="5" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><path d="M11 6.8 6 16.3M13 6.8l5 9.5M7 18h10"/>',
  roof: '<path d="M3 11 12 4l9 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
  shield: '<path d="M12 3 19 6v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M7.5 12.5h2.5l1.2-2.5 1.8 5 1.2-2.5h2.3"/>',
  book: '<path d="M3.5 5.5h7c1 0 1.5.5 1.5 1.5v13c0-1-.5-1.5-1.5-1.5h-7z"/><path d="M20.5 5.5h-7c-1 0-1.5.5-1.5 1.5v13c0-1 .5-1.5 1.5-1.5h7z"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><path d="M12 3.5v3.5M12 17v3.5"/>',
  rings: '<circle cx="9" cy="12" r="5.5"/><circle cx="15" cy="12" r="5.5"/>',
  none: '<path d="M12 3.5 19.5 7.75v8.5L12 20.5 4.5 16.25v-8.5z" stroke-dasharray="2.5 2.5"/>',
};
// A guild's emblem is a built-in name or its own SVG path (§2.8).
const emblem = g => EMBLEM[g.emblem] ?? `<path d="${esc(g.emblem)}"/>`;

// ---------------------------------------------------------------- guilds
// Starter guilds take their name from the UI language until the user renames one; a set `name` is user content.
const G = id => {
  const g = GUILDS.find(x => x.id === id);
  if (!g) return { id: 'none', name: T('unassigned'), motto: '', emblem: 'none' };
  const own = k => (k + id) in (LANGS.en || {}) ? T(k + id) : '';
  return { ...g, name: g.name ?? (own('g_') || id), motto: g.motto ?? own('gm_') };
};
// A quest whose guild isn't in guilds.json counts as Unassigned.
const guildOf = q => GUILDS.some(g => g.id === q.guild) ? q.guild : 'none';
const guildList = () => GUILDS.filter(g => !g.hidden).map(g => G(g.id));

// ---------------------------------------------------------------- derived values
const relOf = q => META.get(q)?.rel;
const byRel = rel => QUESTS.find(q => relOf(q) === rel) || JOURNAL.find(q => relOf(q) === rel);
const xpOf = q => q.xp ?? CFG.xp[q.type];
function leaves(q) {
  const out = [];
  q.objectives.forEach((x, i) => x.sub ? x.sub.forEach((c, j) => out.push({ o: c, parent: x, path: [i, j] })) : out.push({ o: x, path: [i] }));
  return out;
}
const current = q => leaves(q).find(l => l.o.s === 'open' && (!l.parent || l.parent.s === 'open'));
function nextAfter(q, cur) {
  const ls = leaves(q).filter(l => l.o.s === 'open' && (!l.parent || l.parent.s === 'open'));
  return ls.slice(ls.findIndex(l => l.o === cur.o) + 1).find(l => !(cur.parent?.any && l.parent === cur.parent));
}
// Activities (§1.4): an "every n days" schedule counts from the day the activity was created; no readable repeat means daily.
const daysBetween = (a, b) => Math.round((P(a + ' 12:00') - P(b + ' 12:00')) / 864e5);
function occurs(a, k) {
  const r = a.repeat, from = (a.created || dkey(NOW)).slice(0, 10);
  if (r?.days) return r.days.includes(P(k + ' 12:00').getDay());
  return k >= from && daysBetween(k, from) % (r?.every || 1) === 0;
}
// Looking one schedule cycle ahead (or back) is always enough to find the next run or the end of a streak.
const cycle = a => (a.repeat?.every || 7) + 1;
function nextRun(a) {
  const done = new Set(a.completions.map(d => d.slice(0, 10))), today = dkey(NOW);
  for (let i = 0; i < 2 * cycle(a); i++) { const k = addDays(today, i); if (occurs(a, k) && !done.has(k)) return P(k + ' 23:59'); }
  return null;
}
function streak(a) {
  const done = new Set(a.completions.map(d => d.slice(0, 10)));
  let n = 0, k = dkey(NOW);
  if (!done.has(k)) k = addDays(k, -1);
  for (let gap = 0; gap < cycle(a); k = addDays(k, -1)) {
    if (k < (a.created || k).slice(0, 10)) break;
    if (!occurs(a, k)) { gap++; continue; }
    if (!done.has(k)) break;
    n++; gap = 0;
  }
  return n;
}
const dueOf = q => q.type === 'activity' ? nextRun(q) : P(q.deadline);
// Links reach a quest wherever it lives: the quest log while it is open, the journal once it is closed
const goAttr = q => !q ? '' : OPEN.includes(q.status) ? `data-open="${esc(relOf(q))}"` : `data-openj="${esc(relOf(q))}"`;
const parentOf = q => q.parent && [...QUESTS, ...JOURNAL].find(x => x.id === q.parent);
// A linked step's wiki link names the child's file; the server keeps the step's state in line with the child.
const linkName = link => link.split('#')[0].split('/').pop().replace(/\.md$/i, '').toLowerCase();
const fileName = q => relOf(q).split('/').pop().replace(/\.md$/i, '').toLowerCase();
const child = x => x?.link ? [...QUESTS, ...JOURNAL].find(q => fileName(q) === linkName(x.link)) : null;
const stepDue = x => !x ? null : x.link ? P(child(x)?.deadline) : P(x.due);
// The sooner of the current step's deadline and the quest's own
function nextDue(q) {
  const qd = dueOf(q), sd = stepDue(current(q)?.o);
  return sd && (!qd || sd < qd) ? { at: sd, step: true } : { at: qd, step: false };
}
const repeatLabel = a => !a.repeat?.days ? (!a.repeat || a.repeat.every === 1 ? T('daily') : T('every_n', a.repeat.every))
  : a.repeat.days.map(n => fmt(new Date(2026, 9, 18 + n), { weekday: 'short' })).join(' · ');
const visible = src => src.filter(q => (state.type === 'all' || q.type === state.type) && (!state.guild || guildOf(q) === state.guild));
const byDue = (a, b) => (dueOf(a) ?? Infinity) - (dueOf(b) ?? Infinity);
const urgency = ms => ms === null ? '' : ms < 0 ? 'over' : red(ms) ? 'crit' : '';
// Focus strip: the tracked quest; else the most urgent if due within urgentDays; else the first favorite; else the most urgent anyway
function focusPick() {
  const tracked = QUESTS.find(q => q.tracked);
  if (tracked) return { q: tracked, why: 'tracking' };
  const urgent = QUESTS.filter(q => q.type !== 'activity' && nextDue(q).at).sort((a, b) => nextDue(a).at - nextDue(b).at)[0];
  if (urgent && nextDue(urgent).at - NOW < CFG.urgentDays * 864e5) return { q: urgent, why: 'urgent' };
  const fav = QUESTS.filter(q => q.favorite).sort(byDue)[0];
  return fav ? { q: fav, why: 'favorite' } : { q: urgent ?? QUESTS.slice().sort(byDue)[0], why: 'urgent' };
}
const focusQuest = () => focusPick().q;
const favs = () => QUESTS.filter(q => q.favorite).sort(byDue);
// S line: the quest's own target, or sLineAt of the way from accepted to deadline
const sLine = q => q.target ? P(q.target) : q.deadline && q.created && new Date(P(q.created).getTime() + (P(q.deadline) - P(q.created)) * CFG.sLineAt);
const ticks = q => `<div class="ticks">${q.objectives.map(x => `<i class="${x.s}"></i>`).join('')}</div>`;
// Player level (§1.4): level n needs levelXpStep × n XP for the next; the level is never stored.
function level() {
  let xp = Object.values(PLAYER.days).flatMap(Object.values).reduce((n, b) => n + (b.xp || 0), 0), lv = 1;
  while (xp >= CFG.levelXpStep * lv) { xp -= CFG.levelXpStep * lv; lv++; }
  return { lv, xp, need: CFG.levelXpStep * lv };
}

// ---------------------------------------------------------------- rendering
const $ = s => document.querySelector(s);

function renderStatic() {
  document.documentElement.lang = T('locale').startsWith('zh') ? 'zh-CN' : state.lang;
  document.documentElement.dataset.theme = state.theme;
  if ($('#settings').classList.contains('on')) renderSettings();
  $('#lang').innerHTML = Object.keys(LANGS).map(l => `<option value="${l}" ${l === state.lang ? 'selected' : ''}>${esc(LANGS[l].lang_name || l)}</option>`).join('');
  $('#cap').placeholder = T('cap_ph');
  document.querySelectorAll('[data-t]').forEach(el => el.textContent = T(el.dataset.t));
  document.querySelectorAll('[data-key]').forEach(el => el.textContent = keyLabel(CFG.keys[el.dataset.key]));
  $('#tabs').innerHTML = ['log', 'cal', 'journal'].map(v => `<button data-v="${v}" class="${state.view === v ? 'on' : ''}">${T('tab_' + v)}</button>`).join('');
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + state.view));
  const { lv, xp, need } = level(), num = v => v.toLocaleString(LOC());
  $('#lv').textContent = pad(lv);
  $('#xp-n').textContent = `${num(xp)} / ${num(need)}`;
  $('#xp-bar').style.width = `${Math.min(100, xp / need * 100)}%`;
  $('#lost').textContent = T('server_lost');
}

function renderFocus() {
  const { q, why } = focusPick(), el = $('#focus');
  if (!q) {
    el.className = 'focus c-main';
    el.innerHTML = `<div style="min-width:0"><div class="f-obj empty"><span>${T('no_quests')}</span></div></div>`;
    return document.body.style.setProperty('--focus-h', el.offsetHeight + 'px');
  }
  el.className = `focus c-${q.type}`;
  const cur = current(q), nxt = cur && nextAfter(q, cur), nd = nextDue(q), due = nd.at, ms = due ? due - NOW : null, g = G(guildOf(q));
  const label = T(why);
  const timeLabel = !due ? T('deadline') : nd.step ? (ms < 0 ? T('step_over') : T('step_due')) : ms < 0 ? T('time_over') : T('time_left');
  const obj = cur
    ? `<div class="f-obj">${svg(cur.o.link ? IC.link : IC.open)}<span>${esc(cur.o.t)}</span></div>`
    : `<div class="f-obj empty"><span>${q.objectives.length ? T('all_resolved') : T('no_obj')}</span></div>`;
  const ctx = cur?.parent ? `<div class="f-ctx">${esc(cur.parent.t)}${cur.parent.any ? `<em>${T('any_one')}</em>` : ''}</div>` : '';
  const acts = cur
    ? `<button class="fa ok" data-fset="done">${svg(IC.done)}${T('a_done')}</button>
       <button class="fa no" data-fset="failed">${svg(IC.failed)}${T('a_fail')}</button>
       <button class="fa" data-fset="dropped">${svg(IC.dropped)}${T('a_drop')}</button>`
    : q.objectives.length ? `<button class="fa ok" data-complete>${svg(IC.finish)}${T('b_complete')}</button>`
    : `<button class="fa ok" data-fadd>${svg(IC.new)}${T('add_obj').replace('+ ', '')}</button>`;
  const others = QUESTS.filter(x => x !== q).sort(byDue);
  el.innerHTML = `
    <div style="min-width:0">
      <div class="f-meta">${svg(TYPE_IC[q.type])}${label.toUpperCase()} · ${T(q.type + '_q').toUpperCase()}
        <span class="g">// ${svg(emblem(g))}${esc(g.name).toUpperCase()}</span><span>·</span><span class="qt">${esc(q.title)}</span>
        <button class="switch" data-switch>${T('switch').toUpperCase()} ▾</button></div>
      ${ctx}${obj}
      <div class="f-next">${nxt ? `<b>${T('then')}</b><span>${esc(nxt.o.t)}</span>` : ''}${q.type === 'activity' ? '' : ticks(q)}</div>
    </div>
    <div class="f-acts">${acts}</div>
    <div class="f-time"><small>${timeLabel}</small>
      <b class="${red(ms) ? 'red' : ''}">${due ? dur(ms) : '—'}</b><span>${due ? longDate(due) + ' · ' + hm(due) : T('no_deadline')}</span></div>
    <div class="menu frame ${state.menu ? 'on' : ''}">
      ${others.map(x => { const d = dueOf(x), m = d ? d - NOW : null;
        return `<button class="c-${x.type} ${red(m) ? 'red' : ''}" data-trackid="${esc(relOf(x))}">${svg(TYPE_IC[x.type])}<span>${esc(x.title)}</span><span>${d ? countdown(m) : '—'}</span></button>`; }).join('')}
      ${q.tracked ? `<div class="sep"></div><button data-untrack>${svg(IC.swap)}<span>${T('untrack_all')}</span><span></span></button>` : ''}
    </div>`;
  document.body.style.setProperty('--focus-h', el.offsetHeight + 'px');
}

function renderRail() {
  const src = state.view === 'journal' ? JOURNAL : QUESTS;
  const byGuild = src.filter(q => !state.guild || guildOf(q) === state.guild);
  const byType = src.filter(q => state.type === 'all' || q.type === state.type);
  const n = v => String(v).padStart(2, '0');
  const guilds = src.some(q => guildOf(q) === 'none') ? [...guildList(), G('none')] : guildList();
  const fs = favs(), shown = focusQuest();
  $('#rail').innerHTML =
    `<div class="label">${T('favorites')}<span class="cnt ${fs.length > CFG.favoritesMax ? 'over' : ''}">${fs.length} / ${CFG.favoritesMax}</span></div>` +
    (fs.length ? fs.map(q => {
      const d = dueOf(q), m = d ? d - NOW : null, cur = current(q);
      return `<button class="fav c-${q.type} ${q === shown ? 'on' : ''}" data-open="${esc(relOf(q))}">${svg(IC.star_f)}<span class="nm">${esc(q.title)}</span>
        <span class="cd ${red(m) ? 'red' : ''}">${d ? countdown(m) : '—'}</span><span class="o1">▸ ${cur ? esc(cur.o.t) : '—'}</span></button>`;
    }).join('') : `<div class="fav-empty">${T('fav_empty', CFG.favoritesMax)}</div>`) +
    `<div class="label">${T('type')}</div>` +
    ['all', 'main', 'side', 'activity'].map(t => {
      const c = t === 'all' ? byGuild.length : byGuild.filter(q => q.type === t).length;
      return `<button class="fbtn c-${t} ${state.type === t ? 'on' : ''} ${c ? '' : 'zero'}" data-type="${t}">${svg(TYPE_IC[t])}<span class="nm">${T(t)}</span><span class="n">${n(c)}</span></button>`;
    }).join('') +
    `<div class="label">${T('guilds')}</div>` +
    guilds.map(g => {
      const c = byType.filter(q => guildOf(q) === g.id).length;
      return `<button class="fbtn guild ${state.guild === g.id ? 'on' : ''} ${c ? '' : 'zero'}" data-guild="${esc(g.id)}">${svg(emblem(g))}<span class="nm">${esc(g.name)}${g.motto ? `<span class="mt">${esc(g.motto)}</span>` : ''}</span><span class="n">${n(c)}</span></button>`;
    }).join('') +
    `<div class="foot">${T('rail_foot')}</div>`;
}

function renderList() {
  const qs = visible(QUESTS).sort(byDue);
  if (!qs.find(q => relOf(q) === state.sel)) state.sel = qs[0] && relOf(qs[0]);
  const groups = state.type === 'all' ? ['main', 'side', 'activity'] : [state.type];
  $('#list').innerHTML = `<div class="list-head"><h2>${state.guild ? esc(G(state.guild).name) : T(state.type)}</h2><span>${T('shown', qs.length)}</span></div>` +
    groups.map(t => {
      const items = qs.filter(q => q.type === t);
      if (!items.length) return '';
      return (state.type === 'all' ? `<div class="group-h c-${t}">${svg(TYPE_IC[t])}${T(t)}</div>` : '') + items.map(row).join('');
    }).join('');
}

const starBtn = q => `<button class="star ${q.favorite ? 'on' : ''}" data-fav="${esc(relOf(q))}" title="${T(q.favorite ? 'b_unfav' : 'b_fav')}">${svg(q.favorite ? IC.star_f : IC.star)}</button>`;

function row(q) {
  const due = dueOf(q), ms = due ? due - NOW : null, cur = current(q);
  let dueHtml;
  if (q.type === 'activity') dueHtml = `<small>${T('next')}</small>${due ? countdown(ms) : '—'}`;
  else if (ms === null) dueHtml = `<small>${T('deadline')}</small>—`;
  else dueHtml = `<small>${ms < 0 ? T('overdue') : T('deadline')}</small>${countdown(ms)}`;
  const sd = stepDue(cur?.o), sdHtml = sd ? ` <span class="sdue ${red(sd - NOW) ? 'red' : ''}">${svg(IC.clock)}${dateOnly(sd)}</span>` : '';
  const sub = q.type === 'activity' ? `${repeatLabel(q)} · ${T('streak', streak(q))}` : `<b>▸</b> ${cur ? esc(cur.o.t) : '—'}${sdHtml}`;
  return `<div class="q c-${q.type} ${urgency(ms)} ${relOf(q) === state.sel ? 'sel' : ''}" data-q="${esc(relOf(q))}">
    <div class="bar-t"></div>${svg(TYPE_IC[q.type])}
    <div><h3>${svg(emblem(G(guildOf(q))))}${esc(q.title)}${q.tracked ? `<span class="pin">${T('tracked').toUpperCase()}</span>` : ''}${starBtn(q)}</h3><p>${sub}</p>${q.type === 'activity' ? '' : ticks(q)}</div>
    <div class="due">${dueHtml}</div></div>`;
}

function renderDetail() {
  const q = QUESTS.find(x => relOf(x) === state.sel);
  if (!q) { $('#detail').innerHTML = ''; return; }
  const g = G(guildOf(q)), cur = current(q), due = dueOf(q), isAct = q.type === 'activity', parent = parentOf(q);
  let deadline = '';
  if (due) {
    const ms = due - NOW, start = isAct || !q.created ? P(dkey(due) + ' 00:00') : P(q.created);
    const pos = t => Math.max(0, Math.min(1, (t - start) / (due - start))) * 100, pct = pos(NOW), s = !isAct && sLine(q);
    deadline = `<div class="deadline frame">
      <div><div class="label">${ms < 0 ? T('time_over') : T('time_left')}</div><div class="big ${red(ms) ? 'red' : ''}">${dur(ms)}</div></div>
      <div><div class="tl"><div class="track"></div><div class="fill" style="width:${pct}%"></div>
        <div class="mk" style="left:${pct}%"><span>${T('now')}</span></div>${s ? `<button class="mk s" data-sline style="left:${pos(s)}%" title="${T('s_set')}"><span>S · ${fmt(s, { month: 'short', day: 'numeric' })}</span></button>` : ''}</div>
        <div class="tl-ends"><span>${isAct ? '' : T('accepted') + ' ' + dateOnly(start)}</span><span>${T('due')} ${dateOnly(due)}</span></div></div>
      <div class="dl-date">${T(isAct ? 'next' : 'deadline')}<b>${fmt(due, { month: 'short', day: 'numeric' })}</b>${fmt(due, { weekday: 'short' })} ${hm(due)}</div></div>`;
  }
  const tags = [`<span class="tag c">${T(q.status)}</span>`];
  if (META.get(q).clash) tags.push(`<span class="tag" style="color:var(--danger)">${T('id_clash')}</span>`);
  if (q.tracked) tags.push(`<span class="tag c">${T('tracked')}</span>`);
  if (q.favorite) tags.push(`<span class="tag c">${T('favorite')}</span>`);
  if (isAct) tags.push(`<span class="tag">${T('repeats')}: ${repeatLabel(q)}</span>`, `<span class="tag">${T('streak', streak(q))}</span>`);
  else if (q.created) tags.push(`<span class="tag">${T('accepted')} ${stamp(P(q.created))}</span>`);
  const xp = xpOf(q);
  $('#detail').innerHTML = `
    <div class="head-row c-${q.type}"><div>
      <div class="crumb"><b>${svg(TYPE_IC[q.type])}<select class="typesel" data-typesel title="${T('change_type')}">${['main', 'side', 'activity'].map(t =>
        `<option value="${t}" ${t === q.type ? 'selected' : ''}>${T(t + '_q').toUpperCase()}</option>`).join('')}</select></b>//<span>${esc(q.id).toUpperCase()}</span>${q.parent
        ? `//<span class="partof">${T('part_of')} <button ${goAttr(parent)}>${svg(IC.link)}${parent ? esc(parent.title) : '—'}</button></span>` : ''}</div>
      <h1>${esc(q.title)}</h1><div class="tags">${tags.join('')}</div></div>
      <div class="emblem"><div class="hexclip">${svg(emblem(g))}</div><small>${T('issued_by')}</small><b>${esc(g.name)}</b></div></div>
    ${deadline}
    <div><div class="label">${T('briefing')}</div><p class="prose ${q.briefing ? '' : 'empty'}" style="margin-top:12px;white-space:pre-line">${q.briefing ? esc(q.briefing) : T('no_briefing')}</p></div>
    <div class="cols c-${q.type}">
      <div><div class="label">${T('objectives')}</div><ul class="obs">${q.objectives.map((x, i) => obRows(q, x, [i], cur)).join('')}</ul>
        <button class="addob" data-add>${T('add_obj')}</button></div>
      <div class="crit"><div class="label">${T('criteria')}</div><ul class="obs">${q.criteria.map((c, i) =>
        `<li class="ob ${c.met ? 'done' : ''}" data-crit="${i}" style="cursor:pointer">${svg(c.met ? IC.crit_done : IC.crit_open)}<div class="tx"><span>${esc(c.t)}</span></div><time></time></li>`).join('')}</ul>
        <div class="reward frame">${isAct
          ? `<div><small>${T('per_run')}</small><b>+${xp} XP</b></div>`
          : `<div><small>${T('grade_x', 'A')}${due ? ' · ' + dateOnly(due) : ''}</small><b>+${xp} XP</b></div><div><small>${T('grade_x', 'S')}${sLine(q) ? ' · ' + dateOnly(sLine(q)) : ''}</small><b class="s">+${Math.round(xp * CFG.gradeMultiplier.S)} XP</b></div>`}</div></div>
    </div>
    <div class="actions">
      <button class="btn ${q.tracked ? '' : 'primary'}" data-track><kbd>${keyLabel(CFG.keys.track)}</kbd>${T(q.tracked ? 'b_untrack' : 'b_track')}</button>
      <button class="btn" data-fav="${esc(relOf(q))}"><kbd>${keyLabel(CFG.keys.favorite)}</kbd>${T(q.favorite ? 'b_unfav' : 'b_fav')}</button>
      <button class="btn" data-complete><kbd>${keyLabel(CFG.keys.complete)}</kbd>${T('b_complete')}</button>
      <button class="btn" data-logentry><kbd>${keyLabel(CFG.keys.logEntry)}</kbd>${T('b_log')}</button>
      <button class="btn" data-md><kbd>${keyLabel(CFG.keys.markdown)}</kbd>${T('b_md')}</button>
      ${isAct ? '' : `<button class="btn" data-abandon>${svg(IC.dropped)}${T('b_abandon')}</button>`}
      <span class="path">${esc(relOf(q))}</span></div>`;
  // When the Now and S labels would overlap, each turns away from the other.
  const nowMk = $('#detail .tl .mk:not(.s)'), sMk = $('#detail .tl .mk.s');
  if (nowMk && sMk) {
    const a = nowMk.firstElementChild.getBoundingClientRect(), b = sMk.firstElementChild.getBoundingClientRect();
    if (a.left < b.right && b.left < a.right) {
      const sFirst = sMk.offsetLeft <= nowMk.offsetLeft;
      sMk.classList.add(sFirst ? 'to-left' : 'to-right');
      nowMk.classList.add(sFirst ? 'to-right' : 'to-left');
    }
  }
}

function obRows(q, x, path, cur, sub = false) {
  const isCur = cur && cur.o === x, c = child(x);
  const tags = [];
  if (x.any) tags.push(`<em class="any">${svg(IC.branch)}${T('any_one')}</em>`);
  if (x.added && x.s === 'open') tags.push(`<em class="new">${T('new')}</em>`);
  if (isCur) tags.push(`<em class="cur">${T('current')}</em>`);
  if (x.due) {
    const d = P(x.due), late = q.deadline && d > P(q.deadline);
    tags.push(`<em class="due ${x.s === 'open' && red(d - NOW) ? 'red' : ''} ${late ? 'warn' : ''}" ${late ? `title="${T('due_after')}"` : ''}>${svg(IC.clock)}${stamp(d)}</em>`);
  }
  if (c) {
    const cd = P(c.deadline);
    tags.push(`<em class="link">${svg(IC.link)}${T('linked')}</em>`);
    if (cd && x.s === 'open') tags.push(`<em class="due ${red(cd - NOW) ? 'red' : ''}">${svg(IC.clock)}${stamp(cd)}</em>`);
  }
  const note = x.note ? `<small class="note">— ${esc(x.note)}</small>` : '';
  const kids = c ? `<span class="kid">${ticks(c)}<span>${c.objectives.filter(y => y.s !== 'open').length} / ${c.objectives.length}</span></span>` : '';
  const canSplit = !q.parent && !x.link && !x.any;
  const meta = x.s !== 'open' ? (x.sub ? `<time title="${T(x.s)}">${stamp(P(x.at))}</time>`
      : `<div class="meta-r"><time title="${T(x.s)}">${stamp(P(x.at))}</time><div class="acts"><button data-reopen>${svg(IC.swap)}${T('reopen')}</button></div></div>`)
    : !x.sub ? `<div class="acts">
        <button class="ok" data-set="done">${svg(IC.done)}${T('a_done')}</button>
        ${c ? '' : `<button class="no" data-set="failed">${svg(IC.failed)}${T('a_fail')}</button>`}
        <button data-set="dropped">${svg(IC.dropped)}${T('a_drop')}</button>
        ${c ? '' : `<button data-sdue title="${T('a_due')}">${svg(IC.clock)}</button>`}
        ${canSplit ? `<button data-split title="${T('a_split')}">${svg(IC.link)}</button>` : ''}</div>` : '<span></span>';
  const text = c ? `<button class="lk" ${goAttr(c)}>${esc(x.t)}</button>` : esc(x.t);
  return `<li class="ob ${x.s} ${sub ? 'sub' : ''} ${isCur ? 'cur' : ''}" data-path="${path.join('.')}">
    ${svg(x.s === 'open' && x.added ? IC.new : x.s === 'open' && c ? IC.link : IC[x.s])}<div class="tx"><span>${text}</span>${tags.join('')}${note}${kids}</div>${meta}</li>` +
    (x.sub ? x.sub.map((y, j) => obRows(q, y, [...path, j], cur, true)).join('') : '');
}

// ---------------------------------------------------------------- calendar (§2.3)
// Short name for calendar chips (§1): the quest's own, else the start of its title.
const shortOf = q => (q.short || q.title).slice(0, CFG.shortNameMax);
const dayOf = s => s.slice(0, 10);
function renderCal() {
  const month = state.month, [y, mo] = month.split('-').map(Number), lastDay = new Date(y, mo, 0).getDate();
  const first = `${month}-01`, last = `${month}-${pad(lastDay)}`, dow = k => P(k + ' 12:00').getDay(), ws = state.weekStart;
  const lead = (dow(first) - ws + 7) % 7, trail = 6 - (dow(last) - ws + 7) % 7;
  const steps = state.calMode !== 'quests', closed = state.calMode === 'everything';
  const days = [...Array(lead + lastDay + trail)].map((_, i) => addDays(first, i - lead));
  const today = dkey(NOW), maxChips = days.length > 35 || innerHeight < 820 ? 2 : 3;
  const map = Object.fromEntries(days.map(k => [k, { evs: [], marks: [] }]));
  const add = (k, kind, sort, html) => { if (map[k]) map[k][kind].push([sort, html]); };

  for (const q of visible(QUESTS)) {
    const r = esc(relOf(q));
    if (q.type === 'activity') {
      const done = new Set(q.completions.map(dayOf));
      days.forEach(k => {
        if (!occurs(q, k)) return;
        const st = done.has(k) ? 'done' : k < today ? 'miss' : 'todo';
        if (st !== 'todo' && !closed) return;
        add(k, 'marks', 1, `<button class="mk-act ${st}" data-pop="a|${r}|${k}">${svg(IC['act_' + st])}</button>`);
      });
      continue;
    }
    if (q.deadline) {
      const due = P(q.deadline);
      add(dayOf(q.deadline), 'evs', +due, `<button class="ev c-${q.type} ${urgency(due - NOW)}" data-pop="q|${r}"><time>${hm(due)}</time>${svg(emblem(G(guildOf(q))))}<span>${esc(shortOf(q))}</span></button>`);
    }
    if (steps) leaves(q).forEach(({ o: x, path }) => {
      const spec = `o|${r}|${path.join('.')}`;
      if (x.due && x.s === 'open') {
        const d = P(x.due);
        add(dayOf(x.due), 'evs', +d, `<button class="ev sdchip c-${q.type} ${urgency(d - NOW)}" data-pop="${spec}"><time>${hm(d)}</time>${svg(IC.clock)}<span>${esc(x.t)}</span></button>`);
      }
      if (x.at && x.s !== 'open') add(dayOf(x.at), 'marks', 0, `<button class="mk-${x.s}" data-pop="${spec}">${svg(IC[x.s])}</button>`);
      if (x.added) add(dayOf(x.added), 'marks', 0, `<button class="mk-new" data-pop="${spec}">${svg(IC.new)}</button>`);
    });
  }
  if (closed) for (const j of visible(JOURNAL)) {
    const r = esc(relOf(j));
    if (j.completed) {
      const e = P(j.completed);
      add(dayOf(j.completed), 'evs', +e, `<button class="ev fin c-${j.type}" data-pop="j|${r}">${svg(IC.finish)}${svg(emblem(G(guildOf(j))))}<span>${esc(shortOf(j))}</span><b>${j.grade || '✕'}</b></button>`);
    }
    leaves(j).forEach(({ o: x }) => {
      if (x.at && x.s !== 'open') add(dayOf(x.at), 'marks', 0, `<button class="mk-${x.s}" data-pop="j|${r}">${svg(IC[x.s])}</button>`);
      if (x.added) add(dayOf(x.added), 'marks', 0, `<button class="mk-new" data-pop="j|${r}">${svg(IC.new)}</button>`);
    });
  }

  const cells = days.map(k => {
    const c = map[k], evs = c.evs.sort((a, b) => a[0] - b[0]).map(e => e[1]);
    const shown = evs.length > maxChips ? evs.slice(0, maxChips - 1) : evs;
    const more = evs.length > maxChips ? `<button class="ev more" data-pop="d|${k}">${T('more', evs.length - shown.length)}</button>` : '';
    return `<div class="day ${k.slice(0, 7) !== month ? 'out' : ''} ${k === today ? 'today' : ''}">
      <div class="num"><span>${fmt(P(k + ' 12:00'), { day: 'numeric' })}</span><div class="marks">${c.marks.sort((a, b) => a[0] - b[0]).map(m => m[1]).join('')}</div></div>${shown.join('')}${more}</div>`;
  }).join('');
  state.calDays = map;
  $('#v-cal').innerHTML = `
    <div class="cal-head"><button class="nav-btn" data-cal="-1">‹</button><h2>${fmt(P(first + ' 12:00'), { month: 'long', year: 'numeric' })}</h2>
      <button class="nav-btn" data-cal="1">›</button><button class="nav-btn" data-cal="0">${T('today')}</button>
      <div class="seg">${['quests', 'steps', 'everything'].map(m => `<button class="${state.calMode === m ? 'on' : ''}" data-calmode="${m}">${T('cm_' + (m === 'everything' ? 'all' : m))}</button>`).join('')}</div></div>
    <div class="wds">${days.slice(0, 7).map(k => `<div>${fmt(P(k + ' 12:00'), { weekday: 'short' })}</div>`).join('')}</div>
    <div class="grid">${cells}</div>
    <div class="legend">
      <span style="color:var(--main)">${svg(TYPE_IC.main)}${T('main')}</span>
      <span style="color:var(--side)">${svg(TYPE_IC.side)}${T('side')}</span>
      <span style="color:var(--act)">${svg(TYPE_IC.activity)}${T('activity')}</span>
      <span>│</span>${steps ? `
      <span>${svg(IC.clock)}${T('lg_step')}</span>
      <span><i class="mk-done">${svg(IC.done)}</i>${T('done')}</span>
      <span><i class="mk-failed">${svg(IC.failed)}</i>${T('failed')}</span>
      <span><i class="mk-dropped">${svg(IC.dropped)}</i>${T('dropped')}</span>
      <span><i class="mk-new">${svg(IC.new)}</i>${T('new')}</span>` : ''}
      <span><i class="mk-act">${svg(IC.act_done)}</i><i class="mk-act todo">${svg(IC.act_todo)}</i><i class="mk-act miss">${svg(IC.act_miss)}</i>${T('lg_act')}</span>
    </div>`;
}

// Preview card for any calendar item (§2.3): "kind|file|detail".
function popHtml(spec) {
  const [kind, rel, extra] = spec.split('|');
  if (kind === 'd') return `<div class="crumb"><span>${longDate(P(rel + ' 12:00'))}</span></div><div class="list">${state.calDays[rel].evs.map(e => e[1]).join('')}</div>`;
  const q = byRel(rel);
  if (!q) return '';
  const g = G(guildOf(q)), r = esc(rel), open = `<button class="btn sm" ${goAttr(q)}>${T('b_open')}</button>`;
  if (kind === 'q') {
    const cur = current(q), due = dueOf(q), ms = due - NOW, doneN = q.objectives.filter(x => x.s !== 'open').length;
    return `<div class="crumb c-${q.type}"><b>${svg(TYPE_IC[q.type])}${T(q.type + '_q').toUpperCase()}</b>//<span style="display:inline-flex;gap:5px;align-items:center">${svg(emblem(g))}${esc(g.name)}</span></div>
      <h4>${esc(q.title)}</h4><p class="cur c-${q.type}"><b>▸</b> ${cur ? esc(cur.o.t) : '—'}</p>
      <div class="due-row"><span>${svg(IC.clock)}${longDate(due)} · ${hm(due)}</span><b class="${red(ms) ? 'red' : ''}">${countdown(ms)}</b></div>
      <div class="meta c-${q.type}">${ticks(q)}<span>${doneN} / ${q.objectives.length}</span></div>
      <div class="actions">${q.tracked ? '' : `<button class="btn sm primary" data-trackid="${r}">${T('b_track')}</button>`}${open}</div>`;
  }
  if (kind === 'o') {
    const x = objAt(q, extra.split('.').map(Number));
    if (x.s === 'open' && x.due) {
      const d = P(x.due), m = d - NOW;
      return `<div class="crumb c-${q.type}"><b>${svg(IC.clock)}${T('lg_step').toUpperCase()}</b></div><h4>${esc(x.t)}</h4>
        <div class="due-row"><span>${svg(IC.clock)}${longDate(d)} · ${hm(d)}</span><b class="${red(m) ? 'red' : ''}">${countdown(m)}</b></div>
        <div class="meta">${svg(TYPE_IC[q.type])}<span>${esc(q.title)}</span></div><div class="actions">${open}</div>`;
    }
    const st = x.s === 'open' && x.added ? 'new' : x.s, when = x.s === 'open' ? x.added : x.at;
    const color = { done: 'var(--main)', failed: 'var(--danger)', dropped: 'var(--dim)', new: 'var(--side)' }[st];
    return `<div class="crumb"><b style="color:${color}">${svg(IC[st])}${T(st).toUpperCase()}</b>//<span>${stamp(P(when))}</span></div>
      <h4>${esc(x.t)}</h4>${x.note ? `<p class="note">— ${esc(x.note)}</p>` : ''}
      <div class="meta">${svg(TYPE_IC[q.type])}<span>${esc(q.title)}</span></div><div class="actions">${open}</div>`;
  }
  if (kind === 'a') {
    const today = dkey(NOW), st = q.completions.some(d => dayOf(d) === extra) ? 'done' : extra < today ? 'missed' : 'due';
    const color = { done: 'var(--act)', missed: 'var(--danger)', due: 'var(--dim)' }[st];
    return `<div class="crumb c-activity"><b>${svg(TYPE_IC.activity)}${T('activity_q').toUpperCase()}</b>//<span style="color:${color}">${T('act_' + st).toUpperCase()}</span></div>
      <h4>${esc(q.title)}</h4>
      <div class="due-row"><span>${svg(IC.clock)}${longDate(P(extra + ' 12:00'))}</span><b>${T('streak', streak(q))}</b></div>
      <div class="meta">${repeatLabel(q)} · +${xpOf(q)} XP</div>
      <div class="actions">${st !== 'done' && extra <= today ? `<button class="btn sm primary" data-actdone="${r}|${extra}">${T('mark_done')}</button>` : ''}${open}</div>`;
  }
  if (kind === 'j') {
    const ok = q.status === 'complete', end = P(q.completed);
    return `<div class="crumb c-${q.type}"><b>${svg(TYPE_IC[q.type])}${T(ok ? 'completed' : 'abandoned').toUpperCase()}</b>//<span style="display:inline-flex;gap:5px;align-items:center">${svg(emblem(g))}${esc(g.name)}</span></div>
      <h4>${esc(q.title)}</h4>
      <div class="due-row"><span>${svg(IC.finish)}${end ? longDate(end) + ' · ' + hm(end) : '—'}</span><b class="g ${ok ? q.grade : 'X'}">${ok ? T('grade_x', q.grade) : T('abandoned').toUpperCase()}</b></div>
      ${ok && q.awarded ? `<div class="meta">+${num(q.awarded)} XP</div>` : ''}
      <div class="actions"><button class="btn sm" data-openj="${r}">${T('open_journal')}</button></div>`;
  }
  return '';
}
function openPop(spec, el) {
  const p = $('#pop');
  p.innerHTML = popHtml(spec);
  p.classList.add('on');
  const r = el.getBoundingClientRect(), w = p.offsetWidth, h = p.offsetHeight;
  let top = r.bottom + 6;
  if (top + h > innerHeight - 12) top = Math.max(12, r.top - h - 6);
  p.style.left = Math.max(12, Math.min(r.left, innerWidth - w - 12)) + 'px';
  p.style.top = top + 'px';
}
const closePop = () => $('#pop').classList.remove('on');
// Marks an activity's run done on a past day or today, from the calendar.
function markRun(q, day) {
  act([q], () => { q.completions.push(day); q.completions.sort(); });
  toast(T('t_act'), `${q.title} · +${xpOf(q)} XP`, 'var(--act)', { kind: 'done', q });
}

// ---------------------------------------------------------------- journal (§2.3)
// A closed quest's timeline, replayed from its file: accepted, each step's stamps, the log, and the close.
function timeline(j) {
  const ev = [], order = { start: 0, finish: 2 };
  if (j.created) ev.push([j.created, 'start', null, 'ev_accepted']);
  for (const o of j.objectives) for (const [x, label] of o.sub ? o.sub.map(c => [c, `${o.t} → ${c.t}`]) : [[o, o.t]]) {
    if (x.added) ev.push([x.added, 'new', label]);
    if (x.at && x.s !== 'open') ev.push([x.at, x.s, label, x.note]);
  }
  // A log heading that isn't a date still shows, at the end, under its own heading.
  for (const e of j.log) ev.push(/^\d{4}-\d{2}-\d{2}( \d{1,2}:\d{2})?$/.test(e.head || '') ? [e.head, 'log', e.text] : [null, 'log', e.text, null, e.head]);
  if (j.completed) ev.push([j.completed, 'finish', null, j.status === 'abandoned' ? 'ev_abandoned' : META.get(j).by === 'file' ? 'ev_complete_file' : 'ev_complete']);
  const t = e => e[0] ? +P(e[0]) : Infinity;
  return ev.sort((a, b) => t(a) - t(b) || (order[a[1]] ?? 1) - (order[b[1]] ?? 1));
}
function renderJournal() {
  const js = visible(JOURNAL).sort((a, b) => (b.completed || '').localeCompare(a.completed || ''));
  if (!js.find(j => relOf(j) === state.jsel)) state.jsel = js[0] && relOf(js[0]);
  $('#entries').innerHTML = `<div class="list-head"><h2>${T('tab_journal')}</h2><span>${T('entries', js.length)}</span></div>` +
    js.map(j => `<div class="entry c-${j.type} ${relOf(j) === state.jsel ? 'sel' : ''}" data-j="${esc(relOf(j))}">${svg(TYPE_IC[j.type])}
      <time>${svg(emblem(G(guildOf(j))))}${j.completed ? fmt(P(j.completed), { year: 'numeric', month: '2-digit', day: '2-digit' }) : '—'} · ${esc(G(guildOf(j)).name)}</time>
      <h3>${esc(j.title)}</h3><span class="g ${j.status === 'complete' ? j.grade : 'X'}">${j.status === 'complete' ? j.grade || '—' : T('abandoned').toUpperCase()}</span></div>`).join('');
  const j = JOURNAL.find(x => relOf(x) === state.jsel);
  if (!j) { $('#page').innerHTML = ''; return; }
  const g = G(guildOf(j)), end = P(j.completed), parent = parentOf(j), ls = leaves(j), n = s => ls.filter(l => l.o.s === s).length;
  const taken = end && j.created ? end - P(j.created) : null, delta = end && j.deadline ? P(j.deadline) - end : null;
  // Steps finished after their own deadline (§1.2.1)
  const late = ls.filter(({ o }) => o.s === 'done' && o.due && o.at && P(o.at) > P(o.due)).length;
  const tones = { done: 'var(--main)', failed: 'var(--danger)', dropped: 'var(--faint)', new: 'var(--side)', log: 'var(--dim)', start: 'var(--text)', finish: 'var(--text)' };
  $('#page').innerHTML = `
    <div class="crumb c-${j.type}"><b>${svg(TYPE_IC[j.type])}${T(j.type + '_q').toUpperCase()}</b>//<span style="display:inline-flex;gap:6px;align-items:center">${svg(emblem(g))}${esc(g.name)}</span>//<span>${T(j.status === 'complete' ? 'completed' : 'abandoned').toUpperCase()} ${stamp(end)}</span>${j.parent
      ? `//<span class="partof">${T('part_of')} <button ${goAttr(parent)}>${svg(IC.link)}${parent ? esc(parent.title) : '—'}</button></span>` : ''}</div>
    <h1>${esc(j.title)}</h1>
    <div class="strip">
      <div><span>${T('grade_x', '').trim()}</span><b class="g ${j.grade || 'X'}">${j.grade || '—'}</b></div>
      <div><span>${T('time_taken')}</span><b>${taken === null ? '—' : dur(taken)}</b></div>
      <div><span>${T('vs_deadline')}</span><b style="color:${delta === null ? 'var(--dim)' : delta >= 0 ? 'var(--act)' : 'var(--danger)'}">${delta === null ? '—' : T(delta >= 0 ? 'early' : 'late', dur(delta))}</b></div>
      <div><span>${T('obj_tally')}</span><b>${n('done')}<span style="display:inline;color:var(--danger);font-size:14px;letter-spacing:0"> · ${n('failed')}✕</span><span style="display:inline;color:var(--faint);font-size:14px;letter-spacing:0"> · ${n('dropped')}–</span>${late
        ? `<span style="display:inline;color:var(--side);font-size:14px;letter-spacing:0"> · ${T('late', late)}</span>` : ''}</b></div>
      <div><span>XP</span><b style="color:var(--main)">${j.awarded ? '+' + num(j.awarded) : '—'}</b></div></div>
    <div class="label">${T('briefing')}</div><p class="prose ${j.briefing ? '' : 'empty'}" style="white-space:pre-line">${j.briefing ? esc(j.briefing) : T('no_briefing')}</p>
    <div class="label">${T('debrief')}</div><p class="prose ${j.debrief ? '' : 'empty'}" style="white-space:pre-line">${j.debrief ? esc(j.debrief) : T('no_debrief')}</p>
    <div class="label">${T('timeline')}</div>
    <ul class="timeline">${timeline(j).map(([at, k, text, extra, head]) => {
      const label = k === 'start' || k === 'finish' ? '' : `<b style="color:${tones[k]}">${T(k === 'log' ? 'ev_log' : k)}</b>`;
      const body = text !== null ? esc(text) : T(extra), note = text !== null && extra ? `<span class="note"> — ${esc(extra)}</span>` : '';
      return `<li class="${k}"><span style="color:${tones[k]}">${svg(IC[k])}</span><time>${at ? stamp(P(at)) : esc(head)}${label}</time><p>${k === 'log' ? '“' + body + '”' : body}${note}</p></li>`;
    }).join('')}</ul>
    ${linkedList(j)}
    <div class="actions" style="margin-top:22px"><button class="btn" data-reopenq="${esc(relOf(j))}">${svg(IC.swap)}${T('reopen_q')}</button></div>
    <div class="file">${T('source')} <b>${esc(relOf(j))}</b> · ${T('readable')}</div>`;
}
// A closed quest's linked quests, each reachable wherever it now lives
function linkedList(j) {
  const kids = [...QUESTS, ...JOURNAL].filter(x => x.parent === j.id);
  if (!kids.length) return '';
  const st = k => OPEN.includes(k.status) ? T('active') : k.status === 'complete' ? `${T('completed')} · ${T('grade_x', k.grade)}` : T('abandoned');
  return `<div class="label">${T('linked_quests')}</div><ul class="links">${kids.map(k =>
    `<li class="c-${k.type}"><button ${goAttr(k)}>${svg(IC.link)}${esc(k.title)}</button><span>${st(k)}</span></li>`).join('')}</ul>`;
}
// Reopen (§1.1): the quest is active again and its file moves back to quests/; the server takes back its XP and logs the reopen.
function reopenQuest(q) {
  act([q], () => { q.status = 'active'; }).then(saved => { if (saved) { Object.assign(state, { view: 'log', sel: saved.rel, type: 'all', guild: null }); render(); } });
  toast(T('t_reopen_q'), q.title, 'var(--main)', { kind: 'new', q });
}

// ---------------------------------------------------------------- player page (§2.3): sums of player.json buckets
function periods() {
  const today = dkey(NOW), weekFrom = addDays(today, -((P(today + ' 12:00').getDay() - state.weekStart + 7) % 7));
  return { today: k => k === today, week: k => k >= weekFrom && k <= today, month: k => k.slice(0, 7) === today.slice(0, 7), year: k => k.slice(0, 4) === today.slice(0, 4) };
}
function sumOver(test, pick) {
  let n = 0;
  for (const [day, gs] of Object.entries(PLAYER.days)) if (test(day)) for (const [g, b] of Object.entries(gs)) n += pick(g, b) || 0;
  return n;
}
function renderPlayer() {
  const ps = periods(), cols = ['today', 'week', 'month', 'year'], { lv, xp, need } = level();
  const cell = (pick, xpPick) => cols.map(c => { const v = sumOver(ps[c], pick), x = xpPick && sumOver(ps[c], xpPick);
    return `<td class="${v ? '' : 'z'}">${num(v)}${xpPick && v ? `<small>${num(x)} XP</small>` : ''}</td>`; }).join('');
  // Guild rows: the listed guilds, then any guild id the stats hold that guilds.json doesn't list, then Unassigned.
  const ids = new Set(Object.values(PLAYER.days).flatMap(Object.keys));
  const rowsOf = [...guildList(), ...[...ids].filter(id => id !== 'none' && !guildList().some(g => g.id === id))
    .map(id => GUILDS.some(g => g.id === id) ? G(id) : { id, name: id, emblem: 'none' }), { ...G('none'), id: 'none' }];
  const rows = state.pby === 'type'
    ? ['main', 'side', 'activity'].map(t => `<tr><td><span class="rl c-${t}">${svg(TYPE_IC[t])}${T(t)}</span></td>${cell((g, b) => b[t])}</tr>`).join('') +
      `<tr><td><span class="rl" style="--c:var(--danger)">${svg(IC.failed)}${T('abandoned')}</span></td>${cell((g, b) => b.abandoned)}</tr>` +
      `<tr class="xp"><td><span class="rl">XP</span></td>${cell((g, b) => b.xp)}</tr>`
    : rowsOf.map(gd => `<tr><td><span class="rl">${svg(emblem(gd))}${esc(gd.name)}</span></td>${cell((g, b) => g === gd.id ? (b.main || 0) + (b.side || 0) + (b.activity || 0) : 0, (g, b) => g === gd.id ? b.xp : 0)}</tr>`).join('');
  $('#pview').innerHTML = `
    <div class="p-head"><div class="hexclip"><div><small>LV</small><strong>${pad(lv)}</strong></div></div>
      <div><h2>${T('player')}</h2><div class="xpgain"><div class="row"><span>XP ${num(xp)} / ${num(need)}</span><b>${T('to_next', num(need - xp))}</b></div><div class="bar"><i style="width:${xp / need * 100}%"></i></div></div></div>
      <div class="seg">${['type', 'guild'].map(b => `<button class="${state.pby === b ? 'on' : ''}" data-pby="${b}">${T('by_' + b)}</button>`).join('')}</div></div>
    <table class="ptable"><thead><tr><th></th>${cols.map(c => `<th>${T('p_' + c)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
    <div class="p-foot"><button class="btn sm" data-pexport>${T('export')}</button><button class="btn sm" data-pimport>${T('import')}</button>
      <span class="note">${T('numbers_only')}</span><button class="btn sm" data-fclose>${T('close')}</button></div>
    <div class="imp" id="imp"><p>${T('imp_q')}</p><div class="actions"><button class="btn sm primary" data-pimp="add">${T('imp_add')}</button>
      <button class="btn sm" data-pimp="replace">${T('imp_replace')}</button><button class="btn sm" data-pimpcancel>${T('cancel')}</button></div></div>`;
}
function openPlayer() { renderPlayer(); $('#pview').classList.add('on'); $('#drawer-back').classList.add('on'); }
const closeOverlays = () => ['#pview', '#drawer-back', '#drawer', '#mdview'].forEach(s => $(s).classList.remove('on'));
// Import asks first whether to add the file's numbers to these or replace them (§3.5); undo puts the old numbers back.
function pickPlayerFile() {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
  input.onchange = async () => {
    try { state.pimport = JSON.parse(await input.files[0].text()); $('#imp').classList.add('on'); }
    catch { toast(T('imp_bad'), input.files[0]?.name || '', 'var(--danger)', { undo: false }); }
  };
  input.click();
}
function importPlayer(mode) {
  const before = clone(PLAYER);
  $('#imp').classList.remove('on');
  run(async () => {
    await api('POST', '/api/player', { mode, player: state.pimport });
    pushUndo({ items: [], created: [], player: before });
    await reload();
    toast(T('t_imp_' + mode), 'player.json', 'var(--main)');
  });
}

// ---------------------------------------------------------------- getting quests in (§2.2)
// Every way in ends as a new file; undo removes it again.
function createQuest({ title, type = 'side', guild, due, target, short, briefing = '', objectives = [], criteria = [], repeat }) {
  const q = { title, type, status: 'active', briefing, debrief: '', objectives, criteria, completions: [], log: [] };
  if (guild && guild !== 'none') q.guild = guild;
  if (type === 'activity') q.repeat = repeat || { every: 1 };
  else { if (due) q.deadline = due; if (target) q.target = target; }
  if (short) q.short = short;
  const entry = pushUndo({ items: [], created: [] });
  toast(T('t_quest'), title, 'var(--main)', { kind: 'new' });
  return run(async () => {
    const saved = await persist([q], entry);
    Object.assign(state, { view: 'log', sel: saved.rel, type: 'all', guild: null });
    render();
  });
}

// Quick capture tokens: !main !side !act (type), #home (guild, by id or name), @11-02, @11-02 18:00, @2026-11-02, @+3d (deadline).
// A month and day already past this year means next year. A #word that names no guild stays in the title.
function parseCapture(s) {
  let type = 'side', guild, due;
  const today = dkey(new Date());
  s = s.replace(/(^|\s)@(\+\d+d|(?:\d{4}-)?\d{1,2}-\d{1,2})(?:\s+(\d{1,2}:\d{2}))?(?=\s|$)/, (all, sp, d, t) => {
    let day;
    if (d[0] === '+') day = addDays(today, parseInt(d.slice(1)));
    else {
      const p = d.split('-'), y = +today.slice(0, 4);
      day = normDate(p.length === 3 ? d : `${y}-${p[0]}-${p[1]}`);
      if (day && p.length === 2 && day < today) day = normDate(`${y + 1}-${p[0]}-${p[1]}`);
    }
    if (!day) return all;
    due = t ? normDate(`${day} ${t}`) || day : day;
    return sp;
  });
  s = s.replace(/(^|\s)!(main|side|act\w*)\b/i, (_, sp, t) => { type = { m: 'main', s: 'side', a: 'activity' }[t[0].toLowerCase()]; return sp; });
  s = s.replace(/(^|\s)#(\S+)/, (all, sp, g) => {
    const f = guildList().find(x => x.id.startsWith(g.toLowerCase()) || x.name.toLowerCase().startsWith(g.toLowerCase()));
    if (!f) return all;
    guild = f.id;
    return sp;
  });
  return { title: s.replace(/\s+/g, ' ').trim(), type, guild, due };
}
function renderCapPop() {
  const v = $('#cap').value, pop = $('#cap-pop');
  if (!v.trim()) {
    pop.innerHTML = `<div class="row" style="color:var(--text)">${T('cap_help')}</div>
      <div class="row"><code>!main</code><code>!side</code><code>!act</code>${T('cap_type')}</div>
      <div class="row">${guildList().slice(0, 4).map(g => `<code>#${esc(g.id)}</code>`).join('')}${T('cap_guild')}</div>
      <div class="row"><code>@11-02</code><code>@11-02 18:00</code><code>@+3d</code>${T('cap_due')}</div>
      <div class="hint">${T('cap_hint')}</div>`;
    return;
  }
  const p = parseCapture(v), g = G(p.guild), due = P(p.due);
  pop.innerHTML = `<div class="ttl">${p.title ? esc(p.title) : '…'}</div>
    <div class="chips"><span class="chip c-${p.type}">${svg(TYPE_IC[p.type])}${T(p.type + '_q')} · ${CFG.xp[p.type]} XP</span>
      <span class="chip">${svg(emblem(g))}${esc(g.name)}</span>
      <span class="chip">${svg(IC.clock)}${due ? `${longDate(due)} · ${hm(due)} · ${countdown(due - new Date())}` : T('no_deadline')}</span></div>
    <div class="hint">${T('cap_hint')}</div>`;
}

// The New quest drawer: Write (the form) and From AI / import.
function openForm(prefill = {}, tab = 'write') {
  const p = { title: '', type: 'side', guild: 'none', ...prefill };
  state.form = { type: p.type, guild: p.guild || 'none', prefill };
  const [date = '', time = ''] = p.due ? p.due.split(' ') : [];
  const head = `<h2>+ ${T('new_quest')}<kbd>${keyLabel(CFG.keys.close)}</kbd></h2>
    <div class="dtabs">${['write', 'ai'].map(t => `<button class="${t === tab ? 'on' : ''}" data-dtab="${t}">${T('tab_' + t)}</button>`).join('')}</div>`;
  $('#drawer').classList.toggle('wide', tab === 'ai');
  $('#drawer').classList.add('on');
  $('#drawer-back').classList.add('on');
  if (tab === 'ai') return openAi(head);
  $('#drawer').innerHTML = head + `
    <label class="fld"><span>${T('f_title')}</span><input class="big" id="f-title" value="${esc(p.title)}"></label>
    <div class="fld"><span>${T('f_type')}</span><div class="seg3">${['main', 'side', 'activity'].map(t =>
      `<button class="c-${t} ${t === state.form.type ? 'on' : ''}" data-ftype="${t}">${svg(TYPE_IC[t])}<span>${T(t)}</span><small>${CFG.xp[t]} XP</small></button>`).join('')}</div></div>
    <div class="fld"><span>${T('f_guild')}</span><div class="gg">${[...guildList(), G('none')].map(g =>
      `<button class="${g.id === state.form.guild ? 'on' : ''}" data-fguild="${esc(g.id)}">${svg(emblem(g))}${esc(g.name)}</button>`).join('')}</div></div>
    <div class="fld"><span>${T('f_deadline')}</span><div class="two"><input type="date" id="f-date" value="${date}"><input type="time" id="f-time" value="${time}"></div></div>
    <div class="fld"><span>${T('f_target')}<i>${T('f_target_i')}</i></span><div class="two"><input type="date" id="f-sdate"><input type="time" id="f-stime"></div></div>
    <label class="fld"><span>${T('f_short')}<i>${T('f_short_i')}</i></span><input id="f-short" maxlength="${CFG.shortNameMax}"></label>
    <label class="fld"><span>${T('f_briefing')}</span><textarea id="f-brief" rows="2"></textarea></label>
    <label class="fld"><span>${T('f_obj')}<i>${T('f_obj_i')}</i></span><textarea id="f-obj" rows="5" placeholder="${esc(T('obj_ph'))}"></textarea></label>
    <label class="fld"><span>${T('f_crit')}<i>${T('f_crit_i')}</i></span><textarea id="f-crit" rows="3"></textarea></label>
    <p class="err" id="f-err"></p>
    <div class="actions"><button class="btn primary" data-fsubmit>${T('f_accept')}</button><button class="btn" data-fclose>${T('f_cancel')}</button></div>`;
  setTimeout(() => $('#f-title')?.focus(), 0);
}
function submitForm() {
  const title = $('#f-title').value.trim(), crit = $('#f-crit').value.split('\n').map(s => s.trim()).filter(Boolean), type = state.form.type;
  if (!title) return $('#f-err').textContent = T('f_need_title');
  if (type === 'main' && !crit.length) return $('#f-err').textContent = T('f_need_crit');
  // One objective per line; a line indented by two spaces or a tab is a sub-objective of the line above.
  const objectives = [];
  for (const line of $('#f-obj').value.split('\n')) {
    if (!line.trim()) continue;
    const o = { t: line.trim(), s: 'open' };
    if (/^(\s{2,}|\t)/.test(line) && objectives.length) (objectives.at(-1).sub ??= []).push(o); else objectives.push(o);
  }
  // An activity runs on a schedule instead of a deadline, so it asks for one, as a type change does (§1.5).
  let repeat;
  if (type === 'activity') {
    const r = prompt(T('repeat_prompt'), 'daily');
    if (r === null) return;
    repeat = parseRepeat(r) || { every: 1 };
  }
  const at = (d, t) => d ? normDate(`${d}${t ? ' ' + t : ''}`) : undefined;
  createQuest({ title, type, guild: state.form.guild, due: at($('#f-date').value, $('#f-time').value), target: at($('#f-sdate').value, $('#f-stime').value),
    short: $('#f-short').value.trim(), briefing: $('#f-brief').value.trim(), objectives, criteria: crit.map(t => ({ t })), repeat });
  closeOverlays();
}

// From AI / import: the app writes the prompt from prompts/<lang>.md; any AI answers with quest files, which the server reads.
const PROMPTS = {};
async function promptFor(lang) {
  if (!(lang in PROMPTS)) PROMPTS[lang] = await fetch(`/prompts/${lang}.md`).then(r => r.ok ? r.text() : null);
  return PROMPTS[lang] ?? (lang === 'en' ? '' : promptFor('en'));
}
// Placeholders in a prompt file: {{now}} {{timezone}} {{short_max}} {{guilds}} {{example_deadline}} {{example_due}},
// and {{notes|text shown when there are none}}.
function fillPrompt(template, lang, notes) {
  const now = new Date(), off = -now.getTimezoneOffset(), sign = off >= 0 ? '+' : '-';
  const motto = g => { const raw = GUILDS.find(x => x.id === g.id); return raw.motto ?? LANGS[lang]?.['gm_' + g.id] ?? raw.name ?? g.name; };
  const vars = {
    now: `${dkey(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    timezone: `${Intl.DateTimeFormat().resolvedOptions().timeZone} (UTC${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)})`,
    short_max: CFG.shortNameMax,
    guilds: guildList().map(g => `  ${g.id} = ${motto(g)}`).join('\n'),
    // Example dates in the format sample, a little ahead of today so they look like real deadlines
    example_deadline: `${addDays(dkey(now), 14)}T10:00`, example_due: `${addDays(dkey(now), 10)} 18:00`,
    notes,
  };
  return template.replace(/\{\{(\w+)(?:\|([^}]*))?\}\}/g, (_, k, empty) => String(vars[k] || empty || ''));
}
function openAi(head) {
  $('#drawer').innerHTML = head + `
    <div class="step"><i><span>1</span></i><div><h3>${T('ai_s1')}</h3><p class="i">${T('ai_s1_i')}</p>
      <textarea id="ai-notes" rows="5" placeholder="${esc(T('ai_ph'))}"></textarea>
      <div class="row"><span class="i" style="font-size:13px;color:var(--dim)">${T('ai_lang')}</span>
        <select id="ai-lang">${Object.keys(LANGS).map(l => `<option value="${l}" ${l === state.lang ? 'selected' : ''}>${esc(LANGS[l].lang_name || l)}</option>`).join('')}</select></div></div></div>
    <div class="step"><i><span>2</span></i><div><h3>${T('ai_s2')}</h3><p class="i">${T('ai_s2_i')}</p>
      <textarea id="ai-prompt" class="code" rows="7" readonly></textarea>
      <div class="row"><button class="btn sm primary" data-aicopy>${T('copy')}</button></div></div></div>
    <div class="step"><i><span>3</span></i><div><h3>${T('ai_s3')}</h3><p class="i">${T('ai_s3_i')}</p>
      <textarea id="ai-answer" class="code drop" rows="7" placeholder="---&#10;questboard: 1&#10;title: …"></textarea>
      <div id="ai-preview"></div>
      <div class="actions" style="margin-top:14px"><button class="btn primary" data-aiaccept disabled></button><button class="btn" data-fclose>${T('f_cancel')}</button></div></div></div>`;
  const update = async () => { $('#ai-prompt').value = fillPrompt(await promptFor($('#ai-lang').value), $('#ai-lang').value, $('#ai-notes').value.trim()); };
  $('#ai-notes').addEventListener('input', update);
  $('#ai-lang').addEventListener('change', update);
  const ans = $('#ai-answer');
  let timer;
  ans.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(renderAiPreview, 250); });
  ans.addEventListener('dragover', e => { e.preventDefault(); ans.classList.add('over'); });
  ans.addEventListener('dragleave', () => ans.classList.remove('over'));
  ans.addEventListener('drop', async e => {
    e.preventDefault();
    ans.classList.remove('over');
    for (const f of e.dataTransfer.files) ans.value += (ans.value ? '\n\n' : '') + await f.text();
    renderAiPreview();
  });
  update();
  renderAiPreview();
}
// The server reads the answer (§2.2): unknown guild → Unassigned, bad date → no deadline, missing title → skipped.
async function renderAiPreview() {
  const text = $('#ai-answer')?.value ?? '';
  const { quests } = text.trim() ? await api('POST', '/api/parse', { text }) : { quests: [] };
  if (!$('#ai-preview')) return;
  const note = p => T(p.code, p.code === 'w_value' ? p.key : p.value);
  $('#ai-preview').innerHTML = quests.length ? quests.map(({ quest: q, problems, ok }) => {
    const due = P(q.deadline), g = G(guildOf(q));
    return `<div class="pcard c-${q.type} ${ok ? '' : 'bad'}"><div class="h">${svg(TYPE_IC[q.type])}${esc(q.title || '—')}</div>
      <div class="m">${T(q.type + '_q')} · ${esc(g.name)} · ${due ? longDate(due) + ' ' + hm(due) : T('no_deadline')} · ${T('objectives')} ${q.objectives.length} · ${T('criteria')} ${q.criteria.length}</div>
      ${problems.map(p => `<div class="w">• ${esc(note(p))}</div>`).join('')}</div>`;
  }).join('') : `<p class="i" style="color:var(--faint);margin-top:8px">${T('ai_none')}</p>`;
  const n = quests.filter(x => x.ok).length, btn = $('[data-aiaccept]');
  btn.disabled = !n;
  btn.textContent = T('ai_accept', n);
}
function acceptImport() {
  const text = $('#ai-answer').value, entry = pushUndo({ items: [], created: [] });
  closeOverlays();
  run(async () => {
    const { rels } = await api('POST', '/api/import', { text });
    entry.created.push(...rels);
    await reload();
    toast(T('t_imported'), rels.map(r => byRel(r)?.title).filter(Boolean).join(' · '), 'var(--main)', { kind: 'new' });
  });
}

// ---------------------------------------------------------------- Markdown view: the quest's own file
async function showMd(q) {
  const rel = relOf(q), { text } = await api('GET', '/api/file?rel=' + encodeURIComponent(rel));
  state.md = { rel, text };
  $('#mdview').innerHTML = `<h2>${T('md_title')}<span>${esc(rel)}</span></h2><pre>${esc(text)}</pre>
    <div class="actions"><button class="btn primary" data-mdcopy>${T('copy')}</button><button class="btn" data-mddl>${T('download')}</button>
      <button class="btn" data-mdopen>${T('b_open_editor')}</button><button class="btn" data-fclose>${T('close')}</button></div>`;
  $('#mdview').classList.add('on');
  $('#drawer-back').classList.add('on');
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast(T('copied'), '', 'var(--dim)', { undo: false }); } catch { /* clipboard blocked */ }
}
function download(name, text) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: 'text/markdown' })), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------------- keys
// Bindings come from config: a browser key name, an uppercase letter for Shift, "Mod+" for Ctrl (Cmd on macOS).
const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
function keyMatch(e, b) {
  if (!b) return false;
  const mod = b.startsWith('Mod+'), k = mod ? b.slice(4) : b;
  return (e.ctrlKey || e.metaKey) === mod && !e.altKey && (mod ? e.key.toLowerCase() === k.toLowerCase() : e.key === k);
}
function keyLabel(b) {
  if (!b) return '';
  const mod = b.startsWith('Mod+'), k = mod ? b.slice(4) : b, name = k === 'Escape' ? 'Esc' : k.length === 1 && k !== k.toLowerCase() ? '⇧' + k : k.toUpperCase();
  return mod ? (MAC ? '⌘' : 'Ctrl+') + name : name;
}

// ---------------------------------------------------------------- feedback: banner and sound (§2.4)
// Sound cues are synthesized from the style's --cue-* tokens, so each style has its own cue set and no sound files exist.
let actx;
function cue(kind) {
  const css = getComputedStyle(document.documentElement), v = k => css.getPropertyValue('--cue-' + k).trim();
  const notes = v(kind).split(',').map(s => s.trim().split(/\s+/).map(Number)).filter(n => n.length === 2 && n.every(Number.isFinite));
  if (!state.sound || !notes.length || (CFG.muteWithReducedMotion && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  try {
    actx ??= new AudioContext();
    const t0 = actx.currentTime + 0.01, len = +v('length'), vol = +v('volume'), attack = +v('attack');
    for (const [f, d] of notes) {
      const osc = actx.createOscillator(), g = actx.createGain(), t = t0 + d;
      osc.type = v('wave');
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      osc.connect(g).connect(actx.destination);
      osc.start(t); osc.stop(t + len + 0.05);
    }
  } catch { /* audio unavailable: stay silent */ }
}

let bannerTimer;
function toast(head, text, color = 'var(--main)', { kind = 'info', q = null, undo = true } = {}) {
  const b = $('#banner');
  b.className = `banner c-${q ? q.type : 'main'} ${kind === 'done' ? 'big' : ''} ${undo && undoStack.length ? 'can-undo' : ''}`;
  b.style.setProperty('--tc', color);
  b.querySelector('.k').textContent = head;
  b.querySelector('.t').textContent = text;
  const n = q ? q.objectives.filter(x => x.s !== 'open').length : 0;
  b.querySelector('.q').innerHTML = !q ? '' : `${svg(TYPE_IC[q.type])}<span>${esc(q.title)}</span>` +
    (q.type === 'activity' ? '' : `${ticks(q)}<span>${n} / ${q.objectives.length}</span>`);
  b.querySelector('.undo').textContent = `${T('undo')} · ${keyLabel(CFG.keys.undo)}`;
  void b.offsetWidth;
  b.classList.add('on');
  cue(kind);
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.remove('on'), kind === 'done' ? CFG.bannerCompleteMs : CFG.bannerMs);
}

// ---------------------------------------------------------------- saving and undo (§2.5)
// An action changes the quest in the page and draws it at once, then saves it; the server's answer then replaces it.
// Saves run one at a time, so a second click never writes over a file the first is still saving.
const clone = q => JSON.parse(JSON.stringify(q));
const stampNow = () => { const d = new Date(); return `${dkey(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const versionOf = rel => { const q = byRel(rel); return q && META.get(q).version; };
let queue = Promise.resolve();
function run(fn) {
  queue = queue.then(fn).catch(async e => {
    console.error(e);
    toast(T(e.status === 409 ? 'changed_disk' : 'save_failed'), e.status === 409 ? '' : e.message, 'var(--danger)', { undo: false });
    await reload();
  });
  return queue;
}
async function reload() { await load(); render(); }

// Undo keeps, per action, each changed quest as it was, the files the action created, and for an import the old player stats.
const undoStack = [];
function pushUndo(entry) {
  undoStack.push(entry);
  if (undoStack.length > CFG.undoDepth) undoStack.shift();
  return entry;
}
const remember = quests => pushUndo({ items: quests.map(q => ({ rel: relOf(q), before: clone(q) })), created: [] });
// Saves quests; the undo entry learns where each file ended up, since closing a quest moves it to completed/.
async function persist(quests, entry) {
  let saved;
  for (const q of quests) {
    const m = META.get(q);
    saved = await api('POST', '/api/save', { rel: m?.rel, version: m?.version, quest: q });
    const item = m && entry?.items.find(i => i.rel === m.rel);
    if (item) item.rel = saved.rel;
    if (!m) entry?.created.push(saved.rel);
  }
  await reload();
  return saved;
}
function undo() {
  const entry = undoStack.pop();
  if (!entry) return toast(T('nothing_undo'), '', 'var(--dim)', { undo: false });
  run(async () => {
    for (const { rel, before } of entry.items) if (!entry.created.includes(rel)) {
      await api('POST', '/api/save', { rel, version: versionOf(rel), quest: before, undo: true });
      await load();
    }
    for (const rel of entry.created) { await api('POST', '/api/remove', { rel, version: versionOf(rel) }); await load(); }
    if (entry.player) { await api('POST', '/api/player', { mode: 'replace', player: entry.player }); await load(); }
    render();
    toast(T('t_undo'), '', 'var(--dim)', { kind: 'undo', undo: false });
  });
}

// ---------------------------------------------------------------- quest actions
const selected = () => QUESTS.find(x => relOf(x) === state.sel);
const objAt = (q, [i, j]) => j === undefined ? q.objectives[i] : q.objectives[i].sub[j];
const pathOf = t => t.closest('[data-path]').dataset.path.split('.').map(Number);
// "Other route taken" is written in the language of the day, so any shipped language's wording counts.
const notTaken = note => Object.values(LANGS).some(l => l.not_taken === note);
// Changes one or more quests: remembers them for undo, applies `change`, draws, then saves the first `save` of them.
function act(quests, change, { save = quests } = {}) {
  const entry = remember(quests);
  change();
  render();
  return run(() => persist(save, entry));
}

// "YYYY-MM-DD" or "YYYY-MM-DD HH:mm" in the files' form (same rule as parseDate in questboard.js); null if not a real date.
function normDate(v) {
  const m = v.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?$/), d = m && new Date(+m[1], m[2] - 1, +m[3]);
  if (!m || d.getMonth() !== m[2] - 1 || d.getDate() !== +m[3] || (m[4] !== undefined && (+m[4] > 23 || +m[5] > 59))) return null;
  const day = `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  return m[4] === undefined ? day : `${day} ${pad(m[4])}:${m[5]}`;
}
// A date typed in a prompt: '' clears it, undefined means cancelled or unreadable.
function askDate(question, now) {
  const v = prompt(question, now || '');
  if (v === null) return undefined;
  if (!v.trim()) return '';
  const d = normDate(v);
  if (!d) toast(T('bad_date'), v, 'var(--danger)', { undo: false });
  return d ?? undefined;
}
// Same rule as parseRepeat in questboard.js: "daily", "every 3d", "sun,wed".
function parseRepeat(s) {
  const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], r = s.trim().toLowerCase(), every = r.match(/^every\s*(\d+)\s*d(?:ays?)?$/);
  if (r === 'daily') return { every: 1 };
  if (every && +every[1] > 0) return { every: +every[1] };
  const parts = r.split(/[,\s]+/).filter(Boolean), days = parts.map(x => DAYS.indexOf(x.slice(0, 3)));
  return parts.length && days.every(d => d >= 0) ? { days: [...new Set(days)].sort((a, b) => a - b) } : null;
}

// Objectives (§1.2): an any-one group is done when one route is done, and its other routes are dropped;
// a group whose children are all resolved takes done if any child is done, else failed.
function setObjective(q, [i, j], s) {
  const parent = j === undefined ? null : q.objectives[i], x = parent ? parent.sub[j] : q.objectives[i];
  act([q], () => {
    const at = stampNow();
    Object.assign(x, { s, at });
    if (!parent) return;
    const open = parent.sub.filter(c => c.s === 'open');
    if (parent.any && s === 'done') {
      open.forEach(c => Object.assign(c, { s: 'dropped', at, note: T('not_taken') }));
      Object.assign(parent, { s: 'done', at });
    } else if (!open.length) Object.assign(parent, { s: parent.sub.some(c => c.s === 'done') ? 'done' : 'failed', at });
  });
  toast(T('t_' + s), x.t, { done: 'var(--c)', failed: 'var(--danger)', dropped: 'var(--dim)' }[s], { kind: s, q });
}
function reopenObjective(q, [i, j]) {
  const parent = j === undefined ? null : q.objectives[i], x = parent ? parent.sub[j] : q.objectives[i];
  act([q], () => {
    x.s = 'open'; delete x.at; delete x.note;
    if (parent && parent.s !== 'open') {
      parent.s = 'open'; delete parent.at;
      if (parent.any) parent.sub.filter(c => notTaken(c.note)).forEach(c => { c.s = 'open'; delete c.at; delete c.note; });
    }
  });
  toast(T('t_reopen'), x.t, 'var(--dim)', { kind: 'undo', q });
}
function addObjective(q) {
  const text = prompt(T('add_prompt'))?.trim();
  if (!text) return;
  act([q], () => q.objectives.push({ t: text, s: 'open', added: stampNow() }));
  toast(T('t_new'), text, 'var(--side)', { kind: 'new', q });
}
function toggleCrit(q, i) {
  const c = q.criteria[i];
  act([q], () => { if (c.met) delete c.met; else c.met = true; });
  if (c.met) toast(T('t_crit'), c.t, 'var(--act)', { kind: 'crit', q });
}
function setStepDue(q, path) {
  const x = objAt(q, path), v = askDate(T('due_prompt'), x.due);
  if (v === undefined) return;
  act([q], () => { if (v) x.due = v; else delete x.due; });
}
function setSLine(q) {
  const v = askDate(T('s_set'), q.target);
  if (v === undefined) return;
  act([q], () => { if (v) q.target = v; else delete q.target; });
}
// Split into quest: the server writes the new linked quest; undo removes it and puts the step back.
function splitStep(q, path) {
  const x = objAt(q, path), entry = remember([q]), m = META.get(q);
  run(async () => {
    const r = await api('POST', '/api/split', { rel: m.rel, version: m.version, at: path });
    entry.items[0].rel = r.rel;
    entry.created.push(r.child);
    await reload();
    toast(T('t_split'), x.t, 'var(--side)', { kind: 'new', q: byRel(r.rel) });
  });
}

// The tracked quest (§2.1): tracking one clears the flag on the others; the server does the same for files.
function track(q) {
  const prev = QUESTS.filter(x => x.tracked && x !== q);
  act([q, ...prev], () => { prev.forEach(x => delete x.tracked); q.tracked = true; state.menu = false; }, { save: [q] });
  toast(T('t_track'), q.title);
}
function untrack(q) { act([q], () => { delete q.tracked; state.menu = false; }); }
function toggleFav(q) {
  if (!q.favorite && favs().length >= CFG.favoritesMax) return toast(T('fav_full', CFG.favoritesMax), T('fav_full_i'), 'var(--danger)', { undo: false });
  act([q], () => { if (q.favorite) delete q.favorite; else q.favorite = true; });
  toast(T(q.favorite ? 't_fav' : 't_unfav'), q.title, 'var(--side)', { q });
}
// Type change (§1.5): to activity asks for the schedule and drops the deadline; from activity keeps the completions.
// The server writes the change to the quest's log.
function changeType(q, type) {
  let repeat;
  if (type === 'activity') {
    const r = prompt(T('repeat_prompt'), 'daily');
    if (r === null) return render();
    repeat = parseRepeat(r) || { every: 1 };
  }
  const from = q.type;
  act([q], () => {
    q.type = type;
    if (type === 'activity') { q.repeat = repeat; delete q.deadline; delete q.target; } else delete q.repeat;
  });
  toast(T('t_type'), `${T(from + '_q')} → ${T(type + '_q')}`, 'var(--c)', { q });
}
function addLog(q) {
  const text = prompt(T('log_prompt'))?.trim();
  if (!text) return;
  act([q], () => q.log.push({ head: stampNow(), text }));
  toast(T('ev_log'), text, 'var(--dim)', { q });
}

// Completing (§1.1): every criterion must be met. An activity instead records today's run and opens its steps for the next one.
function completeQuest(q) {
  if (q.type === 'activity') {
    const today = dkey(new Date());
    if (q.completions.some(d => d.startsWith(today))) return toast(T('done_today'), q.title, 'var(--dim)', { undo: false });
    act([q], () => {
      q.completions.push(today);
      for (const { o } of leaves(q)) { o.s = 'open'; delete o.at; delete o.note; }
      q.objectives.forEach(o => { if (o.sub) { o.s = 'open'; delete o.at; } });
    });
    return toast(T('t_act'), `${q.title} · +${xpOf(q)} XP`, 'var(--act)', { kind: 'done', q });
  }
  if (q.criteria.some(c => !c.met)) return toast(T('crit_unmet'), q.title, 'var(--danger)', { undo: false });
  const before = level();
  act([q], () => { q.status = 'complete'; }).then(saved => saved && showDone(saved.rel, before));
}
function abandonQuest(q) {
  act([q], () => { q.status = 'abandoned'; });
  toast(T('ev_abandoned'), q.title, 'var(--dim)', { q });
}

// ---------------------------------------------------------------- quest complete (§2.3)
const num = v => v.toLocaleString(LOC());
function showDone(rel, before) {
  const q = byRel(rel);
  if (!q) return;
  state.done = rel;
  const after = level(), g = G(guildOf(q)), ls = leaves(q), n = s => ls.filter(l => l.o.s === s).length;
  const end = P(q.completed), taken = end - P(q.created), delta = q.deadline ? P(q.deadline) - end : null;
  // Steps finished after their own deadline (§1.2.1): shown here, never part of the grade.
  const late = ls.filter(({ o }) => o.s === 'done' && o.due && o.at && P(o.at) > P(o.due)).length;
  const up = after.lv > before.lv, el = $('#done');
  el.innerHTML = `<div class="results-inner">
    <div class="kicker">${svg(TYPE_IC[q.type])}${T(q.type + '_q')} // ${esc(g.name)}</div>
    <h1>${T('quest_complete')}</h1><div class="qt">${esc(q.title)}</div>
    <div class="rule"></div>
    <div class="result">
      <div class="grade"><div class="hexclip"><strong>${q.grade}</strong></div><p>${T('grade_x', q.grade)} · ${T(q.grade === 'S' ? 'exceptional' : 'gd_' + q.grade)}</p></div>
      <div><div class="stats">
        <div class="stat"><span>${T('time_taken')}</span><b>${dur(taken)}</b></div>
        <div class="stat"><span>${T('vs_deadline')}</span><b class="${delta === null || delta >= 0 ? 'good' : ''}">${delta === null ? '—' : T(delta >= 0 ? 'early' : 'late', dur(delta))}</b></div>
        <div class="stat"><span>${T('obj_tally')}</span><b>${n('done')} <i>· ${n('failed')} ${T('failed')} · ${n('dropped')} ${T('dropped')}${late ? ` · ${T('late', late)}` : ''}</i></b></div>
        <div class="stat"><span>${T('crit_tally')}</span><b>${q.criteria.filter(c => c.met).length} / ${q.criteria.length}</b></div>
        <div class="stat"><span>${T('log_entries')}</span><b>${q.log.length}</b></div>
        <div class="stat"><span>${T('xp_earned')}</span><b style="color:var(--main)">${xpOf(q)} × ${CFG.gradeMultiplier[q.grade]}</b></div></div>
        <div class="xpgain"><div class="row"><span>XP</span><b>+${num(q.awarded)} XP</b></div><div class="bar"><i id="xpfill"></i></div>
          <div class="row" style="margin-top:8px"><span>LV ${pad(before.lv)} · ${num(before.xp)}</span><span>${up ? `LV ${pad(after.lv)} · ` : ''}${num(after.xp)} / ${num(after.need)}</span></div></div></div>
    </div>
    ${up ? `<div class="lvup" id="lvup"><b>${T('level_up')}</b><span>LV ${pad(before.lv)} → LV ${pad(after.lv)}</span></div>` : ''}
    <textarea class="debrief" id="debrief" placeholder="${T('debrief_ph')}">${esc(q.debrief)}</textarea>
    <div class="actions">
      <button class="btn primary" data-debrief><kbd>${keyLabel(CFG.keys.debrief)}</kbd>${T('b_save_debrief')}</button>
      <button class="btn" data-goj><kbd>${keyLabel(CFG.keys.openJournal)}</kbd>${T('open_journal')}</button>
      <button class="btn" data-close><kbd>${keyLabel(CFG.keys.close)}</kbd>${T('back')}</button></div></div>`;
  el.classList.add('on');
  cue('quest');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $('#xpfill').style.width = `${up ? 100 : after.xp / after.need * 100}%`;
    $('#lvup')?.classList.add('on');
  }));
}
function saveDebrief() {
  const q = byRel(state.done), text = $('#debrief').value.trim();
  if (!q || text === q.debrief) return;
  act([q], () => { q.debrief = text; });
  toast(T('t_debrief'), q.title, 'var(--main)', { q });
}
const closeDone = () => $('#done').classList.remove('on');

// ---------------------------------------------------------------- settings (§2.6)
function renderSettings() {
  $('#settings').innerHTML = `
    <div class="fld"><span>${T('style')}</span><div class="styles">${STYLES.map(s =>
      `<button class="${state.theme === s ? 'on' : ''}" data-theme-set="${esc(s)}"><div class="sw ${esc(s)}"></div><b>${T('st_' + s)}</b><small>${T('st_' + s + '_d')}</small></button>`).join('')}</div></div>
    <div class="fld"><span>${T('sound')}</span><div class="toggle">
      <button class="${state.sound ? 'on' : ''}" data-sound="1">${T('on')}</button><button class="${state.sound ? '' : 'on'}" data-sound="0">${T('off')}</button>
      <button data-sfxtest>${T('test')} ▸</button></div></div>
    <div class="fld"><span>${T('week_start')}</span><div class="toggle">${[0, 1].map(n =>
      `<button class="${state.weekStart === n ? 'on' : ''}" data-ws="${n}">${T('ws_' + n)}</button>`).join('')}</div></div>
    <div class="fld"><a class="btn sm" href="/api/export" download>${T('export_all')}</a></div>`;
}
// Saves settings to data/settings.json and applies the server's answer.
async function setSettings(values) {
  try { applySettings((await api('PUT', '/api/settings', values)).settings); } catch (e) { console.error(e); }
  render();
}
function applySettings(s) {
  SETTINGS = s;
  Object.assign(state, { lang: s.language, theme: s.style, sound: s.sound, weekStart: s.weekStart === 'monday' ? 1 : 0, calMode: s.calendarMode });
}

function render() {
  NOW = new Date();
  closePop();
  renderStatic(); renderFocus(); renderRail();
  if (state.view === 'log') { renderList(); renderDetail(); }
  if (state.view === 'cal') renderCal();
  if (state.view === 'journal') renderJournal();
  if ($('#pview').classList.contains('on') && !$('#imp')?.classList.contains('on')) renderPlayer();
}

// ---------------------------------------------------------------- server
async function api(method, url, body) {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body && JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || r.statusText), { status: r.status });
  return data;
}

async function load() {
  const s = await api('GET', '/api/state');
  CFG = s.config; GUILDS = s.guilds; PLAYER = s.player; STYLES = s.styles;
  for (const l of s.languages) if (!LANGS[l]) LANGS[l] = await fetch(`/locales/${l}.json`).then(r => r.json());
  applySettings(s.settings);
  QUESTS = []; JOURNAL = [];
  for (const { rel, version, clash, by, quest } of s.quests) {
    META.set(quest, { rel, version, clash, by });
    (OPEN.includes(quest.status) ? QUESTS : JOURNAL).push(quest);
  }
}

// Every style file loads at once (each is scoped to its data-theme), so switching style needs no reload.
function loadStyles() {
  return Promise.all(STYLES.map(s => new Promise(done => {
    const l = document.createElement('link');
    Object.assign(l, { rel: 'stylesheet', href: `/styles/${s}.css`, onload: done, onerror: done });
    document.head.append(l);
  })));
}

// The server announces every change (an app save or a hand edit); the page reloads its state, keeping the view.
let reloading;
function listen() {
  const ev = new EventSource('/api/events');
  ev.addEventListener('change', () => {
    clearTimeout(reloading);
    reloading = setTimeout(async () => { try { await load(); render(); } catch (e) { console.error(e); } }, 50);
  });
  ev.onerror = () => $('#lost').classList.add('on');
  ev.onopen = () => { if ($('#lost').classList.contains('on')) { $('#lost').classList.remove('on'); load().then(render); } };
}

// ---------------------------------------------------------------- input
document.addEventListener('click', e => {
  if (!e.target.closest('#settings, [data-settings]')) $('#settings').classList.remove('on');
  const t = e.target.closest('button, [data-q], [data-j], [data-crit], [data-fclose]');
  if (!t) {
    if (!e.target.closest('#pop')) closePop();
    if (state.menu && !e.target.closest('.menu')) { state.menu = false; renderFocus(); }
    return;
  }
  const d = t.dataset;
  if (d.pop) return openPop(d.pop, t);
  if ('settings' in d) { renderSettings(); return $('#settings').classList.toggle('on'); }
  if ('player' in d) return openPlayer();
  if (d.pby) { state.pby = d.pby; return renderPlayer(); }
  if ('pexport' in d) return Object.assign(document.createElement('a'), { href: '/api/player', download: 'player.json' }).click();
  if ('pimport' in d) return pickPlayerFile();
  if (d.pimp) return importPlayer(d.pimp);
  if ('pimpcancel' in d) return $('#imp').classList.remove('on');
  if ('fclose' in d) return closeOverlays();
  if (d.calmode) return setSettings({ calendarMode: d.calmode });
  if (d.actdone) { const [rel, day] = d.actdone.split('|'); closePop(); return markRun(byRel(rel), day); }
  if (d.reopenq) return reopenQuest(byRel(d.reopenq));
  if (d.themeSet) return setSettings({ style: d.themeSet });
  if (d.sound) return setSettings({ sound: d.sound === '1' });
  if (d.ws) return setSettings({ weekStart: d.ws === '1' ? 'monday' : 'sunday' });
  if ('sfxtest' in d) return cue('done');
  if ('undo' in d) return undo();
  if (d.fav) return toggleFav(byRel(d.fav));
  if (d.trackid) return track(byRel(d.trackid));
  if ('untrack' in d) { const q = QUESTS.find(x => x.tracked); return q && untrack(q); }
  if ('track' in d) { const q = selected(); return q.tracked ? untrack(q) : track(q); }
  if (d.fset) { const q = focusQuest(); return setObjective(q, current(q).path, d.fset); }
  if ('fadd' in d) return addObjective(focusQuest());
  if ('complete' in d) return completeQuest(t.closest('#focus') ? focusQuest() : selected());
  if ('debrief' in d) return saveDebrief();
  if ('close' in d) return closeDone();
  if ('goj' in d) { closeDone(); state.view = 'journal'; return render(); }
  if ('newq' in d) return openForm($('#cap').value.trim() ? parseCapture($('#cap').value) : {});
  if (d.dtab) return openForm(state.form?.prefill, d.dtab);
  if (d.ftype || d.fguild) {
    const k = d.ftype ? 'ftype' : 'fguild';
    state.form[d.ftype ? 'type' : 'guild'] = d[k];
    return document.querySelectorAll(`[data-${k}]`).forEach(b => b.classList.toggle('on', b === t));
  }
  if ('fsubmit' in d) return submitForm();
  if ('aicopy' in d) return copyText($('#ai-prompt').value);
  if ('aiaccept' in d) return acceptImport();
  if ('mdcopy' in d) return copyText(state.md.text);
  if ('mddl' in d) return download(state.md.rel.split('/').pop(), state.md.text);
  if ('mdopen' in d) return run(() => api('POST', '/api/open', { rel: state.md.rel }));
  const q = selected();
  if (q) {
    if ('md' in d) return showMd(q);
    if (d.set) return setObjective(q, pathOf(t), d.set);
    if ('reopen' in d) return reopenObjective(q, pathOf(t));
    if ('sdue' in d) return setStepDue(q, pathOf(t));
    if ('split' in d) return splitStep(q, pathOf(t));
    if (d.crit !== undefined) return toggleCrit(q, +d.crit);
    if ('add' in d) return addObjective(q);
    if ('sline' in d) return setSLine(q);
    if ('logentry' in d) return addLog(q);
    if ('abandon' in d) return abandonQuest(q);
  }
  if (d.v) state.view = d.v;
  else if (d.type) state.type = state.type === d.type && d.type !== 'all' ? 'all' : d.type;
  else if (d.guild) state.guild = state.guild === d.guild ? null : d.guild;
  else if (d.q) state.sel = d.q;
  else if (d.j) state.jsel = d.j;
  else if ('switch' in d) { state.menu = !state.menu; return renderFocus(); }
  else if (d.cal) {
    const [y, m] = state.month.split('-').map(Number), n = new Date(y, m - 1 + Number(d.cal), 1);
    state.month = d.cal === '0' ? dkey(NOW).slice(0, 7) : `${n.getFullYear()}-${pad(n.getMonth() + 1)}`;
  }
  else if (d.open) Object.assign(state, { view: 'log', sel: d.open, type: 'all', guild: null });
  else if (d.openj) Object.assign(state, { view: 'journal', jsel: d.openj, type: 'all', guild: null });
  else return;
  render();
});
$('#lang').addEventListener('change', e => setSettings({ language: e.target.value }));
document.addEventListener('change', e => { if (e.target.matches('[data-typesel]')) changeType(selected(), e.target.value); });
document.addEventListener('keydown', e => {
  const K = CFG?.keys;
  if (!K) return;
  if (keyMatch(e, K.close)) { state.menu = false; closePop(); closeOverlays(); $('#settings').classList.remove('on'); closeDone(); return renderFocus(); }
  if (e.target.closest?.('input, textarea, select')) return;
  if ($('#done').classList.contains('on')) {
    if (keyMatch(e, K.debrief)) { e.preventDefault(); $('#debrief').focus(); }
    else if (keyMatch(e, K.openJournal)) { closeDone(); state.view = 'journal'; render(); }
    return;
  }
  if (keyMatch(e, K.undo)) { e.preventDefault(); return undo(); }
  if (document.querySelector('.drawer.on, .mdview.on, .pview.on')) return;
  if (keyMatch(e, K.capture)) { e.preventDefault(); return $('#cap').focus(); }
  if (keyMatch(e, K.newQuest)) { e.preventDefault(); return openForm(); }
  const view =[[K.viewLog, 'log'], [K.viewCalendar, 'cal'], [K.viewJournal, 'journal']].find(([b]) => keyMatch(e, b));
  if (view) { state.view = view[1]; return render(); }
  const q = state.view === 'log' && selected();
  if (!q) return;
  if (keyMatch(e, K.track)) q.tracked ? untrack(q) : track(q);
  else if (keyMatch(e, K.favorite)) toggleFav(q);
  else if (keyMatch(e, K.complete)) completeQuest(q);
  else if (keyMatch(e, K.logEntry)) addLog(q);
  else if (keyMatch(e, K.markdown)) showMd(q);
});
// Quick capture (§2.2): Enter creates the quest, Shift+Enter opens the full form with what was typed.
const cap = $('#cap');
cap.addEventListener('focus', () => { renderCapPop(); $('#cap-pop').classList.add('on'); });
cap.addEventListener('blur', () => setTimeout(() => $('#cap-pop').classList.remove('on'), 150));
cap.addEventListener('input', renderCapPop);
cap.addEventListener('keydown', e => {
  if (keyMatch(e, CFG.keys.close)) { cap.value = ''; cap.blur(); return; }
  if (e.key !== 'Enter' || !cap.value.trim()) return;
  const p = parseCapture(cap.value);
  cap.value = '';
  renderCapPop();
  if (e.shiftKey) { cap.blur(); return openForm(p); }
  if (p.title) createQuest(p);
});
addEventListener('resize', () => CFG && renderFocus());
// Countdowns tick: redraw every 30 seconds unless a popup or drawer is open.
setInterval(() => { if (CFG && !document.querySelector('.drawer.on, .pop.on, .settings.on, .mdview.on, .pview.on, .results.on, .cap-pop.on')) render(); }, 30000);

(async () => {
  state.month = dkey(new Date()).slice(0, 7);
  await load();
  await loadStyles();
  render();
  document.body.classList.remove('loading');
  listen();
})();
