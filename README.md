**English** | [简体中文](README.zh-CN.md)

# Questboard

A to-do list that runs like a game quest log.

- Your tasks are quests with steps, deadlines and grades; finishing them earns XP and levels.
- Every quest is a plain Markdown file you can read and edit in any text editor or in Obsidian, even on your phone.
- Questboard runs on your own computer only. Your quests never leave it.
- The interface comes in English and 简体中文. The Chinese text is waiting for review by a native speaker.

## Install once

1. **Install Node.js**, the free program that runs Questboard: go to [nodejs.org](https://nodejs.org/), download the **LTS** version, and run the installer with the default options.
2. **Download Questboard:** on this GitHub page, click the green **Code** button → **Download ZIP**. Unzip it somewhere you'll find again, such as your Documents folder.
3. **Copy the path of `questboard.js`** inside that folder, and keep it in a note:
   - **Windows:** right-click `questboard.js` and choose **Copy as path** (on Windows 10, hold Shift while you right-click). Paste it after `node ` and a space, so your note reads like `node "C:\Users\you\Documents\Questboard-main\questboard.js"`.
   - **macOS:** open the **Terminal** app (press `Cmd+Space`, type `Terminal`, press Return). Type `node ` with a space after it, then drag `questboard.js` from the Finder onto the Terminal window. Copy the line it now shows, such as `node /Users/you/Documents/Questboard-main/questboard.js`, into your note.

To update later, download the new ZIP and unzip it over the old folder. Your quests and settings stay.

## Run

Open any terminal (Windows: **Terminal** from the Start menu; macOS: the **Terminal** app), paste the line from your note, and press Enter:

```bash
node "C:\Users\you\Documents\Questboard-main\questboard.js"
```

**What this does:** it asks Node.js to run the file `questboard.js`, which starts Questboard on your own computer; nothing is installed. Your browser then opens Questboard at <http://localhost:4747>. The only thing the page fetches from the internet is its fonts, from Google Fonts; without internet it uses fonts already on your computer.

**To stop it:** click the terminal window and press `Ctrl+C`, or close the window. Your quests are already saved.

**To look around first:** add ` --demo` at the end of the line. Questboard then opens a set of example quests, and deletes them when you stop it.

## Use

- **Add a task fast:** click the big button at the bottom right, or press `N`. Type a title and press Enter. The icons under the line pick a type, a guild and a deadline; typing `#home` or `@11-02 18:00` works too.
- **Finish a quest** with the big check mark at the top right of the quest, the same check mark before its title at the top of the screen, or by ticking its last completion criterion. **Tick a step** by clicking its mark; failing, dropping and giving the step its own deadline are the small icons beside it.
- **Edit where you see it:** a pencil edits the title, the briefing, the objectives or the criteria. Click the type, the guild, or any date on the timeline to change it. Drag steps, criteria and guilds by their handle to reorder them.
- **Find a quest** with the search box at the top. Its calendar button keeps only what is due between two dates.
- **Track one quest** to keep its current step at the top of the screen, and **star up to 5 favorites** for your short list; both buttons sit before the quest's title. Markdown and Delete are in each quest's `⋯` menu; Delete moves the file to your system's recycle bin.
- **Guilds:** hover a guild in the left rail; its pencil renames it, gives it an icon or deletes it, and its handle moves it. `+` adds one.
- Every change to a quest can be undone with `Ctrl+Z` (`Cmd+Z` on a Mac).
- **Calendar:** switch between quests only, quests with their steps, or everything including finished work.
- **Click your level badge** to see how many quests you finished today, this week, this month and this year.
- **From AI:** Questboard can write a prompt for you. Paste it into any AI chat with your notes, paste the answer back, and Questboard turns it into quests. Questboard itself never contacts an AI.
- **Your quests** are Markdown files in the `data` folder next to `questboard.js`. The settings screen shows that folder, the settings file and your start line. Back up by copying the `data` folder.

Settings for power users, Obsidian, hand-written quest files, styles and languages: [ADVANCED.md](ADVANCED.md).

## Uninstall

1. **Stop Questboard** if it is running.
2. **Keep your quests**, if you want them, by copying the `data` folder somewhere else. If you set `dataDir` to another folder, your quests are there instead, and deleting Questboard leaves them in place.
3. **Delete the Questboard folder.** Questboard installs nothing else, so this removes it along with your settings.

Two things may remain:

- **Demo leftovers:** a demo that was not stopped cleanly can leave a folder named `questboard-demo-…` in your system's temp folder. On Windows, type `%TEMP%` in the File Explorer address bar to open it, then delete any such folder.
- **Node.js** is a separate program. If nothing else needs it, uninstall it the way you remove other programs (Windows: **Settings → Apps → Installed apps**).

## License

[MIT](LICENSE)
