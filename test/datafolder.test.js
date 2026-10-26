// Data folder rules (DESIGN.md §1.1, §1.2.1, §3): filling in, counting once, moving, linked quests, watching. Run: node --test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadConfig, createStore, gradeAt } = require('../questboard.js');

const md = lines => lines.join('\n') + '\n';
const local = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi);

// A fresh data folder in the system temp folder, with helpers to edit it the way a person would.
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'questboard-test-'));
  const warnings = [];
  const cfg = { ...loadConfig(() => {}), dataDir: dir };
  const f = rel => path.join(dir, ...rel.split('/'));
  const h = {
    dir, cfg, warnings,
    store: createStore(cfg, { warn: w => warnings.push(w) }),
    restart() { h.store.close(); h.store = createStore(cfg, { warn: w => warnings.push(w) }); return h.store; },
    put(rel, text, mtime) {
      fs.mkdirSync(path.dirname(f(rel)), { recursive: true });
      fs.writeFileSync(f(rel), text);
      if (mtime) fs.utimesSync(f(rel), mtime, mtime);
    },
    edit(rel, from, to, mtime) { h.put(rel, h.read(rel).replace(from, to), mtime); },
    read: rel => fs.readFileSync(f(rel), 'utf8'),
    exists: rel => fs.existsSync(f(rel)),
    history: () => h.exists('history.jsonl') ? h.read('history.jsonl').trim().split('\n').map(l => JSON.parse(l)) : [],
    player: () => JSON.parse(h.read('player.json')),
    done() { h.store.close(); fs.rmSync(dir, { recursive: true, force: true }); },
  };
  return h;
}

const GYM = md(['---', 'questboard: 1', 'id: q-20261020-gym', 'guild: health', 'title: Renew the gym membership', 'status: complete',
  'created: 2026-10-20T12:00', 'deadline: 2026-10-31', '---', '', '## Objectives', '- [x] Pay at the front desk @done(2026-10-26 08:35)']);

test('grades: S by the S line, A by the deadline, B within the grace, C later, A or S with no deadline', () => {
  const cfg = loadConfig(() => {}), q = { created: '2026-10-14 20:00', deadline: '2026-11-08 18:00' };
  assert.equal(gradeAt(q, local(2026, 11, 2, 12, 30).getTime(), cfg), 'S');
  assert.equal(gradeAt(q, local(2026, 11, 2, 12, 31).getTime(), cfg), 'A');
  assert.equal(gradeAt(q, local(2026, 11, 9, 18, 0).getTime(), cfg), 'B');
  assert.equal(gradeAt(q, local(2026, 11, 9, 18, 1).getTime(), cfg), 'C');
  assert.equal(gradeAt({ created: '2026-10-14 20:00' }, Date.now(), cfg), 'A');
  assert.equal(gradeAt({ target: '2026-11-01' }, local(2026, 11, 1, 23, 0).getTime(), cfg), 'S');
});

test('a new hand-written file gets an id, a created time and the data folder README, and nothing else changes', t => {
  const h = setup(); t.after(h.done);
  const text = md(['---', 'questboard: 1', 'title: Renew passport', 'deadline: 2026-11-20', '---', '', '## Objectives', '- [ ] Take the photo']);
  h.put('quests/Renew passport.md', text);
  h.store.sync();
  const out = h.read('quests/Renew passport.md');
  assert.match(out, /^---\nquestboard: 1\nid: q-\d{8}-renew-passport\ntitle: Renew passport\ncreated: \d{4}-\d\d-\d\dT\d\d:\d\d\ndeadline: 2026-11-20\n---\n/);
  assert.equal(out.replace(/id: .*\n/, '').replace(/created: .*\n/, ''), text);
  assert.ok(h.exists('README.md'));
  assert.deepEqual(h.history(), []);
});

