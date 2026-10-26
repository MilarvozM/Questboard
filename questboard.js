#!/usr/bin/env node
// Questboard server: serves the browser UI and reads and writes the Markdown data folder (DESIGN.md §5).
// Node 18 or newer, built-in modules only. Run: node questboard.js
'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = __dirname;

// ---------------------------------------------------------------- config (§5.1)

// JSONC → JSON: drops // and /* */ comments and trailing commas, leaving string contents alone.
function stripJsonc(text) {
  let out = '', comma = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') { while (i + 1 < text.length && text[i + 1] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') { const end = text.indexOf('*/', i + 2); i = end < 0 ? text.length : end + 1; continue; }
    if ((c === '}' || c === ']') && comma >= 0) out = out.slice(0, comma) + out.slice(comma + 1);
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1); i = j; comma = -1;
      continue;
    }
    if (!/\s/.test(c)) comma = c === ',' ? out.length : -1;
    out += c;
  }
  return out;
}

const readJsonc = file => JSON.parse(stripJsonc(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')));
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// Rules beyond "same type as the default"; every number must also be finite and not negative.
const whole = v => Number.isInteger(v);
const CHECKS = {
  port: v => whole(v) && v > 0 && v < 65536,
  dataDir: v => v.trim() !== '',
  sLineAt: v => v > 0 && v <= 1,
  levelXpStep: v => v > 0,
  favoritesMax: whole,
  urgentDays: v => v > 0,
  shortNameMax: v => whole(v) && v > 0,
  fileSlugMax: v => whole(v) && v > 0,
  fileIdLength: v => whole(v) && v > 0,
  undoDepth: whole,
  maxRequestMB: v => v > 0,
  'scan.pollSeconds': v => v > 0,
  'defaults.language': v => /^[\w-]+$/.test(v) && fs.existsSync(path.join(ROOT, 'locales', v + '.json')),
  'defaults.style': v => /^[\w-]+$/.test(v) && fs.existsSync(path.join(ROOT, 'styles', v + '.css')),
  'defaults.weekStart': v => ['sunday', 'monday'].includes(v),
  'defaults.calendarMode': v => ['quests', 'steps', 'everything'].includes(v),
};

// Merges `over` onto `base` key by key. An unknown key is ignored; a value of the wrong type,
// or one its rule rejects, keeps the default. Each problem is reported through `warn`.
function mergeConfig(base, over, file, warn, prefix = '') {
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const key = prefix + k, d = base[k];
    if (!(k in base)) { warn(`${file}: unknown key "${key}" is ignored.`); continue; }
    if (isObj(d)) {
      if (isObj(v)) out[k] = mergeConfig(d, v, file, warn, key + '.');
      else warn(`${file}: "${key}" must be a { … } group of keys; using the defaults.`);
      continue;
    }
    const sameType = Array.isArray(d) ? Array.isArray(v) && v.every(x => typeof x === typeof d[0]) : typeof v === typeof d && !Array.isArray(v) && v !== null;
    const ok = sameType && (typeof v !== 'number' || (Number.isFinite(v) && v >= 0)) && (!CHECKS[key] || CHECKS[key](v));
    if (ok) out[k] = v;
    else warn(`${file}: "${key}" can't be ${JSON.stringify(v)}; using the default ${JSON.stringify(d)}.`);
  }
  return out;
}

function loadConfig(warn = console.warn) {
  const defaults = readJsonc(path.join(ROOT, 'config.default.jsonc'));
  const file = path.join(ROOT, 'config.jsonc');
  if (!fs.existsSync(file)) return defaults;
  let user;
  try { user = readJsonc(file); } catch (e) {
    warn(`config.jsonc: not valid JSONC (${e.message}); using all defaults.`);
    return defaults;
  }
  if (!isObj(user)) { warn('config.jsonc: must be one { … } group of keys; using all defaults.'); return defaults; }
  return mergeConfig(defaults, user, 'config.jsonc', warn);
}

// A relative dataDir counts from the app folder; a leading ~ is the home folder.
const resolveDataDir = dir => path.resolve(ROOT, dir.replace(/^~(?=$|[\\/])/, os.homedir()));

// ---------------------------------------------------------------- quest file format (§3.2)
// A quest file parses into a plain object the browser can use. Frontmatter entries, objectives,
// criteria and sections keep their original text (in `doc` and `_raw`), and the writer reuses that
// text wherever the meaning didn't change. So a save rewrites only what changed, and unknown keys,
// unknown sections and hand-written notes stay as written (§3.3).

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MARK_STATE = { ' ': 'open', x: 'done', X: 'done', '!': 'failed', '-': 'dropped' };
const STATE_MARK = { open: ' ', done: 'x', failed: '!', dropped: '-' };
// Sections the app reads, in the order a new file gets them. Their headings come from locales/<lang>.json.
const SECTIONS = ['briefing', 'objectives', 'criteria', 'completions', 'log', 'debrief'];
const CHECK = /^(\s*)[-*+] \[(.)\] (.*)$/;
const BAD = Symbol('bad');

// "YYYY-MM-DD HH:MM", or "YYYY-MM-DD" for a date alone (meaning 23:59). Accepts T or a space between; null if not a real date.
function parseDate(s) {
  const m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::\d{2})?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m, day = new Date(Date.UTC(+y, mo - 1, +d));
  if (day.getUTCMonth() !== mo - 1 || day.getUTCDate() !== +d) return null;
  if (h === undefined) return `${y}-${mo}-${d}`;
  return +h > 23 || +mi > 59 ? null : `${y}-${mo}-${d} ${h.padStart(2, '0')}:${mi}`;
}

// "daily" → { every: 1 }, "every 3d" → { every: 3 }, "sun,wed" or "Mon, Thu" → { days: [0, 3] }; null if unreadable.
function parseRepeat(s) {
  const r = s.trim().toLowerCase(), every = r.match(/^every\s*(\d+)\s*d(?:ays?)?$/);
  if (r === 'daily') return { every: 1 };
  if (every && +every[1] > 0) return { every: +every[1] };
  const parts = r.split(/[,\s]+/).filter(Boolean), days = parts.map(x => DAYS.indexOf(x.slice(0, 3)));
  return parts.length && days.every(d => d >= 0) ? { days: [...new Set(days)].sort((a, b) => a - b) } : null;
}
const repeatText = r => r.every ? (r.every === 1 ? 'daily' : `every ${r.every}d`) : r.days.map(d => DAYS[d]).join(',');

