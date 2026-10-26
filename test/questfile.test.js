// Quest file format (DESIGN.md §3.2): parsing, writing back, and what a save keeps. Run: node --test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDate, parseRepeat, isQuestFile, parseQuest, writeQuest, parseImport } = require('../questboard.js');

const md = lines => lines.join('\n') + '\n';

// The full example from DESIGN.md §3.2
const SPEC = md([
  '---', 'questboard: 1', 'id: q-20261014-ship-portfolio', 'type: main', 'guild: work', 'title: Ship the portfolio site', 'short: PORTFOLIO',
  'status: active', 'tracked: true', 'favorite: true', 'created: 2026-10-14T20:00', 'deadline: 2026-11-08T18:00', 'target: 2026-11-02T12:00', '---',
  '', '## Briefing', 'A recruiter should understand what I do within two minutes of landing on the page.',
  '', '## Objectives',
  '- [x] Pick a stack @done(2026-10-15 10:12)',
  '- [x] Write case study 1 @done(2026-10-20 19:05)',
  '  - [x] Draft @done(2026-10-17 21:40)',
  '  - [x] Capture screenshots @done(2026-10-20 19:05)',
  '- [ ] Get a testimonial @any',
  '  - [!] From my former manager @failed(2026-10-24 09:30) — No reply after ten days',
  '  - [ ] From the client at Studio K',
  '- [-] Custom domain email @dropped(2026-10-19 22:10) — Not needed for launch',
  '- [ ] Write case study 2 @due(2026-10-28 18:00)',
  '- [ ] [[2026-10-26-case-study-3|Write case study 3]]',
  '- [ ] Fix mobile navigation @added(2026-10-22 18:30)',
  '- [ ] Deploy @due(2026-11-06 12:00)',
  '', '## Completion criteria', '- [ ] Live on a public URL', '- [ ] Three case studies, each with a measurable outcome',
  '', '## Log', '### 2026-10-17 21:45', 'Draft one done. The outcome numbers are weaker than I thought.',
]);

// The smallest file that works, from DESIGN.md §3.2
const SMALLEST = md(['---', 'questboard: 1', 'title: Renew passport', 'deadline: 2026-11-20', '---', '', '## Objectives', '- [ ] Take the photo', '- [ ] Submit at the ward office']);

const clone = q => JSON.parse(JSON.stringify(q));
// Lines of b that a doesn't have (counting repeats): what a save added or rewrote.
function changed(a, b) {
  const left = new Map();
  for (const l of a.split('\n')) left.set(l, (left.get(l) || 0) + 1);
  return b.split('\n').filter(l => left.get(l) ? (left.set(l, left.get(l) - 1), false) : true);
}

test('dates: local date and time, or a date alone; impossible dates refused', () => {
  assert.equal(parseDate('2026-11-08T18:00'), '2026-11-08 18:00');
  assert.equal(parseDate('2026-11-08 9:05'), '2026-11-08 09:05');
  assert.equal(parseDate('2026-11-08T18:00:30'), '2026-11-08 18:00');
  assert.equal(parseDate('2026-11-20'), '2026-11-20');
  for (const bad of ['2026-02-30', '2026-13-01', '2026-11-08 24:00', '11-08', 'next friday', '']) assert.equal(parseDate(bad), null, bad);
});

test('repeat: daily, every n days, week days', () => {
  assert.deepEqual(parseRepeat('daily'), { every: 1 });
  assert.deepEqual(parseRepeat('every 3d'), { every: 3 });
  assert.deepEqual(parseRepeat('sun,wed'), { days: [0, 3] });
  assert.deepEqual(parseRepeat('Thu, Monday'), { days: [1, 4] });
  assert.equal(parseRepeat('weekly'), null);
  assert.equal(parseRepeat('every 0d'), null);
});

