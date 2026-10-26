// HTTP API: every route against a temporary data folder, plus the guard against other websites. Run: node --test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { loadConfig, createStore, createServer } = require('../questboard.js');

const md = lines => lines.join('\n') + '\n';

async function setup(t, over = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'questboard-api-'));
  const cfg = { ...loadConfig(() => {}), dataDir: dir, ...over };
  const store = createStore(cfg, { warn: () => {} });
  store.sync();
  const server = createServer(cfg, store);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  t.after(() => { server.closeAllConnections?.(); server.close(); store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  // One request; JSON bodies are sent with a JSON content type unless headers say otherwise.
  const call = (method, url, body, headers = {}) => new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, method, path: url,
      headers: { Host: `localhost:${port}`, ...(data && { 'Content-Type': 'application/json' }), ...headers } }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', c => { text += c; });
      res.on('end', () => { let json; try { json = JSON.parse(text); } catch { /* not JSON */ } resolve({ status: res.statusCode, headers: res.headers, json, text }); });
    });
    req.on('error', reject);
    req.end(data);
  });
  return { dir, store, port, call, read: rel => fs.readFileSync(path.join(dir, ...rel.split('/')), 'utf8') };
}

const NEW = { title: 'Book flights to Osaka', type: 'main', guild: 'people', deadline: '2026-11-02 18:00', briefing: 'Before prices go up.',
  objectives: [{ t: 'Compare fares', s: 'open' }, { t: 'Pick seats', s: 'open', sub: [{ t: 'Window', s: 'open' }] }], criteria: [{ t: 'Tickets in the inbox' }] };

test('state: config, default settings, starter guilds, languages and quests', async t => {
  const h = await setup(t);
  const { status, json } = await h.call('GET', '/api/state');
  assert.equal(status, 200);
  assert.equal(json.config.favoritesMax, 5);
  assert.equal(json.settings.weekStart, 'sunday');
  assert.deepEqual(json.guilds.map(g => g.id), ['work', 'study', 'health', 'home', 'people', 'admin', 'play']);
  assert.deepEqual(json.languages.sort(), ['en', 'zh']);
  assert.deepEqual(json.quests, []);
  assert.ok(fs.existsSync(path.join(h.dir, 'guilds.json')));
});

test('guard: another host name, another origin, or a write without a JSON content type is refused', async t => {
  const h = await setup(t);
  assert.equal((await h.call('GET', '/api/state', undefined, { Host: 'evil.example:80' })).status, 403);
  assert.equal((await h.call('GET', '/api/state', undefined, { Origin: 'http://evil.example' })).status, 403);
  assert.equal((await h.call('POST', '/api/save', { quest: NEW }, { 'Content-Type': 'text/plain' })).status, 403);
  assert.equal((await h.call('GET', '/api/state', undefined, { Origin: `http://localhost:${h.port}` })).status, 200);
  assert.equal((await h.call('GET', '/', undefined, { Host: 'evil.example:80' })).status, 200, 'static files are not data');
});

