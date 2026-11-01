import { HOUR_MS } from "../shared/dates.js";
import { filled } from "../shared/records.js";
import { $, esc, svg } from "./dom.js";
import { guildOf, guildView } from "./guilds.js";
import { emblem, IC, TYPE_IC } from "./icons.js";
import { t } from "./i18n.js";
import { completeButton } from "./list.js";
import { byDue, child, current, dueOf, focusPick, goAttr, msUntil, nextAfter, nextDue, relOf, sLine, stepDue, ticks, } from "./quests.js";
import { clock, data, ui } from "./state.js";
import { countdown, dur, hm, longDate, red } from "./time.js";
function setHeight(strip) {
    document.body.style.setProperty("--focus-h", `${String(strip.offsetHeight)}px`);
}
function timeLabel(due, ms, step) {
    if (!due) {
        return t("deadline");
    }
    const over = ms !== null && ms < 0;
    if (step) {
        return over ? t("step_over") : t("step_due");
    }
    return over ? t("time_over") : t("time_left");
}
function stepLine(leaf) {
    if (!leaf) {
        return "";
    }
    const context = leaf.parent
        ? `<em class="ctx">${esc(leaf.parent.t)}${leaf.parent.any === true ? ` · ${t("any_one")}` : ""} ›</em>`
        : "";
    const fail = child(leaf.o)
        ? ""
        : `<button class="fs no" data-fset="failed" title="${t("a_fail")}">${svg(IC.failed)}</button>`;
    return `<div class="f-step">${svg(filled(leaf.o.link) ? IC.link : IC.open)}${context}<span>${esc(leaf.o.t)}</span>
    <button class="fs ok" data-fset="done" title="${t("a_done")}">${svg(IC.done)}</button>${fail}
    <button class="fs" data-fset="dropped" title="${t("a_drop")}">${svg(IC.dropped)}</button></div>`;
}
function miniTimeline(quest, leaf) {
    const deadline = dueOf(quest);
    if (quest.type === "activity" || !deadline) {
        return "<div></div>";
    }
    const now = clock.now.getTime();
    const sAt = sLine(quest)?.getTime() ?? null;
    const stepAt = stepDue(leaf?.o)?.getTime() ?? null;
    const times = [now, deadline.getTime(), sAt ?? now, stepAt ?? now];
    const start = Math.min(...times);
    const end = Math.max(...times, start + HOUR_MS);
    const pos = (time) => `${(((time - start) / (end - start)) * 100).toFixed(2)}%`;
    const sMark = sAt !== null && sAt > now
        ? `<i class="mk s" style="left:${pos(sAt)}"><span>S</span></i>`
        : "";
    const stepMark = stepAt === null
        ? ""
        : `<i class="mk st" style="left:${pos(stepAt)}"><span>${t("lg_step")}</span></i>`;
    return `<div class="mini ${deadline.getTime() < now ? "over" : ""}"><i class="track"></i>${sMark}${stepMark}<i class="end" style="left:${pos(deadline.getTime())}"><span>${t("deadline")}</span></i><i class="now" style="left:${pos(now)}"><span>${t("now")}</span></i></div>`;
}
function switchMenu(quest) {
    const others = data()
        .quests.filter((x) => x !== quest)
        .sort(byDue);
    const rows = others
        .map((other) => {
        const due = dueOf(other);
        const ms = msUntil(due);
        return `<button class="c-${other.type} ${red(ms) ? "red" : ""}" data-trackid="${esc(relOf(other))}">${svg(TYPE_IC[other.type])}<span>${esc(other.title)}</span><span>${ms === null ? "—" : countdown(ms)}</span></button>`;
    })
        .join("");
    const untrack = quest.tracked === true
        ? `<div class="sep"></div><button data-untrack>${svg(IC.swap)}<span>${t("untrack_all")}</span><span></span></button>`
        : "";
    return `<div class="menu frame ${ui.switchOpen ? "on" : ""}">
      ${rows}
      ${untrack}
    </div>`;
}
export function renderFocus() {
    const { q: quest, why } = focusPick();
    const strip = $("#focus");
    if (!quest) {
        strip.className = "focus c-main";
        strip.innerHTML = `<div style="min-width:0;grid-column:1 / -1"><div class="f-quest empty">${t("no_quests")}</div></div>`;
        setHeight(strip);
        return;
    }
    strip.className = `focus c-${quest.type}`;
    const leaf = current(quest);
    const next = leaf ? nextAfter(quest, leaf) : undefined;
    const { at: due, step } = nextDue(quest);
    const ms = msUntil(due);
    const guild = guildView(guildOf(quest));
    const then = next ? `<b>${t("then")}</b><span>${esc(next.o.t)}</span>` : "";
    const time = due && ms !== null
        ? `<b class="${red(ms) ? "red" : ""}">${dur(ms)}</b><span>${longDate(due)} · ${hm(due)}</span>`
        : `<b class="">—</b><span>${t("no_deadline")}</span>`;
    strip.innerHTML = `
    ${completeButton(quest)}
    <div style="min-width:0">
      <div class="f-meta">${svg(TYPE_IC[quest.type])}${t(why).toUpperCase()} · ${t(`${quest.type}_q`).toUpperCase()}
        <span class="g">// ${svg(emblem(guild))}${esc(guild.name).toUpperCase()}</span>
        <button class="switch" data-switch>${t("switch").toUpperCase()} ▾</button></div>
      <button class="f-quest" ${goAttr(quest)}>${esc(quest.title)}</button>
      ${stepLine(leaf)}
      <div class="f-next">${then}${quest.type === "activity" ? "" : ticks(quest)}</div>
    </div>
    ${miniTimeline(quest, leaf)}
    <div class="f-time"><small>${timeLabel(due, ms, step)}</small>
      ${time}</div>
    ${switchMenu(quest)}`;
    setHeight(strip);
}
