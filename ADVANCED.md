**English** | [简体中文](ADVANCED.zh-CN.md)

# Questboard for power users

Everything here is optional. [README.md](README.md) covers installing, running and everyday use.

## Your data folder

```
data/
  README.md       the quest file format, explained for a person
  quests/         open quests, one .md file each; subfolders are fine
  completed/      finished and abandoned quests
  player.json     your stats per day and guild (numbers only)
  history.jsonl   record of completed and reopened quests
  guilds.json     your guilds
  settings.json   choices from the settings screen
  seen.json       each quest's id, file name and type as Questboard last saw them
```

- The folder holds everything Questboard knows about you. To move it, move the folder and change `dataDir` in `config.jsonc` (below); nothing else points at it.
- Back up by copying the folder, syncing it, or putting it under git.
- Updates never touch it, and it is never part of this repository.

## Settings: `config.jsonc`

Everything Questboard does by number — port, data folder, XP values, grade rules, favorites limit, undo depth, keyboard shortcuts — is listed with a comment in `config.default.jsonc`. Don't edit that file: updates replace it.

To change something, create `config.jsonc` next to it and put in only the keys you want to change. For example, to keep your quests in an Obsidian vault and use another port:

```jsonc
{
  // where quests, completed quests and player stats live
  "dataDir": "C:/Users/me/Obsidian/Vault/Quests",
  "port": 5050
}
```

- `dataDir` can be absolute, relative to the Questboard folder, or start with `~` for your home folder.
- `config.jsonc` is yours: updates never overwrite it, and git ignores it.
- A value Questboard can't use falls back to its default, and the terminal tells you which key was wrong.
- The settings screen shows which `config.jsonc` and which data folder are in use.

## With Obsidian

Point `dataDir` at a folder inside your vault. Questboard only reads Markdown files under `quests/` and `completed/` that have a `questboard:` line at the top, and leaves every other note, image or attachment alone; folders starting with `.` are skipped. You can rename quest files, sort them into subfolders, tick boxes and mark quests complete in Obsidian, on your computer or your phone; Questboard picks it all up, even while it runs.

**Templates:** `templates/` holds a complete quest file in English (`quest.md`) and in Chinese (`quest.zh-CN.md`), with every frontmatter key and section. Copy the one you want into your vault's template folder and insert it with Obsidian's core **Templates** plugin, which fills in `{{title}}` and `{{date:YYYY-MM-DD}}`. Save the new note under `quests/`.

## Writing quest files by hand

The smallest quest file you can write:

```markdown
---
questboard: 1
title: Renew passport
deadline: 2026-11-20
---

## Objectives
- [ ] Take the photo
- [ ] Submit at the ward office
```

- Number the steps (`1. [ ]`, `2. [ ]`) when their order matters; Questboard shows the numbers and keeps them in order.
- Questboard fills in what it needs on its next look: an `id`, the `created` time, the time on a box you ticked, and the grade and XP when you set `status: complete`. It keeps any other keys, headings and notes you add.
- `README.md` in your data folder explains every key, checkbox mark and `@` tag.

## The demo

`node "<path>\questboard.js" --demo` runs on a fresh copy of `examples/` in your system's temp folder, with every date moved so deadlines sit near today. Your own data folder is not touched. Ctrl+C or closing the terminal deletes the copy. Any other option is refused, so a typo never runs on real data.

## Styles, languages and the AI prompt

- `styles/` holds one `.css` file per visual style. Every file there is offered in the settings screen, so a style of your own is a new file beside them; the keys `st_<name>` and `st_<name>_d` in `locales/` give it a name and a description.
- `locales/` holds the interface text, one `.json` file per language. Keys missing from a language fall back to English.
- `prompts/` holds the prompt the **From AI** drawer copies, written out in full in each language.
- Adding a language takes one file in `locales/` and one in `prompts/`.
- Updates replace the shipped files, so keep a copy of any change you make to one of them.

## Project files

| Path | What it is |
|---|---|
| `questboard.js` | The start file: checks your Node.js version and starts the server |
| `server/`, `shared/` | The server: reads and writes your data folder and serves the page |
| `app/` | The page: markup, layout and scripts |
| `styles/`, `locales/`, `prompts/` | Visual styles, interface text and the AI prompt |
| `examples/` | The quests `--demo` shows |
| `templates/` | Quest templates for Obsidian |
| `config.default.jsonc` | Every setting, with its default and a comment |
| `package.json` | Tells Node.js that the scripts here are ES modules |