test('a quest closed by hand is graded, counted once with "by": "file", and moved to completed/', t => {
  const h = setup(); t.after(h.done);
  h.put('quests/2026-10-20-gym.md', GYM, local(2026, 10, 26, 8, 40));
  h.store.sync();
  assert.ok(!h.exists('quests/2026-10-20-gym.md'));
  const out = h.read('completed/2026-10-20-gym.md');
  assert.match(out, /\ncompleted: 2026-10-26T08:40\ngrade: S\nawarded: 150\n/);
  assert.deepEqual(h.history(), [{ at: '2026-10-26T08:40', event: 'complete', id: 'q-20261020-gym', type: 'side', guild: 'health', grade: 'S', xp: 150, by: 'file' }]);
  assert.deepEqual(h.player().days, { '2026-10-26': { health: { main: 0, side: 1, activity: 0, abandoned: 0, xp: 150 } } });
  assert.equal(h.store.quests()[0].by, 'file', 'the journal can say it was closed in the file');
  h.restart().sync();
  h.store.sync();
  assert.equal(h.history().length, 1, 'a restart does not count it again');
});

test('reopening by hand takes back exactly the XP given, logs the reopen, and moves the file back', t => {
  const h = setup(); t.after(h.done);
  h.put('quests/2026-10-20-gym.md', GYM, local(2026, 10, 26, 8, 40));
  h.store.sync();
  h.edit('completed/2026-10-20-gym.md', 'status: complete', 'status: active');
  h.store.sync();
  const out = h.read('quests/2026-10-20-gym.md');
  assert.ok(!/completed:|grade:|awarded:/.test(out));
  assert.match(out, /\n## Log\n### \d{4}-\d\d-\d\d \d\d:\d\d\nQuest reopened\n$/);
  assert.deepEqual(h.history().map(e => [e.event, e.xp]), [['complete', 150], ['reopen', -150]]);
  assert.deepEqual(h.player().days, {});
});

test('abandoning by hand counts an abandoned quest with no grade', t => {
  const h = setup(); t.after(h.done);
  h.put('quests/2026-10-20-gym.md', GYM.replace('status: complete', 'status: abandoned'), local(2026, 10, 27, 9, 0));
  h.store.sync();
  assert.ok(!/grade:/.test(h.read('completed/2026-10-20-gym.md')));
  assert.deepEqual(h.history().map(e => [e.event, e.xp]), [['abandon', undefined]]);
  assert.equal(h.player().days['2026-10-27'].health.abandoned, 1);
});

test('a ticked box gets the time of the edit; a type change is logged', t => {
  const h = setup(); t.after(h.done);
  h.put('quests/a.md', md(['---', 'questboard: 1', 'id: q-a', 'title: A', 'created: 2026-10-20T12:00', '---', '', '## Objectives', '- [x] Done by hand', '- [ ] Open']), local(2026, 10, 25, 21, 15));
  h.store.sync();
  assert.match(h.read('quests/a.md'), /\n- \[x\] Done by hand @done\(2026-10-25 21:15\)\n- \[ \] Open\n/);
  h.edit('quests/a.md', 'title: A', 'type: main\ntitle: A');
  h.store.sync();
  assert.match(h.read('quests/a.md'), /\n### .*\nType changed: Side quest → Main quest\n$/);
});

test('two tracked quests: the most recently changed one keeps the flag', t => {
  const h = setup(); t.after(h.done);
  const q = (id, m) => h.put(`quests/${id}.md`, md(['---', 'questboard: 1', `id: ${id}`, `title: ${id}`, 'tracked: true', 'created: 2026-10-20T12:00', '---']), m);
  q('q-old', local(2026, 10, 20, 9, 0));
  q('q-new', local(2026, 10, 25, 9, 0));
  h.store.sync();
  assert.ok(!h.read('quests/q-old.md').includes('tracked'));
  assert.ok(h.read('quests/q-new.md').includes('tracked: true'));
});

test('files sharing an id are both kept and not counted until the clash is fixed', t => {
  const h = setup(); t.after(h.done);
  h.put('quests/one.md', GYM);
  h.put('quests/two.md', GYM);
  h.store.sync();
  assert.equal(h.store.quests().length, 2);
  assert.deepEqual(h.history(), []);
  h.edit('completed/two.md', 'id: q-20261020-gym', 'id: q-20261020-gym-copy');
  h.store.sync();
  assert.deepEqual(h.history().map(e => e.id).sort(), ['q-20261020-gym', 'q-20261020-gym-copy']);
});

test('other notes, dot-folders and subfolders: only quest files are touched, and subfolders are kept', t => {
  const h = setup(); t.after(h.done);
  const note = md(['---', 'tags: [home]', '---', '', '# Shopping', '- [x] Milk']);
  h.put('quests/note.md', note);
  h.put('quests/.trash/old.md', GYM);
  h.put('quests/clients/x.md', GYM.replace('id: q-20261020-gym', 'id: q-x'));
  h.put('completed/clients/y.md', md(['---', 'questboard: 1', 'id: q-y', 'title: Y', 'created: 2026-10-20T12:00', '---']));
  h.store.sync();
  assert.equal(h.read('quests/note.md'), note);
  assert.equal(h.read('quests/.trash/old.md'), GYM);
  assert.ok(h.exists('completed/clients/x.md'));
  assert.ok(h.exists('quests/clients/y.md'), 'an open quest found in completed/ moves back');
  assert.deepEqual(h.store.quests().map(x => x.rel).sort(), ['completed/clients/x.md', 'quests/clients/y.md']);
});

test('linked quests: ticking the parent line completes the child, the child reopening reopens the line, renames repair the link, deleting the child leaves a plain step', t => {
  const h = setup(); t.after(h.done);
  h.put('quests/2026-10-05-paper.md', md(['---', 'questboard: 1', 'id: q-20261005-paper', 'type: main', 'title: Term paper', 'created: 2026-10-05T10:00', '---',
    '', '## Objectives', '- [ ] [[2026-10-12-lit-review|Literature review]]', '- [ ] Final submission']), local(2026, 10, 20, 9, 0));
  h.put('quests/2026-10-12-lit-review.md', md(['---', 'questboard: 1', 'id: q-20261012-lit-review', 'parent: q-20261005-paper', 'title: Literature review',
    'created: 2026-10-12T20:00', 'deadline: 2026-11-06T17:00', '---']), local(2026, 10, 20, 9, 0));
  h.store.sync();
  assert.deepEqual(h.history(), []);

  h.edit('quests/2026-10-05-paper.md', '- [ ] [[', '- [x] [[', local(2026, 10, 26, 10, 0));
  h.store.sync();
  assert.match(h.read('completed/2026-10-12-lit-review.md'), /\nstatus: complete\n[\s\S]*\ncompleted: 2026-10-26T10:00\ngrade: S\nawarded: 150\n/);
  assert.deepEqual(h.history().map(e => [e.event, e.id, e.by]), [['complete', 'q-20261012-lit-review', 'file']]);
  assert.match(h.read('quests/2026-10-05-paper.md'), /\n- \[x\] \[\[2026-10-12-lit-review\|Literature review\]\] @done\(2026-10-26 10:00\)\n/);

  h.edit('completed/2026-10-12-lit-review.md', 'status: complete', 'status: active');
  h.store.sync();
  assert.ok(h.exists('quests/2026-10-12-lit-review.md'));
  assert.match(h.read('quests/2026-10-05-paper.md'), /\n- \[ \] \[\[2026-10-12-lit-review\|Literature review\]\]\n/);

  fs.renameSync(path.join(h.dir, 'quests', '2026-10-12-lit-review.md'), path.join(h.dir, 'quests', '2026-10-12-literature-review.md'));
  h.store.sync();
  assert.match(h.read('quests/2026-10-05-paper.md'), /\n- \[ \] \[\[2026-10-12-literature-review\|Literature review\]\]\n/);

  fs.rmSync(path.join(h.dir, 'quests', '2026-10-12-literature-review.md'));
  h.store.sync();
  assert.match(h.read('quests/2026-10-05-paper.md'), /\n- \[ \] Literature review\n- \[ \] Final submission\n$/);
});

test('activities: each date in Completions is counted once, and a removed date is taken back', t => {
  const h = setup(); t.after(h.done);
  h.put('quests/water.md', md(['---', 'questboard: 1', 'id: q-water', 'type: activity', 'guild: home', 'title: 给植物浇水', 'repeat: every 3d', 'created: 2026-10-01T09:00', '---',
    '', '## Completions', '- 2026-10-22', '- 2026-10-25']));
  h.store.sync();
  assert.deepEqual(h.history().map(e => [e.event, e.day, e.xp]), [['complete', '2026-10-22', 20], ['complete', '2026-10-25', 20]]);
  h.edit('quests/water.md', '- 2026-10-22\n', '');
  h.store.sync();
  assert.deepEqual(h.history().map(e => [e.event, e.day, e.xp]).slice(2), [['reopen', '2026-10-22', -20]]);
  assert.deepEqual(Object.keys(h.player().days), ['2026-10-25']);
});

test('app saves: closing from the app counts with "by": "app"; a new quest gets a file name, an id and a created time', t => {
  const h = setup(); t.after(h.done);
  h.put('quests/2026-10-20-gym.md', GYM.replace('status: complete', 'status: active'));
  h.store.sync();
  const { rel, q } = h.store.quests()[0];
  q.status = 'complete';
  assert.equal(h.store.save(q, rel), 'completed/2026-10-20-gym.md');
  assert.deepEqual(h.history().map(e => [e.event, e.by]), [['complete', 'app']]);
  assert.match(h.read('completed/2026-10-20-gym.md'), /\ncompleted: .*\ngrade: [SABC]\nawarded: \d+\n/);

  const made = h.store.save({ title: 'Book flights to Osaka', type: 'main', status: 'active', objectives: [], criteria: [], completions: [], log: [] });
  assert.match(made, /^quests\/\d{4}-\d\d-\d\d-book-flights-to-osaka\.md$/);
  assert.match(h.read(made), /^---\nquestboard: 1\nid: q-\d{8}-book-flights-to-osaka\ntype: main\ntitle: Book flights to Osaka\ncreated: .*\n---\n\n## Objectives\n$/);
  const long = h.store.save({ title: 'Move to the new apartment by December', status: 'active', objectives: [], criteria: [], completions: [], log: [] });
  assert.match(long, /-move-to-the-new\.md$/, 'a long title ends at the last whole word within fileSlugMax');
  const cjk = h.store.save({ title: '写博客', status: 'active', objectives: [], criteria: [], completions: [], log: [] });
  assert.match(cjk, /^quests\/\d{4}-\d\d-\d\d-[a-z0-9]{5}\.md$/);
});

test('undo puts a file back exactly: a completion is taken back in the stats without a log entry, a type change without one either', t => {
  const h = setup(); t.after(h.done);
  const text = GYM.replace('status: complete', 'status: active');
  h.put('quests/2026-10-20-gym.md', text);
  h.store.sync();
  const { rel, q } = h.store.quests()[0], before = JSON.parse(JSON.stringify(q));
  const done = h.store.save(Object.assign(q, { status: 'complete' }), rel);
  h.store.save(JSON.parse(JSON.stringify(before)), done, undefined, true);
  assert.equal(h.read('quests/2026-10-20-gym.md'), text);
  assert.deepEqual(h.history().map(e => e.event), ['complete', 'reopen']);
  assert.deepEqual(h.player().days, {});
  const now = h.store.quests()[0];
  h.store.save(Object.assign(now.q, { type: 'main' }), now.rel);
  h.store.save(JSON.parse(JSON.stringify(before)), now.rel, undefined, true);
  assert.equal(h.read('quests/2026-10-20-gym.md'), text);
});

test('the watcher picks up a hand edit while running', async t => {
  const h = setup(); t.after(h.done);
  h.store.watch();
  let changes = 0;
  h.store.onChange(() => changes++);
  h.put('quests/later.md', md(['---', 'questboard: 1', 'title: Dropped in later', '---']));
  for (let i = 0; i < 40 && !/\nid: /.test(h.read('quests/later.md')); i++) await new Promise(r => setTimeout(r, 100));
  assert.match(h.read('quests/later.md'), /\nid: q-\d{8}-later\n/);
  assert.ok(changes >= 1);
});
