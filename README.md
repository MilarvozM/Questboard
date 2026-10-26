**English** | [简体中文](README.zh-CN.md)

# Questboard

A to-do list that runs like a game quest log. Your tasks are quests with steps, deadlines and grades; finishing them earns XP and levels. Underneath, every quest is a plain Markdown file you can read and edit in any text editor or in Obsidian, even on your phone.

> **Status: version 1.** Everything below works. The Chinese interface and prompt are waiting for review by a native speaker.

## Get started

You need two things: **Node.js** (a free program that runs Questboard) and the **Questboard folder**. Both are one-time steps.

### 1. Install Node.js

Go to [nodejs.org](https://nodejs.org/), download the **LTS** version, and run the installer with the default options.

### 2. Download Questboard

On this GitHub page, click the green **Code** button → **Download ZIP**. Unzip it somewhere you'll find again, such as your Documents folder.

### 3. Open a terminal in the Questboard folder

A terminal is a window where you type commands. Nothing you do in the steps below changes your computer's settings.

- **Windows:** open the Questboard folder, right-click an empty spot inside it, and choose **Open in Terminal**.
- **macOS:** open the **Terminal** app (press `Cmd+Space`, type `Terminal`, press Return). Type `cd` and a space, drag the Questboard folder onto the Terminal window, and press Return. This moves the terminal into that folder.

### 4. Start Questboard

Paste this line into the terminal and press Enter (Return on a Mac):

```bash
node questboard.js
```

**What this does:** it asks Node.js to run the file `questboard.js` from this folder. That file starts Questboard on your own computer only, and nothing is installed. Your browser then opens Questboard at <http://localhost:4747>. Your quests never leave your computer. The only thing the page fetches from the internet is its fonts, from Google Fonts; without internet it uses fonts already on your computer.

**To stop it:** click the terminal window and press `Ctrl+C`, or just close the window. Your quests are already saved.

**Next time:** repeat steps 3 and 4.

## Using it

- **Add a task fast:** press `N`, type, press Enter. Add `#home` for a guild or `@11-02 18:00` for a deadline.
- **Track one quest** to keep its current step at the top of the screen, and **star up to 5 favorites** for your short list.
- **Done / Fail / Drop** each step as you go. Every change can be undone with `Ctrl+Z` (`Cmd+Z` on a Mac).
- **Calendar:** switch between quests only, quests with their steps, or everything including finished work.
- **Click your level badge** to see how many quests you finished today, this week, this month and this year.
- **From AI:** Questboard can write a prompt for you. Paste it into any AI chat with your notes, paste the answer back, and Questboard turns it into quests. Questboard itself never contacts an AI.

The interface is available in English and 简体中文.

## Your data

```
data/
  quests/         open quests, one .md file each
  completed/      finished and abandoned quests
  player.json     your stats per day (numbers only)
  history.jsonl   record of completed and reopened quests
  guilds.json     your guilds
  settings.json   choices from the settings screen
```

- Every quest is a readable Markdown file. Edit one by hand, even while Questboard runs; it picks up the change.
- Back up by copying the `data` folder, syncing it, or putting it under git.
- Your `data` folder is never part of this repository.

### With Obsidian

Point Questboard at a folder inside your vault (see `dataDir` below). Questboard only reads Markdown files that have a `questboard:` line at the top, and leaves every other note, image or attachment alone. You can rename quest files, sort them into subfolders, tick boxes and mark quests complete in Obsidian, on your computer or your phone; Questboard picks it all up next time it runs.

The smallest quest file you can write by hand:

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

## Settings for power users

Everything Questboard does by number — port, data folder, XP values, grade rules, favorites limit, undo depth, keyboard shortcuts — is listed with a comment in `config.default.jsonc`.

To change something, create `config.jsonc` next to it and put in only the keys you want to change. For example, to keep your quests in an Obsidian vault and use another port:

```jsonc
{
  // where quests, completed quests and player stats live
  "dataDir": "C:/Users/me/Obsidian/Vault/Quests",
  "port": 5050
}
```

`config.jsonc` is yours: updates never overwrite it, and git ignores it. A value Questboard can't use falls back to its default, and the terminal tells you which key was wrong.

Styles live in `styles/`, interface text in `locales/`, and the AI prompt text in `prompts/`.

## Project files

| Path | What it is |
|---|---|
| [questboard.js](questboard.js) | The app: a small server that reads and writes your data folder and serves the page. |
| [config.default.jsonc](config.default.jsonc) | Every setting, with its default and a comment. |
| [app/](app) | The page: markup, layout and script. |
| [styles/](styles), [locales/](locales), [prompts/](prompts) | The two visual styles, the interface text and the AI prompt, one file per style or language. |
| [test/](test) | Tests for the file format, the data folder and the server. Run them with `node --test`. |

## License

[MIT](LICENSE)