test('save: creates a file, saves with the current version, refuses a stale one, and checks the quest', async t => {
  const h = await setup(t);
  const made = await h.call('POST', '/api/save', { quest: NEW });
  assert.equal(made.status, 200);
  assert.match(made.json.rel, /^quests\/\d{4}-\d\d-\d\d-book-flights-to-osaka\.md$/);
  assert.match(h.read(made.json.rel), /\n## Objectives\n- \[ \] Compare fares\n- \[ \] Pick seats\n {2}- \[ \] Window\n\n## Completion criteria\n- \[ \] Tickets in the inbox\n$/);
  const q = made.json.quest;
  q.objectives[0].s = 'done';
  const ok = await h.call('POST', '/api/save', { rel: made.json.rel, version: made.json.version, quest: q });
  assert.equal(ok.status, 200);
  assert.match(h.read(made.json.rel), /\n- \[x\] Compare fares @done\(\d{4}-\d\d-\d\d \d\d:\d\d\)\n/);
  assert.equal((await h.call('POST', '/api/save', { rel: made.json.rel, version: made.json.version, quest: q })).status, 409);
  assert.equal((await h.call('POST', '/api/save', { quest: { ...NEW, title: '' } })).status, 400);
  assert.equal((await h.call('POST', '/api/save', { quest: { ...NEW, deadline: 'soon' } })).status, 400);
  assert.equal((await h.call('POST', '/api/save', { rel: 'quests/nope.md', quest: NEW })).status, 404);
  const file = await h.call('GET', `/api/file?rel=${encodeURIComponent(made.json.rel)}`);
  assert.equal(file.json.text, h.read(made.json.rel));
  assert.equal((await h.call('GET', '/api/file?rel=../config.jsonc')).status, 404);
});

test('split: the step becomes a linked quest with its title, deadline and sub-steps', async t => {
  const h = await setup(t);
  const parent = { ...NEW, objectives: [{ t: 'Compare fares', s: 'open', due: '2026-10-30 12:00', sub: [{ t: 'Peach', s: 'open' }, { t: 'ANA', s: 'open' }] }] };
  const made = await h.call('POST', '/api/save', { quest: parent });
  const { status, json } = await h.call('POST', '/api/split', { rel: made.json.rel, version: made.json.version, at: [0] });
  assert.equal(status, 200);
  assert.match(json.child, /^quests\/\d{4}-\d\d-\d\d-compare-fares\.md$/);
  const child = h.read(json.child), base = path.posix.basename(json.child, '.md');
  assert.match(child, /\nparent: q-\d{8}-book-flights-to-osaka\ntype: main\nguild: people\ntitle: Compare fares\n/);
  assert.match(child, /\ndeadline: 2026-10-30T12:00\n[\s\S]*## Objectives\n- \[ \] Peach\n- \[ \] ANA\n$/);
  assert.match(h.read(json.rel), new RegExp(`\\n- \\[ \\] \\[\\[${base}\\|Compare fares\\]\\]\\n\\n## Completion criteria`));
  assert.equal((await h.call('POST', '/api/split', { rel: json.child, at: [0] })).status, 400, 'a linked quest cannot link further');
});

test('remove: undo takes back a quest it created; a file changed since is refused', async t => {
  const h = await setup(t);
  const made = await h.call('POST', '/api/save', { quest: NEW });
  assert.equal((await h.call('POST', '/api/remove', { rel: made.json.rel, version: made.json.version + 1 })).status, 409);
  assert.equal((await h.call('POST', '/api/remove', { rel: made.json.rel, version: made.json.version })).status, 200);
  assert.ok(!fs.existsSync(path.join(h.dir, ...made.json.rel.split('/'))));
  assert.equal((await h.call('POST', '/api/remove', { rel: made.json.rel })).status, 404);
  assert.equal((await h.call('POST', '/api/remove', { rel: 'guilds.json' })).status, 404, 'only quest files');
});

test('parse and import: problems per quest, unknown guild cleared, untitled quests skipped', async t => {
  const h = await setup(t);
  const text = ['```markdown', '---', 'questboard: 1', 'guild: garden', 'title: Repot the ficus', 'deadline: someday', '---', '', '## Objectives', '- [ ] Buy soil', '```',
    '```markdown', '---', 'type: side', '---', '```'].join('\n');
  const parsed = await h.call('POST', '/api/parse', { text });
  assert.deepEqual(parsed.json.quests.map(x => [x.ok, x.problems.map(p => p.code)]), [[true, ['w_date', 'w_guild']], [false, ['e_title']]]);
  const imported = await h.call('POST', '/api/import', { text });
  assert.equal(imported.json.skipped, 1);
  const out = h.read(imported.json.rels[0]);
  assert.ok(!out.includes('guild:'));
  assert.match(out, /\nid: q-\d{8}-repot-the-ficus\n/);
  assert.match(out, /\ndeadline: someday\n/, 'an unreadable date stays as written and simply gives no deadline');
});

test('settings and guilds: valid changes are saved, bad ones refused', async t => {
  const h = await setup(t);
  const s = await h.call('PUT', '/api/settings', { weekStart: 'monday', language: 'zh', calendarMode: 'steps' });
  assert.equal(s.status, 200);
  assert.deepEqual([s.json.settings.weekStart, s.json.settings.language, s.json.settings.sound], ['monday', 'zh', true]);
  assert.deepEqual(JSON.parse(h.read('settings.json')), { weekStart: 'monday', language: 'zh', calendarMode: 'steps' });
  for (const bad of [{ weekStart: 'tuesday' }, { language: 'xx' }, { colour: 'red' }, { sound: 'yes' }]) assert.equal((await h.call('PUT', '/api/settings', bad)).status, 400, JSON.stringify(bad));
  const g = (await h.call('GET', '/api/state')).json.guilds;
  g[0].name = 'Day job';
  g.push({ id: 'garden', emblem: 'M4 20h16', color: '#5a8' });
  assert.equal((await h.call('PUT', '/api/guilds', { guilds: g })).status, 200);
  assert.deepEqual((await h.call('GET', '/api/state')).json.guilds.slice(-1), [{ id: 'garden', emblem: 'M4 20h16', color: '#5a8' }]);
  assert.equal((await h.call('PUT', '/api/guilds', { guilds: [...g, { id: 'garden', emblem: 'x' }] })).status, 400);
  assert.equal((await h.call('PUT', '/api/guilds', { guilds: [{ id: 'Bad Id', emblem: 'x' }] })).status, 400);
});

test('player: export downloads player.json; import adds or replaces', async t => {
  const h = await setup(t);
  const other = { questboard: 1, days: { '2026-10-20': { home: { main: 0, side: 1, activity: 0, abandoned: 0, xp: 100 } } } };
  assert.equal((await h.call('POST', '/api/player', { mode: 'add', player: other })).status, 200);
  const added = await h.call('POST', '/api/player', { mode: 'add', player: other });
  assert.deepEqual(added.json.player.days['2026-10-20'].home, { main: 0, side: 2, activity: 0, abandoned: 0, xp: 200 });
  const replaced = await h.call('POST', '/api/player', { mode: 'replace', player: other });
  assert.equal(replaced.json.player.days['2026-10-20'].home.xp, 100);
  const out = await h.call('GET', '/api/player');
  assert.match(out.headers['content-disposition'], /filename="player\.json"/);
  assert.deepEqual(out.json, JSON.parse(h.read('player.json')));
  assert.equal((await h.call('POST', '/api/player', { mode: 'merge', player: other })).status, 400);
  assert.equal((await h.call('POST', '/api/player', { mode: 'add', player: { days: { 'Oct 20': {} } } })).status, 400);
});

test('export: every quest and guild in one JSON file, without the writer\'s bookkeeping', async t => {
  const h = await setup(t);
  await h.call('POST', '/api/save', { quest: NEW });
  const { json, headers } = await h.call('GET', '/api/export');
  assert.match(headers['content-disposition'], /questboard-export-\d{4}-\d\d-\d\d\.json/);
  assert.equal(json.guilds.length, 7);
  assert.equal(json.quests[0].quest.title, NEW.title);
  assert.ok(!('doc' in json.quests[0].quest) && !('_raw' in json.quests[0].quest.objectives[0]));
  assert.match(json.quests[0].markdown, /^---\nquestboard: 1\n/);
});

test('events: a save is announced to open pages; open refuses unknown files; large bodies are refused', async t => {
  const h = await setup(t, { maxRequestMB: 0.001 });
  const heard = new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: h.port, path: '/api/events', headers: { Host: `localhost:${h.port}` } }, res => {
      res.setEncoding('utf8');
      res.on('data', c => { if (c.includes('event: change')) { resolve(true); req.destroy(); } });
    });
    req.on('error', reject);
    setTimeout(() => resolve(false), 3000);
  });
  await new Promise(r => setTimeout(r, 100));
  await h.call('POST', '/api/save', { quest: NEW });
  assert.equal(await heard, true);
  assert.equal((await h.call('POST', '/api/open', { rel: '../../Windows/notepad.exe' })).status, 404);
  assert.equal((await h.call('POST', '/api/parse', { text: 'x'.repeat(5000) })).status, 413);
});