test('only Markdown with a questboard: key in its frontmatter is a quest file', () => {
  assert.ok(isQuestFile(SPEC));
  assert.ok(isQuestFile(SMALLEST.replace(/\n/g, '\r\n')));
  assert.ok(!isQuestFile('---\ntitle: A note\n---\nquestboard: 1\n'));
  assert.ok(!isQuestFile('# Just a note\n\nquestboard: 1\n'));
  assert.ok(!isQuestFile('---\ntags: [a]\n---\n'));
});

test('the spec example reads correctly', () => {
  const q = parseQuest(SPEC);
  assert.deepEqual(q.problems, []);
  assert.equal(q.id, 'q-20261014-ship-portfolio');
  assert.equal(q.type, 'main');
  assert.equal(q.tracked, true);
  assert.equal(q.deadline, '2026-11-08 18:00');
  assert.equal(q.target, '2026-11-02 12:00');
  assert.equal(q.briefing, 'A recruiter should understand what I do within two minutes of landing on the page.');
  const o = q.objectives;
  assert.equal(o.length, 8);
  assert.deepEqual([o[0].t, o[0].s, o[0].at], ['Pick a stack', 'done', '2026-10-15 10:12']);
  assert.equal(o[1].sub.length, 2);
  assert.equal(o[2].any, true);
  assert.deepEqual([o[2].sub[0].s, o[2].sub[0].at, o[2].sub[0].note], ['failed', '2026-10-24 09:30', 'No reply after ten days']);
  assert.deepEqual([o[3].s, o[3].note], ['dropped', 'Not needed for launch']);
  assert.equal(o[4].due, '2026-10-28 18:00');
  assert.deepEqual([o[5].t, o[5].link], ['Write case study 3', '2026-10-26-case-study-3']);
  assert.equal(o[6].added, '2026-10-22 18:30');
  assert.equal(q.criteria.length, 2);
  assert.deepEqual(q.log, [{ head: '2026-10-17 21:45', text: 'Draft one done. The outcome numbers are weaker than I thought.' }]);
});

test('the smallest file reads with defaults', () => {
  const q = parseQuest(SMALLEST);
  assert.equal(q.type, 'side');
  assert.equal(q.status, 'active');
  assert.equal(q.deadline, '2026-11-20');
  assert.equal(q.id, undefined);
  assert.equal(q.objectives.length, 2);
});

test('an unchanged quest writes back byte for byte', () => {
  assert.equal(writeQuest(parseQuest(SPEC)), SPEC);
  assert.equal(writeQuest(parseQuest(SMALLEST)), SMALLEST);
  assert.equal(writeQuest(clone(parseQuest(SPEC))), SPEC, 'after a JSON round trip, as from the browser');
});

test('ticking an objective changes only its line', () => {
  const q = clone(parseQuest(SPEC));
  Object.assign(q.objectives[2].sub[1], { s: 'done', at: '2026-10-26 10:00' });
  assert.deepEqual(changed(SPEC, writeQuest(q)), ['  - [x] From the client at Studio K @done(2026-10-26 10:00)']);
});

test('frontmatter: new keys go to their usual place, cleared keys are left out, dates keep their form', () => {
  const q = parseQuest(SMALLEST);
  Object.assign(q, { id: 'q-20261120-renew-passport', tracked: true, status: 'complete', completed: '2026-11-19 10:00', grade: 'A', awarded: 100 });
  assert.equal(writeQuest(q).split('---')[1], '\nquestboard: 1\nid: q-20261120-renew-passport\ntitle: Renew passport\nstatus: complete\ntracked: true\n'
    + 'deadline: 2026-11-20\ncompleted: 2026-11-19T10:00\ngrade: A\nawarded: 100\n');
  const s = parseQuest(SPEC);
  s.favorite = undefined;
  assert.deepEqual(changed(writeQuest(s), SPEC).length, 1);
  assert.ok(!writeQuest(s).includes('favorite:'));
});

