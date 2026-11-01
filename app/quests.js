import { DAY_MS } from "../shared/dates.js";
import { sLineMs } from "../shared/grades.js";
import { filled } from "../shared/records.js";
import { isOpen } from "../shared/types.js";
import { esc } from "./dom.js";
import { locale } from "./i18n.js";
import { guildOf } from "./guilds.js";
import { nextRun } from "./schedule.js";
import { clock, data, meta, ui } from "./state.js";
import { dateOrNull, red } from "./time.js";
export function relOf(quest) {
    return meta.get(quest)?.rel ?? "";
}
export function allQuests() {
    return [...data().quests, ...data().journal];
}
export function byRel(rel) {
    return allQuests().find((quest) => relOf(quest) === rel);
}
export function xpOf(quest) {
    return quest.xp ?? data().cfg.xp[quest.type];
}
export function leaves(quest) {
    return quest.objectives.flatMap((step, i) => step.sub
        ? step.sub.map((sub, j) => ({ o: sub, parent: step, path: [i, j] }))
        : [{ o: step, path: [i] }]);
}
const isAvailable = (leaf) => leaf.o.s === "open" && (!leaf.parent || leaf.parent.s === "open");
export function current(quest) {
    return leaves(quest).find(isAvailable);
}
export function nextAfter(quest, from) {
    const open = leaves(quest).filter(isAvailable);
    return open
        .slice(open.findIndex((leaf) => leaf.o === from.o) + 1)
        .find((leaf) => !(from.parent?.any === true && leaf.parent === from.parent));
}
export function dueOf(quest) {
    return quest.type === "activity"
        ? nextRun(quest)
        : dateOrNull(quest.deadline);
}
export function goAttr(quest) {
    if (!quest) {
        return "";
    }
    return isOpen(quest.status)
        ? `data-open="${esc(relOf(quest))}"`
        : `data-openj="${esc(relOf(quest))}"`;
}
export function parentOf(quest) {
    const parent = quest.parent;
    return filled(parent) ? allQuests().find((x) => x.id === parent) : undefined;
}
function linkName(link) {
    return ((link.split("#")[0] ?? "")
        .split("/")
        .pop()
        ?.replace(/\.md$/i, "")
        .toLowerCase() ?? "");
}
function fileName(quest) {
    return linkName(relOf(quest));
}
export function child(step) {
    const link = step?.link;
    return filled(link)
        ? allQuests().find((quest) => fileName(quest) === linkName(link))
        : undefined;
}
export function stepDue(step) {
    if (!step) {
        return null;
    }
    return filled(step.link)
        ? dateOrNull(child(step)?.deadline)
        : dateOrNull(step.due);
}
export function nextDue(quest) {
    const own = dueOf(quest);
    const step = stepDue(current(quest)?.o);
    return step && (!own || step < own)
        ? { at: step, step: true }
        : { at: own, step: false };
}
export function msUntil(date) {
    return date ? date.getTime() - clock.now.getTime() : null;
}
export function matchRank(quest) {
    const wanted = ui.search.trim().toLowerCase();
    if (!wanted) {
        return 1;
    }
    const has = (text) => (text ?? "").toLowerCase().includes(wanted);
    if (has(quest.title)) {
        return 3;
    }
    if (leaves(quest).some((leaf) => has(leaf.o.t)) ||
        quest.objectives.some((step) => has(step.t))) {
        return 2;
    }
    return has(quest.briefing) ? 1 : 0;
}
export function inRange(quest) {
    if (ui.dueFrom === null) {
        return true;
    }
    const from = dateOrNull(`${ui.dueFrom} 00:00`);
    const to = dateOrNull(`${ui.dueTo ?? ui.dueFrom} 23:59`);
    const dues = [
        dateOrNull(quest.deadline),
        ...leaves(quest)
            .filter((leaf) => leaf.o.s === "open")
            .map((leaf) => stepDue(leaf.o)),
    ].filter((due) => due !== null);
    return dues.some((due) => from !== null && to !== null && due >= from && due <= to);
}
export function visible(source) {
    return source.filter((quest) => (ui.type === null || quest.type === ui.type) &&
        (ui.guild === null || guildOf(quest) === ui.guild) &&
        matchRank(quest) > 0 &&
        inRange(quest));
}
const timeOr = (date) => date ? date.getTime() : Infinity;
export const SORTS = {
    due: (a, b) => timeOr(nextDue(a).at) - timeOr(nextDue(b).at),
    deadline: (a, b) => timeOr(dueOf(a)) - timeOr(dueOf(b)),
    created: (a, b) => (b.created ?? "").localeCompare(a.created ?? ""),
    title: (a, b) => (a.title ?? "").localeCompare(b.title ?? "", locale()),
};
export function sorted(quests) {
    const bySetting = SORTS[ui.sort] ?? SORTS["due"];
    return quests.sort((a, b) => matchRank(b) - matchRank(a) || (bySetting?.(a, b) ?? 0));
}
export function byDue(a, b) {
    return timeOr(dueOf(a)) - timeOr(dueOf(b));
}
export function urgency(ms) {
    if (ms === null) {
        return "";
    }
    if (ms < 0) {
        return "over";
    }
    return red(ms) ? "crit" : "";
}
export function focusPick() {
    const quests = data().quests;
    const tracked = quests.find((quest) => quest.tracked === true);
    if (tracked) {
        return { q: tracked, why: "tracking" };
    }
    const urgent = quests
        .filter((quest) => quest.type !== "activity" && nextDue(quest).at !== null)
        .sort((a, b) => timeOr(nextDue(a).at) - timeOr(nextDue(b).at))[0];
    if (urgent &&
        timeOr(nextDue(urgent).at) - clock.now.getTime() <
            data().cfg.urgentDays * DAY_MS) {
        return { q: urgent, why: "urgent" };
    }
    const favorite = favs()[0];
    return favorite
        ? { q: favorite, why: "favorite" }
        : { q: urgent ?? quests.slice().sort(byDue)[0], why: "urgent" };
}
export function focusQuest() {
    return focusPick().q;
}
export function favs() {
    return data()
        .quests.filter((quest) => quest.favorite === true)
        .sort(byDue);
}
export function sLine(quest) {
    const ms = sLineMs(quest, data().cfg.sLineAt);
    return ms === null ? null : new Date(ms);
}
export function ticks(quest) {
    return `<div class="ticks">${quest.objectives.map((step) => `<i class="${step.s}"></i>`).join("")}</div>`;
}
export function level() {
    const step = data().cfg.levelXpStep;
    let xp = Object.values(data().player.days)
        .flatMap((guilds) => Object.values(guilds))
        .reduce((sum, bucket) => sum + (bucket.xp ?? 0), 0);
    let lv = 1;
    while (xp >= step * lv) {
        xp -= step * lv;
        lv++;
    }
    return { lv, xp, need: step * lv };
}
export function doneCount(quest) {
    return quest.objectives.filter((step) => step.s !== "open").length;
}
