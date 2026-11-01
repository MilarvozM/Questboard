import { QUEST_TYPES } from "../shared/types.js";
import { $, esc, svg } from "./dom.js";
import { guildOf, guildView } from "./guilds.js";
import { emblem, IC, TYPE_IC } from "./icons.js";
import { t } from "./i18n.js";
import { current, dueOf, favs, inRange, matchRank, msUntil, relOf, sorted, stepDue, ticks, urgency, visible, } from "./quests.js";
import { repeatLabel, streak } from "./schedule.js";
import { clock, data, ui } from "./state.js";
import { countdown, dateOnly, dayKey, red } from "./time.js";
export function starButton(quest) {
    const on = quest.favorite === true;
    return `<button class="star ${on ? "on" : ""}" data-fav="${esc(relOf(quest))}" title="${t(on ? "b_unfav" : "b_fav")}">${svg(on ? IC.star_f : IC.star)}</button>`;
}
export function trackButton(quest) {
    const on = quest.tracked === true;
    return `<button class="trk ${on ? "on" : ""}" data-tracktoggle title="${t(on ? "b_untrack" : "b_track")}">${svg(IC.track)}</button>`;
}
const COMPLETE_FRAME = '<svg class="cframe" viewBox="0 0 72 82" preserveAspectRatio="none"><polygon points="36,1 71,21.25 71,60.75 36,81 1,60.75 1,21.25"/><circle cx="36" cy="41" r="35"/></svg>';
export function completeButton(quest) {
    const activity = quest.type === "activity";
    const doneToday = activity &&
        quest.completions.some((day) => day.startsWith(dayKey(clock.now)));
    return `<button class="cbox ${doneToday ? "on" : ""}" data-complete title="${t(activity ? "mark_done" : "b_complete")}">${COMPLETE_FRAME}${svg(IC.complete)}</button>`;
}
export function trackedPin(quest) {
    return quest.tracked === true
        ? `<span class="pin" title="${t("tracked")}">${svg(IC.track)}</span>`
        : "";
}
function questRow(quest) {
    const ms = msUntil(dueOf(quest));
    const leaf = current(quest);
    const stepDate = stepDue(leaf?.o);
    const stepHtml = stepDate
        ? ` <span class="sdue ${red(msUntil(stepDate)) ? "red" : ""}">${svg(IC.clock)}${dateOnly(stepDate)}</span>`
        : "";
    let sub = "";
    if (quest.type === "activity") {
        sub = `${repeatLabel(quest.repeat)} · ${t("streak", streak(quest))}`;
    }
    else if (leaf) {
        sub = `<b>▸</b> ${esc(leaf.o.t)}${stepHtml}`;
    }
    return `<div class="q c-${quest.type} ${urgency(ms)} ${relOf(quest) === ui.sel ? "sel" : ""}" data-q="${esc(relOf(quest))}">
    <div class="bar-t"></div>${svg(TYPE_IC[quest.type])}
    <div><h3>${svg(emblem(guildView(guildOf(quest))))}<span class="tt">${esc(quest.title)}</span>${trackedPin(quest)}${starButton(quest)}</h3>${sub ? `<p>${sub}</p>` : ""}${quest.type === "activity" ? "" : ticks(quest)}</div>
    <div class="due">${ms === null ? "" : countdown(ms)}</div></div>`;
}
function listTitle() {
    if (ui.favView) {
        return t("favorites");
    }
    if (ui.guild !== null) {
        return esc(guildView(ui.guild).name);
    }
    return ui.type === null ? t("all") : t(ui.type);
}
export function renderList() {
    const quests = sorted(ui.favView
        ? favs().filter((quest) => matchRank(quest) > 0 && inRange(quest))
        : visible(data().quests));
    if (!quests.some((quest) => relOf(quest) === ui.sel)) {
        const first = quests[0];
        ui.sel = first ? relOf(first) : null;
    }
    const grouped = ui.group && ui.type === null && !ui.favView;
    const grouping = ui.type !== null || ui.favView
        ? ""
        : `<button class="ib ${ui.group ? "on" : ""}" data-grouping title="${t(ui.group ? "mix_types" : "group_types")}">${svg(IC.layers)}</button>`;
    const rows = grouped
        ? QUEST_TYPES.map((type) => {
            const items = quests.filter((quest) => quest.type === type);
            return items.length > 0
                ? `<div class="group-h c-${type}">${svg(TYPE_IC[type])}${t(type)}</div>${items
                    .map(questRow)
                    .join("")}`
                : "";
        }).join("")
        : quests.map(questRow).join("");
    $("#list").innerHTML = `<div class="list-head"><h2>${listTitle()}</h2>
      <button class="sortb" data-sort>${svg(IC.sort)}<span>${t(`sort_${ui.sort}`)}</span></button>
      ${grouping}</div>${rows}`;
}