test('unknown keys, sections, notes and code blocks are kept through a save', () => {
  const text = md([
    '---', 'questboard: 1', 'title: "Fix: the bathroom fan #2"', 'tags:', '  - home', '  - repair', 'aliases: [fan]', 'deadline: 2026-10-29T19:00', '---',
    '', '# Bathroom fan', 'Kept above the first heading.',
    '', '## Objectives', 'Call before 17:00 on weekdays.', '- [ ] Call the management company', '  Their number is on the fridge.',
    '  - [ ] Ask for Thursday', '    - [ ] Too deep for a sub-objective, kept as a note', '- Plain bullet, kept', '',
    '- [ ] Be home for the visit',
    '', '## Parts', '```', '## not a heading inside a fence', '```', 'Fan model: KX-200',
    '', '## Completion criteria', 'Judged by ear.', '- [ ] Fan runs quietly',
  ]);
  const q = clone(parseQuest(text));
  assert.equal(q.title, 'Fix: the bathroom fan #2');
  assert.equal(q.objectives.length, 2);
  assert.equal(q.objectives[0].sub.length, 1);
  assert.equal(writeQuest(q), text);
  q.objectives[1].s = 'done';
  q.objectives[1].at = '2026-10-29 18:10';
  q.title = 'Fix the fan: round 2';
  const out = writeQuest(q);
  assert.deepEqual(changed(text, out), ['title: "Fix the fan: round 2"', '- [x] Be home for the visit @done(2026-10-29 18:10)']);
  assert.equal(parseQuest(out).title, 'Fix the fan: round 2');
});

test('Windows line endings and tab indents are kept', () => {
  const text = md(['---', 'questboard: 1', 'title: Tabs', '---', '', '## Objectives', '- [ ] Parent', '\t- [ ] Child']).replace(/\n/g, '\r\n');
  const q = parseQuest(text);
  assert.equal(q.objectives[0].sub[0].t, 'Child');
  assert.equal(writeQuest(q), text);
  q.objectives[0].sub.push({ t: 'Second child', s: 'open' });
  assert.ok(writeQuest(q).endsWith('\t- [ ] Child\r\n\t- [ ] Second child\r\n'));
});

test('unreadable values become problems, and the file keeps what the user wrote', () => {
  const text = md(['---', 'questboard: 1', 'title: Odd', 'type: quest', 'deadline: next friday', 'xp: lots', '---', '', '## Objectives', '- [ ] Ask @due(friday)']);
  const q = parseQuest(text);
  assert.deepEqual(q.problems.map(p => p.code), ['w_type', 'w_date', 'w_value']);
  assert.equal(q.type, 'side');
  assert.equal(q.deadline, undefined);
  assert.equal(q.objectives[0].t, 'Ask @due(friday)');
  q.favorite = true;
  assert.equal(writeQuest(q), text.replace('type: quest\n', 'type: quest\nfavorite: true\n'));
  assert.deepEqual(parseQuest(md(['---', 'questboard: 1', '---'])).problems, [{ code: 'e_title', key: 'title' }]);
});

test('linked quests: wiki links with and without a shown title, step deadlines on them, the child\'s parent key', () => {
  const text = md(['---', 'questboard: 1', 'title: Paper', '---', '', '## Objectives',
    '- [ ] [[2026-11-09-lit-review|Literature review]] @due(2026-11-09 17:00)', '- [x] [[outline]]', '- [ ] Read [[a note]] first']);
  const q = parseQuest(text);
  assert.deepEqual([q.objectives[0].link, q.objectives[0].t, q.objectives[0].due], ['2026-11-09-lit-review', 'Literature review', '2026-11-09 17:00']);
  assert.deepEqual([q.objectives[1].link, q.objectives[1].t, q.objectives[1].s], ['outline', 'outline', 'done']);
  assert.equal(q.objectives[2].link, undefined);
  assert.equal(writeQuest(q), text);
  q.objectives[0].link = '2026-11-09-literature-review';
  assert.deepEqual(changed(text, writeQuest(q)), ['- [ ] [[2026-11-09-literature-review|Literature review]] @due(2026-11-09 17:00)']);
  assert.equal(parseQuest(md(['---', 'questboard: 1', 'title: Lit', 'parent: q-20261020-paper', '---'])).parent, 'q-20261020-paper');
});