// Enough YAML for one-line values: plain (a " #" starts a comment), 'single' or "double" quoted.
function yamlValue(raw) {
  const v = raw.trim();
  if (v.startsWith('"')) { try { return JSON.parse(v.match(/^"(?:[^"\\]|\\.)*"/)[0]); } catch { return v; } }
  if (v.startsWith("'")) { const m = v.match(/^'((?:[^']|'')*)'/); return m ? m[1].replace(/''/g, "'") : v; }
  return v.replace(/\s+#.*$/, '');
}
const needsQuotes = s => s !== s.trim() || /^[-?:,[\]{}#&*!|>'"%@`]/.test(s) || /: |\s#|:$/.test(s)
  || /^(true|false|yes|no|on|off|null|~)$/i.test(s) || /^[-+]?\d[\d_]*(\.\d*)?([eE][-+]?\d+)?$/.test(s);
const yamlText = s => needsQuotes(s) ? JSON.stringify(s) : s;
const fmValue = e => yamlValue(e.raw[0].slice(e.raw[0].indexOf(':') + 1));

// Frontmatter keys the app reads, in the order a new file gets them: `read` turns the file's text into
// the value (BAD if unreadable), and read('') is what an absent key means; `write` gives null to leave the key out.
const textField = { read: v => v || undefined, write: v => v ? yamlText(v) : null };
const dateField = { read: v => !v ? undefined : parseDate(v) ?? BAD, write: v => v ? v.replace(' ', 'T') : null, code: 'w_date' };
const flagField = { read: v => /^true$/i.test(v) || undefined, write: v => v ? 'true' : null };
const numField = { read: v => !v ? undefined : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : BAD, write: v => v ?? null };
const FIELDS = {
  id: textField, parent: textField,
  type: { read: v => { const t = v.toLowerCase(); return !t ? 'side' : t === 'act' ? 'activity' : ['main', 'side', 'activity'].includes(t) ? t : BAD; }, write: v => v, code: 'w_type' },
  guild: textField, title: textField, short: textField,
  status: { read: v => { const s = v.toLowerCase(); return !s ? 'active' : ['available', 'active', 'complete', 'abandoned'].includes(s) ? s : BAD; }, write: v => v },
  tracked: flagField, favorite: flagField,
  created: dateField, deadline: dateField, target: dateField,
  repeat: { read: v => !v ? undefined : parseRepeat(v) ?? BAD, write: v => v ? repeatText(v) : null, code: 'w_repeat' },
  xp: numField, completed: dateField,
  grade: { read: v => !v ? undefined : /^[SABC]$/i.test(v) ? v.toUpperCase() : BAD, write: v => v ?? null },
  awarded: numField,
};
const FM_ORDER = ['questboard', ...Object.keys(FIELDS)];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const textLines = s => s ? s.split('\n') : [];
function trimBlank(lines) {
  let a = 0, b = lines.length;
  while (a < b && !lines[a].trim()) a++;
  while (b > a && !lines[b - 1].trim()) b--;
  return lines.slice(a, b);
}
const trimText = lines => trimBlank(lines).join('\n');

// Interface strings per language from locales/<lang>.json; a missing key falls back to English (§4).
let LOCALES, HEADINGS;
function locales() {
  if (!LOCALES) {
    LOCALES = {};
    const dir = path.join(ROOT, 'locales');
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) LOCALES[f.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  }
  return LOCALES;
}
const T = (lang, k) => locales()[lang]?.[k] ?? locales().en[k] ?? k;
// Section headings per kind and language: { objectives: { en: 'Objectives', zh: '目标' }, … }
function headingNames() {
  if (!HEADINGS) {
    HEADINGS = {};
    for (const [lang, strings] of Object.entries(locales())) for (const k of SECTIONS) if (strings[k]) (HEADINGS[k] ??= {})[lang] = strings[k];
  }
  return HEADINGS;
}
function sectionKind(name) {
  const n = name.trim().toLowerCase(), h = headingNames();
  return SECTIONS.find(k => Object.values(h[k] || {}).some(x => x.toLowerCase() === n)) ?? (/criteria|条件/.test(n) ? 'criteria' : null);
}

// One objective line after its checkbox: text, @ tags, a linked quest's wiki link, and a reason after " — ".
// A tag whose date doesn't read stays in the text, so nothing the user wrote disappears.
function parseItem(mark, rest) {
  const x = { s: MARK_STATE[mark] ?? 'open' };
  if (!(mark in MARK_STATE)) x.mark = mark;
  const dash = rest.match(/^(.*?)\s+—\s+(.*)$/);
  let t = (dash ? dash[1] : rest).replace(/(?:^|\s+)@(done|failed|dropped|added|due)\(([^)]*)\)/g, (all, tag, v) => {
    const d = parseDate(v);
    if (!d) return all;
    x[tag === 'due' || tag === 'added' ? tag : 'at'] = d;
    return '';
  }).replace(/(?:^|\s+)@any\b/g, () => { x.any = true; return ''; }).trim();
  const wl = t.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
  if (wl) { x.link = wl[1].trim(); t = (wl[2] ?? wl[1]).trim(); }
  x.t = t;
  if (dash) x.note = dash[2];
  return x;
}
const ITEM_KEYS = ['t', 's', 'at', 'added', 'due', 'any', 'note', 'link', 'mark'];
const sameItem = (a, b) => ITEM_KEYS.every(k => (a[k] || undefined) === (b[k] || undefined));
function itemLine(x, indent) {
  if (x._raw) {
    const m = x._raw.match(CHECK);
    if (m && sameItem(parseItem(m[2], m[3]), x)) return x._raw;
    indent = x._raw.match(/^\s*/)[0];
  }
  const text = x.link ? `[[${x.link}${x.t && x.t !== x.link ? '|' + x.t : ''}]]` : x.t;
  return `${indent}- [${x.s === 'open' && x.mark ? x.mark : STATE_MARK[x.s]}] ${text}` + (x.any ? ' @any' : '') + (x.due ? ` @due(${x.due})` : '')
    + (x.at && x.s !== 'open' ? ` @${x.s}(${x.at})` : '') + (x.added ? ` @added(${x.added})` : '') + (x.note ? ` — ${x.note}` : '');
}

function parseLog(lines) {
  const out = [];
  let e = null;
  for (const l of lines) {
    const h = l.match(/^###\s+(.+?)\s*$/);
    if (h) out.push(e = { head: h[1], lines: [] });
    else if (e) e.lines.push(l);
    else if (l.trim()) out.push(e = { head: null, lines: [l] });
  }
  return out.map(({ head, lines: ls }) => ({ head, text: trimText(ls) }));
}
const logLines = e => [...(e.head !== null ? [`### ${e.head}`] : []), ...textLines(e.text)];
function parseCompletions(lines) {
  const dates = [], extra = [];
  for (const l of lines) {
    const m = l.match(/^\s*[-*+]\s+(.+)$/), d = m && parseDate(m[1]);
    if (d) dates.push(d); else if (l.trim()) extra.push(l);
  }
  return { dates, extra };
}
// A section's original lines when its value is unchanged, or those lines plus the new entries when the
// value only grew at the end (a new log entry, a new completion); null when it changed otherwise.
function appendOnly(raw, before, now, render, gap) {
  if (!raw || now.length < before.length || !same(now.slice(0, before.length), before)) return null;
  const out = [...raw];
  for (const e of now.slice(before.length)) out.push(...(gap && out.length ? [''] : []), ...render(e));
  return out;
}

const READ = {
  briefing(lines, q, doc) { q.briefing = trimText(lines); doc.raw.briefing = lines; },
  debrief(lines, q, doc) { q.debrief = trimText(lines); doc.raw.debrief = lines; },
  objectives(lines, q, doc) {
    const lead = doc.lead.objectives = [];
    let top = null, last = null, topIndent = null, subIndent = null;
    for (const l of lines) {
      const m = l.match(CHECK);
      if (m) {
        const ind = m[1].length, x = { ...parseItem(m[2], m[3]), _raw: l };
        if (topIndent === null || ind <= topIndent) { topIndent ??= ind; q.objectives.push(top = last = x); continue; }
        if (subIndent === null || ind <= subIndent) {
          if (subIndent === null) { subIndent = ind; doc.indent = m[1]; }
          (top.sub ??= []).push(last = x);
          continue;
        }
      }
      if (last) (last._extra ??= []).push(l); else lead.push(l);
    }
  },
  criteria(lines, q, doc) {
    const lead = doc.lead.criteria = [];
    for (const l of lines) {
      const m = l.match(CHECK);
      if (m) q.criteria.push({ t: m[3], ...(/x/i.test(m[2]) && { met: true }), _raw: l });
      else if (q.criteria.length) (q.criteria.at(-1)._extra ??= []).push(l);
      else lead.push(l);
    }
  },
  completions(lines, q, doc) { q.completions = parseCompletions(lines).dates; doc.raw.completions = lines; },
  log(lines, q, doc) { q.log = parseLog(lines); doc.raw.log = lines; },
};

// Is this a quest file? Only Markdown with frontmatter holding a `questboard:` key is (§3.1).
function isQuestFile(text) {
  const m = text.match(/^﻿?---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/);
  return !!m && /^questboard\s*:/im.test(m[1]);
}

// Parses one quest file. Returns null when the text has no frontmatter. Readable problems go in `problems`
// as { code, key, value }, where code is a locales/<lang>.json key; the file's own text for them is kept.
function parseQuest(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const close = lines.findIndex((l, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(l));
  if (lines[0].trimEnd() !== '---' || close < 0) return null;
  const doc = { eol: text.includes('\r\n') ? '\r\n' : '\n', fm: [], pre: [], sections: [], raw: {}, lead: {} };
  const q = { problems: [], objectives: [], criteria: [], completions: [], log: [], briefing: '', debrief: '' };

  // A frontmatter entry is a key line plus any indented or list lines under it (Obsidian writes lists that way).
  for (const l of lines.slice(1, close)) {
    const m = l.match(/^([A-Za-z_][\w-]*)\s*:/);
    if (m || !doc.fm.length) doc.fm.push({ key: m ? m[1] : null, raw: [l] });
    else doc.fm.at(-1).raw.push(l);
  }
  const seen = new Set();
  for (const e of doc.fm) {
    const k = e.key?.toLowerCase(), f = FIELDS[k];
    if (!f || seen.has(k)) continue;
    seen.add(k);
    const v = f.read(fmValue(e));
    if (v === BAD) q.problems.push({ code: f.code || 'w_value', key: k, value: fmValue(e) });
    const val = v === BAD ? f.read('') : v;
    if (val !== undefined) q[k] = val;
  }
  for (const [k, f] of Object.entries(FIELDS)) if (!seen.has(k) && f.read('') !== undefined) q[k] = f.read('');

  // Sections start at "## " headings outside code fences; the first of each known kind is read, the rest kept as written.
  let cur = null, fence = false;
  for (const l of lines.slice(close + 1)) {
    const h = !fence && l.match(/^##\s+(.+?)\s*$/);
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    if (h) doc.sections.push(cur = { heading: l, name: h[1], lines: [] });
    else (cur ? cur.lines : doc.pre).push(l);
  }
  doc.pre = trimBlank(doc.pre);
  const done = new Set();
  doc.sections = doc.sections.map(s => {
    const kind = sectionKind(s.name), body = s.lines.slice(0, trimBlank(['x', ...s.lines]).length - 1);
    if (!kind || done.has(kind)) return { heading: s.heading, lines: body };
    done.add(kind);
    READ[kind](body, q, doc);
    return { kind, heading: s.heading };
  });
  if (!q.title) q.problems.push({ code: 'e_title', key: 'title' });
  q.doc = doc;
  return q;
}

// Inserts `item` after the lowest entry that comes before it in `order`, else before the first that comes after it.
function insertInOrder(list, item, name, order, nameOf) {
  const i = order.indexOf(name), names = list.map(nameOf);
  const before = Math.max(-1, ...order.slice(0, i).map(n => names.lastIndexOf(n)));
  if (before >= 0) return list.splice(before + 1, 0, item);
  const after = names.findIndex(n => order.indexOf(n) > i);
  list.splice(after >= 0 ? after : list.length, 0, item);
}

const WANT = {
  briefing: q => !!q.briefing, objectives: (q, doc) => q.objectives.length > 0 || !doc.sections, criteria: q => q.criteria.length > 0,
  completions: q => q.completions.length > 0, log: q => q.log.length > 0, debrief: q => !!q.debrief,
};
const WRITE = {
  briefing: (q, doc) => doc.raw?.briefing && trimText(doc.raw.briefing) === q.briefing ? doc.raw.briefing : textLines(q.briefing),
  debrief: (q, doc) => doc.raw?.debrief && trimText(doc.raw.debrief) === q.debrief ? doc.raw.debrief : textLines(q.debrief),
  objectives: (q, doc) => [...(doc.lead?.objectives || []), ...q.objectives.flatMap(x => [itemLine(x, ''), ...(x._extra || []),
    ...(x.sub || []).flatMap(c => [itemLine(c, doc.indent || '  '), ...(c._extra || [])])])],
  criteria: (q, doc) => [...(doc.lead?.criteria || []), ...q.criteria.flatMap(c => [
    c._raw && c._raw.match(CHECK)?.[3] === c.t && /x/i.test(c._raw.match(CHECK)[2]) === !!c.met ? c._raw : `- [${c.met ? 'x' : ' '}] ${c.t}`,
    ...(c._extra || [])])],
  completions: (q, doc) => {
    const was = doc.raw?.completions && parseCompletions(doc.raw.completions);
    return appendOnly(doc.raw?.completions, was?.dates, q.completions, d => [`- ${d}`], false)
      ?? [...q.completions.map(d => `- ${d}`), ...(was?.extra || [])];
  },
  log: (q, doc) => appendOnly(doc.raw?.log, doc.raw?.log && parseLog(doc.raw.log), q.log, logLines, true)
    ?? q.log.flatMap((e, i) => [...(i ? [''] : []), ...logLines(e)]),
};

// Writes a quest back to Markdown. New headings use `lang`; existing lines whose meaning didn't change are kept as written.
function writeQuest(q, lang = 'en') {
  const doc = q.doc || {}, fm = ['---'], keyOf = e => e.key?.toLowerCase();
  const entries = [...(doc.fm || [])], managed = new Set();
  for (const k of FM_ORDER) if (!entries.some(e => keyOf(e) === k)) insertInOrder(entries, { key: k }, k, FM_ORDER, keyOf);
  for (const e of entries) {
    const k = keyOf(e), f = FIELDS[k];
    if (k === 'questboard' && !managed.has(k)) { managed.add(k); fm.push(...(e.raw || ['questboard: 1'])); continue; }
    if (!f || managed.has(k)) { fm.push(...e.raw); continue; }
    managed.add(k);
    if (e.raw) {
      const was = f.read(fmValue(e));
      if (same(was === BAD ? f.read('') : was, q[k])) { fm.push(...e.raw); continue; }
    } else if (same(q[k], f.read(''))) continue;
    const w = f.write(q[k]);
    if (w !== null) fm.push(`${e.key}: ${w}`);
  }
  fm.push('---');

  const secs = [...(doc.sections || [])], h = headingNames();
  for (const k of SECTIONS) if (!secs.some(s => s.kind === k) && WANT[k](q, doc)) insertInOrder(secs, { kind: k }, k, SECTIONS, s => s.kind);
  const blocks = doc.pre?.length ? [doc.pre] : [];
  for (const s of secs) blocks.push(s.kind ? [s.heading || `## ${h[s.kind]?.[lang] ?? h[s.kind].en}`, ...WRITE[s.kind](q, doc)] : [s.heading, ...s.lines]);
  const body = blocks.map(b => b.join('\n')).join('\n\n');
  return (fm.join('\n') + '\n' + (body ? '\n' + body + '\n' : '')).replace(/\n/g, doc.eol || '\n');
}

// Splits pasted AI output or dropped files into quest texts: code fences are ignored, and each "---"
// followed by a "key:" line starts a quest.
function splitImport(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => !/^\s*(```|~~~)/.test(l)), chunks = [];
  let cur = null, inFm = false;
  lines.forEach((l, i) => {
    if (l.trim() === '---') {
      if (inFm) { inFm = false; cur.push(l); return; }
      if (/^[A-Za-z_][\w-]*\s*:/.test(lines[i + 1] || '')) { chunks.push(cur = [l]); inFm = true; return; }
    }
    if (cur) cur.push(l);
  });
  return chunks.map(c => c.join('\n'));
}
const parseImport = text => splitImport(text).map(parseQuest).filter(Boolean);

// ---------------------------------------------------------------- data folder (§3)

const pad = n => String(n).padStart(2, '0');
// Local time as the files write it: "YYYY-MM-DD HH:MM".
const stampOf = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
// Milliseconds for a file date; a date alone means 23:59 that day.
const msOf = s => { const [y, mo, d, h = 23, mi = 59] = s.split(/[- :]/).map(Number); return new Date(y, mo - 1, d, h, mi).getTime(); };

const OPEN = ['available', 'active'];
// The seven starter guilds (§1.6), written to guilds.json on first start.
const STARTER_GUILDS = [
  { id: 'work', emblem: 'nodes' }, { id: 'study', emblem: 'book' }, { id: 'health', emblem: 'shield' }, { id: 'home', emblem: 'roof' },
  { id: 'people', emblem: 'rings' }, { id: 'admin', emblem: 'coin' }, { id: 'play', emblem: 'nib' },
];
const httpError = (status, message) => Object.assign(new Error(message), { status });
const folderFor = status => OPEN.includes(status) ? 'quests' : 'completed';
const baseOf = rel => path.posix.basename(rel, path.posix.extname(rel));

// The S line: the quest's own target, else sLineAt of the way from accepting to the deadline (§1.3).
function sLine(q, cfg) {
  if (q.target) return msOf(q.target);
  return q.deadline && q.created ? msOf(q.created) + (msOf(q.deadline) - msOf(q.created)) * cfg.sLineAt : null;
}
function gradeAt(q, ms, cfg) {
  const s = sLine(q, cfg);
  if (s !== null && ms <= s) return 'S';
  if (!q.deadline) return 'A';
  const d = msOf(q.deadline);
  return ms <= d ? 'A' : ms <= d + cfg.gradeBGraceHours * 36e5 ? 'B' : 'C';
}
const questXp = (q, cfg) => q.xp ?? cfg.xp[q.type];

// File names and ids: "2026-10-14-ship-portfolio.md" ↔ "q-20261014-ship-portfolio". A title with letters
// outside the Latin script gets a short random id instead of a slug (§3).
const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const randomId = n => Array.from({ length: n }, () => ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)]).join('');
// A slug longer than fileSlugMax ends at the last whole word that fits.
function fileSlug(title, cfg) {
  if (/[^\p{Script=Latin}\P{L}]/u.test(title)) return '';
  const full = title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (full.length <= cfg.fileSlugMax) return full;
  const cut = full.slice(0, cfg.fileSlugMax + 1), word = cut.lastIndexOf('-');
  return (word > 0 ? cut.slice(0, word) : cut.slice(0, cfg.fileSlugMax)).replace(/-+$/, '');
}
function makeId(rel, createdMs, taken, cfg) {
  const m = baseOf(rel).match(/^(\d{4})-(\d{2})-(\d{2})-(.+)$/);
  const date = m ? m[1] + m[2] + m[3] : stampOf(createdMs).slice(0, 10).replace(/-/g, '');
  const slug = fileSlug(m ? m[4] : baseOf(rel), cfg) || randomId(cfg.fileIdLength);
  let id = `q-${date}-${slug}`;
  for (let i = 2; taken.has(id); i++) id = `q-${date}-${slug}-${i}`;
  return id;
}
// A free path: "x.md", else "x-2.md", "x-3.md", …
function freePath(rel, taken) {
  const ext = path.posix.extname(rel), stem = rel.slice(0, -ext.length);
  let out = rel;
  for (let i = 2; taken(out); i++) out = `${stem}-${i}${ext}`;
  return out;
}

// Writes a temp file and renames it over the target, so a crash never leaves half a file (§3.3).
// Windows refuses the rename briefly while another program reads the file, so it retries a few times.
function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, text);
  for (let i = 0; ; i++) {
    try { return fs.renameSync(tmp, file); } catch (e) {
      if (i >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) { fs.rmSync(tmp, { force: true }); throw e; }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
}

// Collects the .md files under `rel`, skipping folders whose names start with a skipped prefix (§3.1).
function walk(dir, rel, skip, out = []) {
  let entries;
  try { entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const r = `${rel}/${e.name}`;
    if (e.isDirectory()) { if (!skip.some(p => e.name.startsWith(p))) walk(dir, r, skip, out); }
    else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) out.push(r);
  }
  return out;
}

// What history.jsonl says is counted: each closed quest's close event by id, and each activity's
// completion events by id and day (§3.4).
function readHistory(file) {
  const closed = new Map(), runs = new Map();
  if (!fs.existsSync(file)) return { closed, runs };
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.day) {
      if (!runs.has(e.id)) runs.set(e.id, new Map());
      if (e.event === 'complete') runs.get(e.id).set(e.day, e); else runs.get(e.id).delete(e.day);
    } else if (e.event === 'reopen') closed.delete(e.id);
    else closed.set(e.id, e);
  }
  return { closed, runs };
}

// Holds the parsed data folder and keeps it consistent with the rules of §1.1, §1.2.1 and §3:
// fills in what hand edits leave out, counts closes and reopens once in history.jsonl and player.json,
// keeps linked steps and child quests in step, and moves files to the folder their status asks for.
function createStore(cfg, { warn = console.warn } = {}) {
  const dir = resolveDataDir(cfg.dataDir), abs = rel => path.join(dir, ...rel.split('/'));
  const files = new Map();      // rel path → { mtimeMs, birthtimeMs, size, text, q (null if not a quest file), prev }
  let lastIds = new Map();      // id → file name at the end of the last pass, to tell a deleted linked quest from a renamed one
  const listeners = [];

  for (const top of ['quests', 'completed']) fs.mkdirSync(abs(top), { recursive: true });
  if (!fs.existsSync(abs('README.md'))) fs.copyFileSync(path.join(ROOT, 'app', 'data-readme.md'), abs('README.md'));
  const { closed, runs } = readHistory(abs('history.jsonl'));

  function readJson(rel, fallback) {
    if (!fs.existsSync(abs(rel))) return fallback;
    try { return JSON.parse(fs.readFileSync(abs(rel), 'utf8').replace(/^﻿/, '')); } catch (e) {
      fs.copyFileSync(abs(rel), abs(rel + '.broken'));
      warn(`${rel} could not be read (${e.message}); kept a copy as ${rel}.broken and started it fresh.`);
      return fallback;
    }
  }
  let player = readJson('player.json', { questboard: 1, days: {} }), playerDirty = false;
  const uiLang = () => readJson('settings.json', {}).language || cfg.defaults.language;

  const history = (e, ms) => fs.appendFileSync(abs('history.jsonl'), JSON.stringify({ at: stampOf(ms).replace(' ', 'T'), ...e }) + '\n');
  function bump(day, guild, field, xp, sign) {
    const b = ((player.days[day] ??= {})[guild] ??= { main: 0, side: 0, activity: 0, abandoned: 0, xp: 0 });
    b[field] = Math.max(0, b[field] + sign);
    b.xp = Math.max(0, b.xp + sign * xp);
    if (Object.values(b).every(v => v === 0)) delete player.days[day][guild];
    if (!Object.keys(player.days[day]).length) delete player.days[day];
    playerDirty = true;
  }

  // Brings history and player stats in line with the quest's status and completions. Returns true if the quest changed.
  // `quiet` (an undo) still counts, but writes nothing to the quest's log, so the file returns to exactly how it was.
  function count(q, by, when, now, lang, quiet) {
    let touched = false;
    const want = { complete: 'complete', abandoned: 'abandon' }[q.status] ?? null, was = closed.get(q.id);
    if (was && was.event !== want) {
      history({ event: 'reopen', id: q.id, xp: -(was.xp || 0) }, now);
      if (was.event === 'abandon') bump(was.at.slice(0, 10), was.guild, 'abandoned', 0, -1);
      else if (was.type !== 'activity') bump(was.at.slice(0, 10), was.guild, was.type, was.xp, -1);
      closed.delete(q.id);
      if (!want) {
        delete q.completed; delete q.grade; delete q.awarded;
        if (!quiet) q.log.push({ head: stampOf(now), text: T(lang, 't_reopen_q') });
        touched = true;
      }
    }
    if (want && !closed.has(q.id)) {
      const at = q.completed ? msOf(q.completed) : when, e = { event: want, id: q.id, type: q.type, guild: q.guild || 'none' };
      if (!q.completed) { q.completed = stampOf(at); touched = true; }
      if (want === 'complete' && q.type !== 'activity') {
        e.grade = q.grade || gradeAt(q, at, cfg);
        e.xp = q.awarded ?? Math.round(questXp(q, cfg) * cfg.gradeMultiplier[e.grade]);
        if (q.grade !== e.grade || q.awarded !== e.xp) { Object.assign(q, { grade: e.grade, awarded: e.xp }); touched = true; }
      }
      e.by = by;
      history(e, at);
      closed.set(q.id, { ...e, at: stampOf(at).replace(' ', 'T') });
      if (want === 'abandon') bump(stampOf(at).slice(0, 10), e.guild, 'abandoned', 0, 1);
      else if (q.type !== 'activity') bump(stampOf(at).slice(0, 10), e.guild, q.type, e.xp, 1);
    }
    // Activities earn their XP per completion, by the day in the Completions list (§1.4).
    if (q.type === 'activity' || runs.has(q.id)) {
      const days = runs.get(q.id) ?? new Map(), have = new Set(q.completions.map(d => d.slice(0, 10)));
      for (const [d, e] of days) if (!have.has(d)) {
        history({ event: 'reopen', id: q.id, day: d, xp: -e.xp }, now);
        bump(d, e.guild, 'activity', e.xp, -1);
        days.delete(d);
      }
      if (q.type === 'activity') for (const d of have) if (!days.has(d)) {
        const e = { event: 'complete', id: q.id, type: 'activity', guild: q.guild || 'none', day: d, xp: questXp(q, cfg), by };
        history(e, now);
        bump(d, e.guild, 'activity', e.xp, 1);
        days.set(d, e);
      }
      runs.set(q.id, days);
    }
    return touched;
  }

  // Runs every rule over the quests read in `changed` (rel paths), then writes and moves what changed.
  // `by` is "file" for hand edits found on disk and "app" for saves from the browser, which are always written.
  // `quiet` marks an undo: nothing is added to the quests' logs.
  function apply(changed, by, now, quiet = false) {
    const lang = uiLang(), dirty = new Set(by === 'app' ? changed : []), quests = () => [...files].filter(([, f]) => f.q);
    const idCount = new Map();
    for (const [, f] of quests()) if (f.q.id) idCount.set(f.q.id, (idCount.get(f.q.id) || 0) + 1);
    const taken = new Set(idCount.keys());

    for (const rel of changed) {
      const f = files.get(rel), q = f.q, when = by === 'app' ? now : f.mtimeMs;
      if (!q.id) { q.id = makeId(rel, f.birthtimeMs || f.mtimeMs, taken, cfg); taken.add(q.id); idCount.set(q.id, 1); dirty.add(rel); }
      if (!q.created) { q.created = stampOf(by === 'app' ? now : f.birthtimeMs || f.mtimeMs); dirty.add(rel); }
      for (const x of q.objectives.flatMap(o => [o, ...(o.sub || [])])) if (x.s !== 'open' && !x.at) { x.at = stampOf(when); dirty.add(rel); }
      if (!quiet && f.prev && f.prev.id === q.id && f.prev.type !== q.type) {
        q.log.push({ head: stampOf(now), text: `${T(lang, 't_type')}: ${T(lang, f.prev.type + '_q')} → ${T(lang, q.type + '_q')}` });
        dirty.add(rel);
      }
    }
    // Counting runs over every quest, since fixing one file of an id clash makes the other countable too.
    // Quests sharing an id are shown with a clash flag and counted once the ids differ.
    for (const [rel, f] of quests()) {
      const mine = changed.has(rel), when = mine && by === 'app' ? now : f.mtimeMs;
      if (idCount.get(f.q.id) === 1 && count(f.q, mine ? by : 'file', when, now, lang, quiet && mine)) dirty.add(rel);
    }

    // More than one tracked open quest: the most recently changed one keeps the flag (§3.2).
    const tracked = quests().filter(([, f]) => f.q.tracked && OPEN.includes(f.q.status)).sort(([, a], [, b]) => b.mtimeMs - a.mtimeMs);
    for (const [rel, f] of tracked.slice(1)) { delete f.q.tracked; dirty.add(rel); }

    // Linked quests (§1.2.1). The child's `parent:` id is the link the app trusts; the parent's wiki link follows it.
    const byName = new Map(quests().map(([rel]) => [baseOf(rel).toLowerCase(), rel]));
    const idRel = new Map(quests().map(([rel, f]) => [f.q.id, rel]));
    const resolve = link => byName.get(path.posix.basename(link.split('#')[0]).replace(/\.md$/i, '').toLowerCase());
    const steps = q => q.objectives.flatMap(o => [o, ...(o.sub || [])]).filter(x => x.link);
    const gone = new Set([...lastIds].filter(([id]) => !idRel.has(id)).map(([, name]) => name.toLowerCase()));
    for (const [rel, f] of quests()) for (const x of steps(f.q)) {
      if (!resolve(x.link) && gone.has(path.posix.basename(x.link.split('#')[0]).toLowerCase())) { delete x.link; dirty.add(rel); }
    }
    const STEP = { complete: 'done', abandoned: 'dropped', active: 'open', available: 'open' };
    const STATUS = { done: 'complete', dropped: 'abandoned', open: 'active' };
    for (const [crel, cf] of quests()) {
      const c = cf.q, prel = c.parent && idRel.get(c.parent), pf = prel && files.get(prel);
      if (!pf || pf.q.parent || idCount.get(c.parent) > 1) continue;
      let x = steps(pf.q).find(s => resolve(s.link) === crel);
      if (!x) {
        const broken = steps(pf.q).filter(s => !resolve(s.link));
        x = broken.find(s => s.t === c.title) ?? (broken.length === 1 ? broken[0] : null);
        if (!x) continue;
        x.link = baseOf(crel);
        dirty.add(prel);
      }
      if (STEP[c.status] === x.s) continue;
      const parentWins = changed.has(prel) !== changed.has(crel) ? changed.has(prel) : pf.mtimeMs > cf.mtimeMs;
      if (parentWins && STATUS[x.s]) {
        c.status = STATUS[x.s];
        count(c, by, by === 'app' ? now : pf.mtimeMs, now, lang);
        dirty.add(crel);
      } else if (!parentWins) {
        x.s = STEP[c.status];
        if (x.s === 'open') delete x.at; else x.at = c.completed || stampOf(now);
        dirty.add(prel);
      }
    }

    // Write what changed, and move each file to the folder its status asks for, keeping its subfolder (§3.1).
    const moved = new Map();
    for (const [rel, f] of quests()) {
      const want = folderFor(f.q.status), top = rel.split('/')[0];
      if (!dirty.has(rel) && top === want) continue;
      const to = top === want ? rel : freePath(want + rel.slice(top.length), r => r !== rel && (files.has(r) || fs.existsSync(abs(r))));
      try {
        if (dirty.has(rel)) writeAtomic(abs(to), writeQuest(f.q, lang));
        else fs.renameSync(abs(rel), abs(to));
        if (to !== rel) { if (dirty.has(rel)) fs.rmSync(abs(rel), { force: true }); files.delete(rel); moved.set(rel, to); }
        const text = fs.readFileSync(abs(to), 'utf8'), st = fs.statSync(abs(to));
        files.set(to, { mtimeMs: st.mtimeMs, birthtimeMs: st.birthtimeMs, size: st.size, text, q: parseQuest(text), prev: f.q });
      } catch (e) { warn(`Could not save ${rel}: ${e.message}`); }
    }
    if (playerDirty) { writeAtomic(abs('player.json'), JSON.stringify(player, null, 2) + '\n'); playerDirty = false; }
    lastIds = new Map(quests().map(([rel, f]) => [f.q.id, baseOf(rel)]));
    return { dirty, moved };
  }

  // Reads the folder and applies the rules to every file that changed since the last pass. Returns true if anything changed.
  function sync() {
    const seen = new Set(), changed = new Set();
    let removed = false;
    for (const top of ['quests', 'completed']) for (const rel of walk(dir, top, cfg.scan.skipFolderPrefixes)) {
      seen.add(rel);
      const old = files.get(rel);
      let st, text;
      try {
        st = fs.statSync(abs(rel));
        if (old && old.mtimeMs === st.mtimeMs && old.size === st.size) continue;
        text = fs.readFileSync(abs(rel), 'utf8');
      } catch { continue; }
      const q = isQuestFile(text) ? parseQuest(text) : null;
      files.set(rel, { mtimeMs: st.mtimeMs, birthtimeMs: st.birthtimeMs, size: st.size, text, q, prev: old?.q });
      if (q && old?.text !== text) changed.add(rel);
      if (!q && old?.q) removed = true;
    }
    for (const [rel, f] of files) if (!seen.has(rel)) { files.delete(rel); if (f.q) removed = true; }
    if (!changed.size && !removed) return false;
    apply(changed, 'file', Date.now());
    listeners.forEach(fn => fn());
    return true;
  }

  // Saves a quest from the app. `rel` is its current file, or omitted for a new quest. Returns the file it ended up in.
  // With `version` (the file's change time the browser last saw), a file changed since then is refused with status 409.
  // `undo` puts back an earlier version: counted as usual, but nothing is added to the quest's log.
  function save(q, rel, version, undo = false) {
    if (rel) {
      sync();
      if (!files.get(rel)?.q) throw httpError(404, `No quest file ${rel}`);
      if (version !== undefined && files.get(rel).mtimeMs !== version) throw httpError(409, `${rel} changed on disk; reload it before saving`);
    }
    const now = Date.now();
    if (!rel) {
      const name = `${stampOf(now).slice(0, 10)}-${fileSlug(q.title || '', cfg) || randomId(cfg.fileIdLength)}.md`;
      rel = freePath(`${folderFor(q.status || 'active')}/${name}`, r => files.has(r) || fs.existsSync(abs(r)));
    }
    files.set(rel, { ...files.get(rel), mtimeMs: now, q, prev: files.get(rel)?.q });
    const { moved } = apply(new Set([rel]), 'app', now, undo);
    listeners.forEach(fn => fn());
    return moved.get(rel) ?? rel;
  }

  // Split into quest (§1.2.1): the step at `at` ([i] or [i, j]) becomes a quest of its own, with the step's title,
  // deadline and sub-steps and the parent's guild and type (side for an activity's step); the step links to it.
  function split(rel, at, version) {
    sync();
    const f = files.get(rel), parent = f?.q;
    if (!parent) throw httpError(404, `No quest file ${rel}`);
    if (version !== undefined && f.mtimeMs !== version) throw httpError(409, `${rel} changed on disk; reload it before saving`);
    const x = at.length === 1 ? parent.objectives[at[0]] : parent.objectives[at[0]]?.sub?.[at[1]];
    if (!x) throw httpError(400, 'No step at that position');
    if (parent.parent || x.link || x.any) throw httpError(400, 'A linked quest, a linked step or an any-one group cannot be split');
    const objectives = (x.sub || []).map(({ _raw, _extra, ...y }) => y);
    const child = { title: x.t, type: parent.type === 'activity' ? 'side' : parent.type, guild: parent.guild, status: 'active', parent: parent.id,
      deadline: x.due, objectives, criteria: [], completions: [], log: [], briefing: '', debrief: '' };
    const childRel = save(child);
    Object.assign(x, { link: baseOf(childRel) });
    delete x.due; delete x.sub;
    return { rel: save(parent, rel), child: childRel };
  }

  // Removes a quest file. Only undo uses this, to take back a quest the app just created (a split or a new quest).
  function remove(rel, version) {
    sync();
    const f = files.get(rel);
    if (!f?.q) throw httpError(404, `No quest file ${rel}`);
    if (version !== undefined && f.mtimeMs !== version) throw httpError(409, `${rel} changed on disk; reload it before saving`);
    fs.rmSync(abs(rel));
    sync();
  }

  // Guilds (§1.6): guilds.json lists them in order, each { id, emblem, name?, motto?, color?, hidden? }.
  // A guild with no name or motto takes them from the interface language.
  const guilds = () => readJson('guilds.json', { guilds: STARTER_GUILDS }).guilds;
  function saveGuilds(list) {
    const ok = Array.isArray(list) && list.every(g => isObj(g) && /^[a-z0-9-]+$/.test(g.id) && typeof g.emblem === 'string'
      && ['name', 'motto', 'color'].every(k => g[k] === undefined || typeof g[k] === 'string') && (g.hidden === undefined || typeof g.hidden === 'boolean'))
      && new Set(list.map(g => g.id)).size === list.length && !list.some(g => g.id === 'none');
    if (!ok) throw httpError(400, 'Each guild needs a unique lowercase id (not "none") and an emblem; name, motto and color are text, hidden is true or false');
    writeAtomic(abs('guilds.json'), JSON.stringify({ questboard: 1, guilds: list }, null, 2) + '\n');
    listeners.forEach(fn => fn());
  }
  if (!fs.existsSync(abs('guilds.json'))) writeAtomic(abs('guilds.json'), JSON.stringify({ questboard: 1, guilds: STARTER_GUILDS }, null, 2) + '\n');

  // settings.json holds the choices from the settings popup; the caller validates them.
  const settings = () => readJson('settings.json', {});
  function saveSettings(values) {
    writeAtomic(abs('settings.json'), JSON.stringify({ ...settings(), ...values }, null, 2) + '\n');
    listeners.forEach(fn => fn());
  }

  // player.json import (§3.5): "add" sums another file into this one day by day and guild by guild; "replace" swaps it.
  function importPlayer(p, mode) {
    const fields = ['main', 'side', 'activity', 'abandoned', 'xp'];
    const ok = isObj(p) && isObj(p.days) && Object.entries(p.days).every(([d, gs]) => parseDate(d) === d && isObj(gs)
      && Object.values(gs).every(b => isObj(b) && fields.every(k => b[k] === undefined || (Number.isFinite(b[k]) && b[k] >= 0))));
    if (!ok || !['add', 'replace'].includes(mode)) throw httpError(400, 'Not a player.json, or mode is not "add" or "replace"');
    if (mode === 'replace') player = { questboard: 1, days: {} };
    for (const [d, gs] of Object.entries(p.days)) for (const [g, b] of Object.entries(gs)) {
      const to = ((player.days[d] ??= {})[g] ??= Object.fromEntries(fields.map(k => [k, 0])));
      for (const k of fields) to[k] += b[k] || 0;
    }
    writeAtomic(abs('player.json'), JSON.stringify(player, null, 2) + '\n');
    listeners.forEach(fn => fn());
  }

  function known(rel) {
    if (!files.get(rel)?.q) throw httpError(404, `No quest file ${rel}`);
    return abs(rel);
  }

  // Watches the folder for hand edits; where the system can't watch a folder tree, rescans on a timer.
  let watcher, poller, timer;
  function watch() {
    const run = () => { try { sync(); } catch (e) { warn(`Reading the data folder failed: ${e.message}`); } };
    try {
      watcher = fs.watch(dir, { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(run, cfg.scan.watchDebounceMs); });
      watcher.on('error', e => warn(`Watching the data folder failed: ${e.message}`));
    } catch { poller = setInterval(run, cfg.scan.pollSeconds * 1000); }
  }
  function close() { watcher?.close(); clearInterval(poller); clearTimeout(timer); }

  // Each quest with its file, the file's change time as `version`, `clash` when another file has the same id,
  // and for a closed quest `by`: "app" or "file", as history.jsonl recorded the close.
  function quests() {
    const list = [...files].filter(([, f]) => f.q), ids = list.map(([, f]) => f.q.id);
    return list.map(([rel, f]) => ({ rel, version: f.mtimeMs, clash: ids.indexOf(f.q.id) !== ids.lastIndexOf(f.q.id),
      by: OPEN.includes(f.q.status) ? undefined : closed.get(f.q.id)?.by, q: f.q }));
  }

  return {
    dir, sync, save, split, remove, watch, close, quests, guilds, saveGuilds, settings, saveSettings, importPlayer,
    onChange: fn => listeners.push(fn),
    player: () => player,
    text: rel => fs.readFileSync(known(rel), 'utf8'),
    path: known,
  };
}

// ---------------------------------------------------------------- static files

// URL prefix → folder. The first matching prefix wins, so "/" stays last.
const STATIC = { '/styles/': 'styles', '/locales/': 'locales', '/prompts/': 'prompts', '/': 'app' };
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon',
};

function send(res, status, body = '', type = 'text/plain; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { return send(res, 400, 'Bad request'); }
  const prefix = Object.keys(STATIC).find(p => url.startsWith(p));
  const base = path.join(ROOT, STATIC[prefix]);
  const file = path.join(base, url.slice(prefix.length) || 'index.html');
  if (!file.startsWith(base + path.sep)) return send(res, 404, 'Not found');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Not found');
    send(res, 200, req.method === 'HEAD' ? '' : buf, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  });
}

// ---------------------------------------------------------------- HTTP API
// The page reads everything from GET /api/state and hears about changes on GET /api/events (server-sent events).
// Writes take JSON. Only requests addressed to this server's own host name are answered, and writes need a JSON
// content type, so another website open in the browser can neither read the data nor post to it.

const sendJson = (res, status, data, headers) => send(res, status, JSON.stringify(data), 'application/json; charset=utf-8', headers);
const download = name => ({ 'Content-Disposition': `attachment; filename="${name}"` });
// Leaves out the parts of a quest that only the writer needs, for export.
const plainQuest = q => JSON.parse(JSON.stringify(q, (k, v) => k === 'doc' || k === 'problems' || k.startsWith('_') ? undefined : v));

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => { size += c.length; if (size <= limit) chunks.push(c); });
    req.on('end', () => {
      if (size > limit) return reject(httpError(413, 'Request too large; see maxRequestMB in config.default.jsonc'));
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(httpError(400, 'Body is not JSON')); }
    });
    req.on('error', reject);
  });
}

// A quest from the page must have the shape the writer expects.
function checkQuest(q) {
  const dates = ['created', 'deadline', 'target', 'completed'];
  const ok = isObj(q) && typeof q.title === 'string' && q.title.trim() !== ''
    && ['main', 'side', 'activity'].includes(q.type ?? 'side') && ['available', 'active', 'complete', 'abandoned'].includes(q.status ?? 'active')
    && dates.every(k => q[k] === undefined || q[k] === null || parseDate(q[k]) === q[k])
    && ['objectives', 'criteria', 'completions', 'log'].every(k => q[k] === undefined || Array.isArray(q[k]));
  if (!ok) throw httpError(400, 'A quest needs a title; type, status and dates must be valid; objectives, criteria, completions and log are lists');
  q.type ??= 'side';
  q.status ??= 'active';
  for (const k of ['objectives', 'criteria', 'completions', 'log']) q[k] ??= [];
  for (const k of ['briefing', 'debrief']) q[k] ??= '';
  for (const k of dates) if (q[k] === null) delete q[k];
  return q;
}

function createServer(cfg, store) {
  const clients = new Set();
  store.onChange(() => { for (const res of clients) res.write('event: change\ndata: {}\n\n'); });

  // The style files, the configured default first.
  const styles = () => (fs.existsSync(path.join(ROOT, 'styles')) ? fs.readdirSync(path.join(ROOT, 'styles')).filter(f => f.endsWith('.css')).map(f => f.slice(0, -4)) : [])
    .sort((a, b) => (b === cfg.defaults.style) - (a === cfg.defaults.style));
  // Settings are the config defaults with data/settings.json over them; a bad saved value falls back with a warning.
  const settings = (warn = console.warn) => mergeConfig({ defaults: cfg.defaults }, { defaults: store.settings() }, 'settings.json', warn).defaults;

  // Reads pasted AI output or dropped files: each quest with its problems; an unknown guild is cleared (§2.2).
  function parse(text) {
    const ids = new Set(store.guilds().map(g => g.id));
    return parseImport(String(text)).map(q => {
      if (q.guild && !ids.has(q.guild)) { q.problems.push({ code: 'w_guild', key: 'guild', value: q.guild }); delete q.guild; }
      return { quest: q, problems: q.problems, ok: !!q.title };
    });
  }

  const routes = {
    'GET /api/state': () => ({
      config: cfg, settings: settings(), guilds: store.guilds(), player: store.player(),
      languages: Object.keys(locales()), styles: styles(),
      quests: store.quests().map(({ rel, version, clash, by, q }) => ({ rel, version, clash, by, quest: q })),
    }),
    'GET /api/file': (_, url) => ({ text: store.text(url.searchParams.get('rel')) }),
    'POST /api/save': b => {
      const rel = store.save(checkQuest(b.quest), b.rel, b.version, b.undo === true);
      const saved = store.quests().find(x => x.rel === rel);
      return { rel, version: saved.version, quest: saved.q };
    },
    'POST /api/split': b => store.split(b.rel, Array.isArray(b.at) ? b.at : [], b.version),
    'POST /api/remove': b => { store.remove(b.rel, b.version); return {}; },
    'POST /api/parse': b => ({ quests: parse(b.text) }),
    // Imports create active quests with fresh ids (§2.2); quests without a title are skipped.
    'POST /api/import': b => {
      const found = parse(b.text), rels = [];
      for (const { quest: q, ok } of found) {
        if (!ok) continue;
        for (const k of ['id', 'parent', 'tracked', 'favorite', 'completed', 'grade', 'awarded', 'created']) delete q[k];
        if (q.status !== 'available') q.status = 'active';
        rels.push(store.save(q));
      }
      return { rels, skipped: found.length - rels.length };
    },
    'PUT /api/guilds': b => { store.saveGuilds(b.guilds); return { guilds: store.guilds() }; },
    'PUT /api/settings': b => {
      const errors = [];
      const values = mergeConfig({ defaults: cfg.defaults }, { defaults: isObj(b) ? b : null }, 'settings', e => errors.push(e)).defaults;
      if (errors.length) throw httpError(400, errors.join(' '));
      store.saveSettings(Object.fromEntries(Object.keys(b).map(k => [k, values[k]])));
      return { settings: settings() };
    },
    'GET /api/player': () => [store.player(), download('player.json')],
    'POST /api/player': b => { store.importPlayer(b.player, b.mode); return { player: store.player() }; },
    'GET /api/export': () => [{
      questboard: 1, exported: stampOf(Date.now()).replace(' ', 'T'), guilds: store.guilds(),
      quests: store.quests().map(({ rel, q }) => ({ file: rel, quest: plainQuest(q), markdown: store.text(rel) })),
    }, download(`questboard-export-${stampOf(Date.now()).slice(0, 10)}.json`)],
    'POST /api/open': b => { openInOs(store.path(b.rel)); return {}; },
  };

  async function api(req, res, url) {
    const writes = req.method !== 'GET', hosts = [`localhost:${req.socket.localPort}`, `127.0.0.1:${req.socket.localPort}`];
    if (!hosts.includes(req.headers.host) || (req.headers.origin && !hosts.some(h => req.headers.origin === `http://${h}`))
      || (writes && !/^application\/json\b/.test(req.headers['content-type'] || ''))) return sendJson(res, 403, { error: 'Forbidden' });
    if (req.method === 'GET' && url.pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(': connected\n\n');
      clients.add(res);
      return req.on('close', () => clients.delete(res));
    }
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) return sendJson(res, 404, { error: 'Not found' });
    try {
      const body = writes ? await readBody(req, cfg.maxRequestMB * 1024 * 1024) : null;
      const out = route(body, url);
      const [data, headers] = Array.isArray(out) ? out : [out];
      sendJson(res, 200, data, headers);
    } catch (e) {
      if (!e.status) console.error(e);
      sendJson(res, e.status || 500, { error: e.message });
    }
  }

  return http.createServer((req, res) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return send(res, 400, 'Bad request'); }
    if (url.pathname.startsWith('/api/')) return api(req, res, url);
    serveStatic(req, res);
  });
}

// ---------------------------------------------------------------- start

// Opens a URL or file with the system's default program.
function openInOs(target) {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', `"${target}"`]]
    : [process.platform === 'darwin' ? 'open' : 'xdg-open', [target]];
  spawn(cmd, args, { detached: true, stdio: 'ignore', windowsVerbatimArguments: true }).on('error', () => {}).unref();
}

function main() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 18) {
    console.error(`Questboard needs Node.js 18 or newer; this is ${process.versions.node}. Install the LTS version from nodejs.org.`);
    process.exit(1);
  }
  const cfg = loadConfig();
  const store = createStore(cfg);
  store.sync();
  store.watch();
  const server = createServer(cfg, store);
  server.on('error', e => {
    console.error(e.code === 'EADDRINUSE'
      ? `Port ${cfg.port} is already in use. Is Questboard already running? To use another port, set "port" in config.jsonc.`
      : e.message);
    process.exit(1);
  });
  server.listen(cfg.port, '127.0.0.1', () => {
    const url = `http://localhost:${cfg.port}`;
    console.log(`Questboard is running at ${url}\nData folder: ${store.dir}\nPress Ctrl+C to stop.`);
    if (cfg.openBrowser) openInOs(url);
  });
}

module.exports = {
  stripJsonc, mergeConfig, loadConfig, resolveDataDir, openInOs, parseDate, parseRepeat, isQuestFile, parseQuest, writeQuest, parseImport,
  gradeAt, createStore, createServer,
};
if (require.main === module) main();
