import fs from "node:fs";
import path from "node:path";
import { stampOf } from "../shared/dates.js";
import { isPlayer } from "../shared/guards.js";
import { filled, isRecord, same } from "../shared/records.js";
import { isOpen, } from "../shared/types.js";
import { messageOf, resolveDataDir, warnOnConsole, } from "./config.js";
import { markdownFiles, writeAtomic } from "./files.js";
import { checkedGuilds, isGuildsFile, STARTER_GUILDS } from "./guilds.js";
import { HttpError } from "./http-error.js";
import { createLedger } from "./ledger.js";
import { Links } from "./links.js";
import { translate } from "./locales.js";
import { baseOf, fileSlug, freePath, makeId, randomId } from "./names.js";
import { APP_DIR } from "./paths.js";
import { isQuestFile, parseQuest, writeQuest } from "./questfile.js";
import { rollUp } from "./rollup.js";
import { toTrash } from "./system.js";
import { withoutBom } from "./text.js";
const TOP_FOLDERS = ["quests", "completed"];
function folderFor(status) {
    return isOpen(status) ? "quests" : "completed";
}
function bornAt(entry) {
    return entry.birthtimeMs !== undefined && entry.birthtimeMs > 0
        ? entry.birthtimeMs
        : entry.mtimeMs;
}
function allSteps(quest) {
    return quest.objectives.flatMap((step) => [step, ...(step.sub ?? [])]);
}
function jsonText(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
}
function seenEntries(value) {
    const quests = isRecord(value) ? value["quests"] : undefined;
    if (!isRecord(quests)) {
        return {};
    }
    const entries = {};
    for (const [id, entry] of Object.entries(quests)) {
        if (isRecord(entry) && typeof entry["file"] === "string") {
            const type = entry["type"];
            entries[id] =
                typeof type === "string"
                    ? { file: entry["file"], type }
                    : { file: entry["file"] };
        }
    }
    return entries;
}
function stepWithoutSource(step) {
    const copy = { ...step };
    delete copy._raw;
    delete copy._extra;
    return copy;
}
function isPlainName(name) {
    return (typeof name === "string" &&
        /^(quests|completed)\/[^\\:*?"<>|]+\.md$/.test(name) &&
        !name.split("/").some((part) => part === ".." || part === "."));
}
function childQuestOf(parent, step) {
    const child = {
        title: step.t,
        type: parent.type === "activity" ? "side" : parent.type,
        status: "active",
        objectives: (step.sub ?? []).map(stepWithoutSource),
        criteria: [],
        completions: [],
        skipped: [],
        log: [],
        briefing: "",
        debrief: "",
    };
    if (parent.guild !== undefined) {
        child.guild = parent.guild;
    }
    if (parent.id !== undefined) {
        child.parent = parent.id;
    }
    if (step.due !== undefined) {
        child.deadline = step.due;
    }
    return child;
}
export function createStore(cfg, { warn = warnOnConsole, trash = toTrash } = {}) {
    const dir = resolveDataDir(cfg.dataDir);
    const abs = (rel) => path.join(dir, ...rel.split("/"));
    const files = new Map();
    const listeners = [];
    const write = (rel, text) => {
        writeAtomic(abs(rel), text, cfg);
    };
    const changed = () => {
        for (const listener of listeners) {
            listener();
        }
    };
    for (const top of TOP_FOLDERS) {
        fs.mkdirSync(abs(top), { recursive: true });
    }
    if (!fs.existsSync(abs("README.md"))) {
        fs.copyFileSync(path.join(APP_DIR, "app", "data-readme.md"), abs("README.md"));
    }
    function readJson(rel, fallback, valid) {
        if (!fs.existsSync(abs(rel))) {
            return fallback;
        }
        try {
            const value = JSON.parse(withoutBom(fs.readFileSync(abs(rel), "utf8")));
            if (!valid(value)) {
                throw new Error("it does not hold what Questboard writes there");
            }
            return value;
        }
        catch (error) {
            fs.copyFileSync(abs(rel), abs(`${rel}.broken`));
            warn(`${rel} could not be read (${messageOf(error)}); kept a copy as ${rel}.broken and started it fresh.`);
            return fallback;
        }
    }
    const ledger = createLedger(cfg, abs("history.jsonl"), readJson("player.json", { questboard: 1, days: {} }, isPlayer), (player) => {
        write("player.json", jsonText(player));
    });
    let seen = seenEntries(readJson("seen.json", {}, isRecord));
    const seenIds = () => new Map(Object.entries(seen).map(([id, entry]) => [id, entry.file]));
    let lastIds = seenIds();
    const settings = () => readJson("settings.json", {}, isRecord);
    const uiLang = () => {
        const language = settings()["language"];
        return typeof language === "string" && language !== ""
            ? language
            : cfg.defaults.language;
    };
    const questFiles = () => [...files].flatMap(([rel, entry]) => entry.quest ? [{ rel, quest: entry.quest, mtimeMs: entry.mtimeMs }] : []);
    function previousType(entry, quest) {
        if (entry.previous) {
            return entry.previous.id === quest.id ? entry.previous.type : undefined;
        }
        return seen[quest.id ?? ""]?.type;
    }
    function fillIn(rel, entry, quest, pass, ids) {
        let touched = false;
        const when = pass.by === "app" ? pass.now : entry.mtimeMs;
        if (!filled(quest.id)) {
            const id = makeId(rel, bornAt(entry), ids.taken, cfg);
            quest.id = id;
            ids.taken.add(id);
            ids.count.set(id, 1);
            touched = true;
        }
        if (!filled(quest.created)) {
            quest.created = stampOf(pass.by === "app" ? pass.now : bornAt(entry));
            touched = true;
        }
        if (!filled(quest.title)) {
            quest.title = baseOf(rel);
            touched = true;
        }
        for (const step of allSteps(quest)) {
            if (step.s !== "open" && !filled(step.at)) {
                step.at = stampOf(when);
                touched = true;
            }
        }
        const wasType = previousType(entry, quest);
        if (!pass.quiet && wasType !== undefined && wasType !== quest.type) {
            const t = (key) => translate(pass.lang, key);
            quest.log.push({
                head: stampOf(pass.now),
                text: `${t("t_type")}: ${t(`${wasType}_q`)} → ${t(`${quest.type}_q`)}`,
            });
            touched = true;
        }
        return rollUp(quest, pass.lang, when) || touched;
    }
    function writeAndMove(dirty, lang) {
        const moved = new Map();
        for (const { rel, quest } of questFiles()) {
            const want = folderFor(quest.status);
            const top = rel.split("/")[0] ?? "";
            if (!dirty.has(rel) && top === want) {
                continue;
            }
            const to = top === want
                ? rel
                : freePath(want + rel.slice(top.length), (other) => other !== rel &&
                    (files.has(other) || fs.existsSync(abs(other))));
            try {
                if (dirty.has(rel)) {
                    write(to, writeQuest(quest, lang));
                }
                else {
                    fs.renameSync(abs(rel), abs(to));
                }
                if (to !== rel) {
                    if (dirty.has(rel)) {
                        fs.rmSync(abs(rel), { force: true });
                    }
                    files.delete(rel);
                    moved.set(rel, to);
                }
                const text = fs.readFileSync(abs(to), "utf8");
                const stat = fs.statSync(abs(to));
                files.set(to, {
                    mtimeMs: stat.mtimeMs,
                    birthtimeMs: stat.birthtimeMs,
                    size: stat.size,
                    text,
                    quest: parseQuest(text),
                    previous: quest,
                });
            }
            catch (error) {
                warn(`Could not save ${rel}: ${messageOf(error)}`);
            }
        }
        return moved;
    }
    function rememberIds() {
        const nowSeen = Object.fromEntries(questFiles()
            .map(({ rel, quest }) => [
            quest.id ?? "",
            { file: baseOf(rel), type: quest.type },
        ])
            .sort(([a], [b]) => a.localeCompare(b)));
        if (!same(nowSeen, seen)) {
            write("seen.json", jsonText({ questboard: 1, quests: nowSeen }));
            seen = nowSeen;
        }
        lastIds = seenIds();
    }
    function apply(changedRels, by, now, quiet = false) {
        const lang = uiLang();
        const dirty = new Set(by === "app" ? changedRels : []);
        const idCount = new Map();
        for (const { quest } of questFiles()) {
            if (filled(quest.id)) {
                idCount.set(quest.id, (idCount.get(quest.id) ?? 0) + 1);
            }
        }
        const ids = { taken: new Set(idCount.keys()), count: idCount };
        const pass = { by, now, quiet, lang };
        for (const rel of changedRels) {
            const entry = files.get(rel);
            if (entry?.quest && fillIn(rel, entry, entry.quest, pass, ids)) {
                dirty.add(rel);
            }
        }
        const count = (quest, options) => ledger.count(quest, {
            by,
            when: now,
            now,
            lang,
            quiet: false,
            ...options,
        });
        for (const { rel, quest, mtimeMs } of questFiles()) {
            const mine = changedRels.has(rel);
            if (idCount.get(quest.id ?? "") === 1 &&
                count(quest, {
                    by: mine ? by : "file",
                    when: mine && by === "app" ? now : mtimeMs,
                    quiet: quiet && mine,
                })) {
                dirty.add(rel);
            }
        }
        const tracked = questFiles()
            .filter(({ quest }) => quest.tracked === true && isOpen(quest.status))
            .sort((a, b) => b.mtimeMs - a.mtimeMs);
        for (const { rel, quest } of tracked.slice(1)) {
            delete quest.tracked;
            dirty.add(rel);
        }
        const links = new Links(questFiles(), idCount);
        links.dropLinksTo(new Set([...lastIds]
            .filter(([id]) => !links.hasId(id))
            .map(([, name]) => name.toLowerCase())), dirty);
        const linkPass = {
            changed: changedRels,
            dirty,
            by,
            now,
            count: (quest, closer, when) => {
                count(quest, { by: closer, when });
            },
        };
        const rolled = new Set([...links.sync(linkPass, new Set())].filter((rel) => {
            const quest = files.get(rel)?.quest;
            return quest ? rollUp(quest, lang, now) : false;
        }));
        if (rolled.size > 0) {
            links.sync(linkPass, rolled);
        }
        for (const { rel, quest } of questFiles()) {
            if (!isOpen(quest.status) &&
                (quest.tracked === true || quest.favorite === true)) {
                delete quest.tracked;
                delete quest.favorite;
                dirty.add(rel);
            }
        }
        const moved = writeAndMove(dirty, lang);
        ledger.saveIfChanged();
        rememberIds();
        return moved;
    }
    function sync() {
        const found = new Set();
        const changedRels = new Set();
        let removed = false;
        for (const top of TOP_FOLDERS) {
            for (const rel of markdownFiles(dir, top, cfg.scan.skipFolderPrefixes)) {
                found.add(rel);
                const old = files.get(rel);
                let stat;
                let text;
                try {
                    stat = fs.statSync(abs(rel));
                    if (old?.mtimeMs === stat.mtimeMs && old.size === stat.size) {
                        continue;
                    }
                    text = fs.readFileSync(abs(rel), "utf8");
                }
                catch {
                    continue;
                }
                const quest = isQuestFile(text) ? parseQuest(text) : null;
                files.set(rel, {
                    mtimeMs: stat.mtimeMs,
                    birthtimeMs: stat.birthtimeMs,
                    size: stat.size,
                    text,
                    quest,
                    previous: old?.quest,
                });
                if (quest && old?.text !== text) {
                    changedRels.add(rel);
                }
                if (!quest && old?.quest) {
                    removed = true;
                }
            }
        }
        for (const [rel, entry] of files) {
            if (!found.has(rel)) {
                files.delete(rel);
                if (entry.quest) {
                    removed = true;
                }
            }
        }
        if (changedRels.size === 0 && !removed) {
            return false;
        }
        apply(changedRels, "file", Date.now());
        changed();
        return true;
    }
    function knownQuest(rel, version) {
        sync();
        const entry = files.get(rel);
        if (!entry?.quest) {
            throw new HttpError(404, `No quest file ${rel}`);
        }
        if (version !== undefined && entry.mtimeMs !== version) {
            throw new HttpError(409, `${rel} changed on disk; reload it before saving`);
        }
        return entry.quest;
    }
    function newFile(quest, now, name) {
        const slug = fileSlug(quest.title ?? "", cfg) || randomId(cfg.fileIdLength);
        const made = `${folderFor(quest.status)}/${stampOf(now).slice(0, 10)}-${slug}.md`;
        return freePath(isPlainName(name) ? name : made, (other) => files.has(other) || fs.existsSync(abs(other)));
    }
    function save(quest, rel, version, undo = false, name) {
        if (rel !== undefined && rel !== "") {
            knownQuest(rel, version);
        }
        const now = Date.now();
        const target = rel !== undefined && rel !== "" ? rel : newFile(quest, now, name);
        const before = files.get(target);
        files.set(target, {
            ...before,
            mtimeMs: now,
            quest,
            previous: before?.quest,
        });
        const moved = apply(new Set([target]), "app", now, undo);
        changed();
        return moved.get(target) ?? target;
    }
    function split(rel, at, version) {
        const parent = knownQuest(rel, version);
        const [top = -1, sub] = at;
        const group = parent.objectives[top];
        const step = at.length === 1 ? group : group?.sub?.[sub ?? -1];
        if (!step) {
            throw new HttpError(400, "No step at that position");
        }
        if (filled(parent.parent) || filled(step.link) || step.any === true) {
            throw new HttpError(400, "A linked quest, a linked step or an any-one group cannot be split");
        }
        const childRel = save(childQuestOf(parent, step));
        step.link = baseOf(childRel);
        delete step.due;
        delete step.sub;
        return { rel: save(parent, rel), child: childRel };
    }
    function remove(rel, version) {
        knownQuest(rel, version);
        fs.rmSync(abs(rel));
        sync();
    }
    function trashQuest(rel, version) {
        knownQuest(rel, version);
        try {
            trash(abs(rel));
        }
        catch (error) {
            warn(`Moving ${rel} to the recycle bin failed: ${messageOf(error)}`);
        }
        if (fs.existsSync(abs(rel))) {
            throw new HttpError(500, `Could not move ${rel} to the recycle bin`);
        }
        sync();
        changed();
    }
    const starter = { guilds: [...STARTER_GUILDS] };
    const guilds = () => readJson("guilds.json", starter, isGuildsFile).guilds;
    if (!fs.existsSync(abs("guilds.json"))) {
        write("guilds.json", jsonText({ questboard: 1, ...starter }));
    }
    let watcher;
    let poller;
    let timer;
    function watch() {
        const rescan = () => {
            try {
                sync();
            }
            catch (error) {
                warn(`Reading the data folder failed: ${messageOf(error)}`);
            }
        };
        try {
            watcher = fs.watch(dir, { recursive: true }, () => {
                clearTimeout(timer);
                timer = setTimeout(rescan, cfg.scan.watchDebounceMs);
            });
            watcher.on("error", (error) => {
                warn(`Watching the data folder failed: ${messageOf(error)}`);
            });
        }
        catch {
            poller = setInterval(rescan, cfg.scan.pollSeconds * 1000);
        }
    }
    function known(rel) {
        if (!files.get(rel)?.quest) {
            throw new HttpError(404, `No quest file ${rel}`);
        }
        return abs(rel);
    }
    function quests() {
        const list = questFiles();
        const ids = list.map(({ quest }) => quest.id);
        return list.map(({ rel, quest, mtimeMs }) => ({
            rel,
            version: mtimeMs,
            clash: ids.indexOf(quest.id) !== ids.lastIndexOf(quest.id),
            by: isOpen(quest.status) ? undefined : ledger.closedBy(quest.id ?? ""),
            q: quest,
        }));
    }
    return {
        dir,
        sync,
        save,
        split,
        remove,
        trashQuest,
        watch,
        close() {
            watcher?.close();
            clearInterval(poller);
            clearTimeout(timer);
        },
        quests,
        guilds,
        saveGuilds(list) {
            write("guilds.json", jsonText({ questboard: 1, guilds: checkedGuilds(list) }));
            changed();
        },
        settings,
        saveSettings(values) {
            write("settings.json", jsonText({ ...settings(), ...values }));
            changed();
        },
        importPlayer(player, mode) {
            ledger.importPlayer(player, mode);
            changed();
        },
        onChange(listener) {
            listeners.push(listener);
        },
        player: () => ledger.player(),
        text: (rel) => fs.readFileSync(known(rel), "utf8"),
        path: known,
    };
}