test('Chinese headings read, and new sections get headings in the chosen language', () => {
  const text = md(['---', 'questboard: 1', 'title: 写博客', '---', '', '## 简报', '把经验整理成文章。', '', '## 目标', '- [x] 列提纲 @done(2026-10-23 23:00)', '- [ ] 写初稿', '', '## 完成条件', '- [ ] 文章已发布']);
  const q = parseQuest(text);
  assert.equal(q.briefing, '把经验整理成文章。');
  assert.equal(q.objectives.length, 2);
  assert.equal(q.criteria.length, 1);
  assert.equal(writeQuest(q, 'zh'), text);
  q.debrief = '比想象的快。';
  assert.ok(writeQuest(q, 'zh').endsWith('\n\n## 总结\n比想象的快。\n'));
  const fresh = { title: 'New', type: 'side', status: 'active', briefing: 'Why.', objectives: [{ t: 'Step', s: 'open' }], criteria: [], completions: [], log: [] };
  assert.equal(writeQuest(fresh), md(['---', 'questboard: 1', 'title: New', '---', '', '## Briefing', 'Why.', '', '## Objectives', '- [ ] Step']));
});

test('activities: repeat and the completions list, with new completions appended', () => {
  const text = md(['---', 'questboard: 1', 'type: activity', 'title: 给植物浇水', 'repeat: every 3d', '---', '', '## Objectives', '- [ ] 阳台', '', '## Completions', '- 2026-10-22', '- 2026-10-25']);
  const q = parseQuest(text);
  assert.deepEqual(q.repeat, { every: 3 });
  assert.deepEqual(q.completions, ['2026-10-22', '2026-10-25']);
  q.completions.push('2026-10-28');
  assert.ok(writeQuest(q).endsWith('- 2026-10-25\n- 2026-10-28\n'));
  q.repeat = { days: [1, 4] };
  assert.ok(writeQuest(q).includes('\nrepeat: mon,thu\n'));
  q.type = 'side';
  assert.ok(writeQuest(q).includes('\ntype: side\n'));
});

test('log: entries read, a new one is appended, a debrief section is added at the end', () => {
  const q = parseQuest(SPEC);
  q.log.push({ head: '2026-10-26 10:00', text: 'Reopened: the client asked for one more case study.' });
  q.debrief = 'Shipped.';
  assert.ok(writeQuest(q).endsWith('weaker than I thought.\n\n### 2026-10-26 10:00\nReopened: the client asked for one more case study.\n\n## Debrief\nShipped.\n'));
  assert.deepEqual(parseQuest(writeQuest(q)).log.length, 2);
});

test('import: fenced AI answers split into quests', () => {
  const answer = ['Here you go:', '```markdown', '---', 'questboard: 1', 'type: side', 'guild: home', 'title: Get ready for the fire-safety inspection',
    'short: FIRE CHECK', 'deadline: 2026-11-10T10:00', '---', '', '## Briefing', 'Annual inspection, 10:00–12:00.', '', '## Objectives', '- [ ] Clear the balcony', '```', '',
    '```markdown', '---', 'type: side', 'guild: admin', 'title: Return the signed parking contract', 'deadline: 2026-10-30T23:59', '---', '', '## Objectives',
    '- [ ] Sign the contract', '- [ ] Get it to them @any', '  - [ ] Post it', '  - [ ] Drop it at their office', '```'].join('\n');
  const qs = parseImport(answer);
  assert.equal(qs.length, 2);
  assert.equal(qs[0].short, 'FIRE CHECK');
  assert.equal(qs[0].objectives.length, 1);
  assert.equal(qs[1].objectives[1].sub.length, 2);
  assert.ok(writeQuest(qs[1]).startsWith('---\nquestboard: 1\ntype: side\n'), 'a missing marker key is added');
});
