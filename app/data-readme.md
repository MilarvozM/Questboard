# Questboard data

This folder holds your Questboard quests and stats. Everything here is plain text, so you can read and edit it without the app.

## Folders and files

- `quests/` — open quests, one Markdown file each. Subfolders are fine.
- `completed/` — completed and abandoned quests. Questboard moves a file here when the quest closes, and back when it reopens.
- `player.json` — your stats: per day and guild, how many quests you completed or abandoned and the XP earned. Numbers only.
- `history.jsonl` — one line per completion and reopen, so each one is counted once. Ids and numbers only.
- `guilds.json` — your guilds, if you renamed or added any.
- `settings.json` — choices from the settings popup, plus the list's sort and the left rail's folds.
- `seen.json` — each quest's id, file name and type as Questboard last saw them, so it notices what changed while it was off. Ids, names and types only.

Questboard only touches Markdown files whose frontmatter has a `questboard:` line. Other notes and files are left alone, and folders starting with `.` are skipped.

## A quest file

```markdown
---
questboard: 1
title: Renew passport
deadline: 2026-11-20T12:00
---

## Objectives
- [ ] Take the photo
- [x] Fill in the form @done(2026-11-02 21:00)
- [ ] Submit at the ward office @due(2026-11-15 17:00)

## Completion criteria
- [ ] Receipt slip in hand
```

- **Frontmatter keys:** `type` is `main`, `side` or `activity` (default `side`). `status` is `active`, `complete` or `abandoned` (default `active`). `deadline` is the date and time the quest is due; `target` is an earlier date for grade S. Dates are local time: `2026-11-20T12:00`, or a date alone meaning 23:59.
- **Checkboxes:** `[ ]` open, `[x]` done, `[!]` failed, `[-]` dropped. Indent a line to make it a sub-step. Number the steps (`1. [ ]`) instead of `- [ ]` when their order matters.
- **Tags at the end of a step:** `@done(…)`, `@failed(…)`, `@dropped(…)` record when it happened; `@due(…)` gives the step its own deadline; `@added(…)` marks a step added later; `@any` means one sub-step is enough. A reason follows ` — `.
- **Linked quests:** a step written as `[[file-name|Title]]` is a quest of its own; that file's frontmatter has `parent:` with this quest's `id`.
- **Activities** add `repeat: daily`, `repeat: mon,thu` or `repeat: every 3d`, and a `## Completions` list of dates. A date followed by `@skipped` is a run passed over, with no XP.

## Editing by hand

Edit freely, in any editor or in Obsidian, even while Questboard runs. Questboard fills in what it needs: an `id` and `created` time for a new file, a `title` from the file name if there is none, the time on a box you ticked, a group's box from its sub-steps, and the grade and XP when you set `status: complete`. It keeps any other keys, headings and notes you add.
