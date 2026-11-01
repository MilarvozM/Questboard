import { copyOf } from "../shared/records.js";
import { ApiError, postPlayer, removeQuest, saveQuest, } from "./api.js";
import { toast } from "./feedback.js";
import { t } from "./i18n.js";
import { load } from "./load.js";
import { byRel, relOf } from "./quests.js";
import { render } from "./render.js";
import { data, meta } from "./state.js";
export const undoStack = [];
let queue = Promise.resolve();
export async function reload() {
    await load();
    render();
}
function failed(error) {
    console.error(error);
    const changedOnDisk = error instanceof ApiError && error.status === 409;
    toast(t(changedOnDisk ? "changed_disk" : "save_failed"), changedOnDisk || !(error instanceof Error) ? "" : error.message, "var(--danger)", { kind: "refuse", undo: false });
}
export async function run(work) {
    const next = queue.then(work).catch(async (error) => {
        failed(error);
        await reload();
        return undefined;
    });
    queue = next;
    return next;
}
export function pushUndo(entry) {
    undoStack.push(entry);
    if (undoStack.length > data().cfg.undoDepth) {
        undoStack.shift();
    }
    return entry;
}
export function versionOf(rel) {
    const quest = byRel(rel);
    return quest ? meta.get(quest)?.version : undefined;
}
export function remember(quests) {
    return pushUndo({
        items: quests.map((quest) => ({
            rel: relOf(quest),
            version: meta.get(quest)?.version,
            before: copyOf(quest),
        })),
        created: [],
    });
}
export function followSave(from, to) {
    for (const file of undoStack.flatMap((entry) => [
        ...entry.items,
        ...entry.created,
    ])) {
        if (file.rel === from.rel && file.version === from.version) {
            file.rel = to.rel;
            file.version = to.version;
        }
    }
}
export async function persist(quests, entry) {
    let saved;
    for (const quest of quests) {
        const known = meta.get(quest);
        saved = await saveQuest({
            rel: known?.rel,
            version: known?.version,
            quest,
        });
        if (known) {
            followSave(known, saved);
        }
        else {
            entry?.created.push({ rel: saved.rel, version: saved.version });
        }
    }
    await reload();
    for (const item of entry?.items ?? []) {
        item.version = versionOf(item.rel) ?? item.version;
    }
    return saved;
}
async function takeBack(entry) {
    for (const { rel, version, before } of entry.items) {
        if (!entry.created.some((file) => file.rel === rel)) {
            followSave({ rel, version }, await saveQuest({ rel, version, quest: before, undo: true }));
            await load();
        }
    }
    for (const file of entry.created) {
        await removeQuest(file);
        await load();
    }
    for (const { rel, quest } of entry.restore ?? []) {
        await saveQuest({ quest, name: rel, undo: true });
        await load();
    }
    if (entry.player) {
        await postPlayer("replace", entry.player);
        await load();
    }
    render();
    toast(t("t_undo"), "", "var(--dim)", { kind: "undo", undo: false });
}
export function undo() {
    const entry = undoStack.pop();
    if (!entry) {
        toast(t("nothing_undo"), "", "var(--dim)", { kind: "refuse", undo: false });
        return;
    }
    void run(async () => {
        await takeBack(entry);
    });
}
