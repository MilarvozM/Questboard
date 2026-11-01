import { dayOf } from "../shared/dates.js";
import { filled } from "../shared/records.js";
import { objectAt } from "./actions.js";
import { $, esc, placeNear, svg } from "./dom.js";
import { guildOf, guildView } from "./guilds.js";
import { emblem, IC, iconNamed, TYPE_IC } from "./icons.js";
import { num, t } from "./i18n.js";
import { byRel, current, doneCount, dueOf, goAttr, leaves, msUntil, relOf, ticks, urgency, visible, xpOf, } from "./quests.js";
import { occurs, repeatLabel, runState, streak } from "./schedule.js";
import { clock, data, ui } from "./state.js";
import { addDays, countdown, dateOrNull, dayKey, fmt, hm, longDate, noonOf, pad, red, stamp, } from "./time.js";
const MODES = ["quests", "steps", "everything"];
function shortOf(quest) {
    return (quest.short ?? quest.title).slice(0, data().cfg.shortNameMax);
}
function monthDays(month) {
    const [year = 0, monthNumber = 1] = month.split("-").map(Number);
    const lastDay = new Date(year, monthNumber, 0).getDate();
    const first = `${month}-01`;
    const last = `${month}-${pad(lastDay)}`;
    const weekday = (day) => noonOf(day).getDay();
    const lead = (weekday(first) - ui.weekStart + 7) % 7;
    const trail = 6 - ((weekday(last) - ui.weekStart + 7) % 7);
    return [...Array(lead + lastDay + trail).keys()].map((i) => addDays(first, i - lead));
}
function addActivity(quest, days, add, everything) {
    const rel = esc(relOf(quest));
    for (const day of days) {
        if (!occurs(quest, day)) {
            continue;
        }
        const state = runState(quest, day);
        if ((state === "done" || state === "skip") && !everything) {
            continue;
        }
        add(day, "marks", 1, `<button class="mk-act ${state}" data-pop="a|${rel}|${day}">${svg(iconNamed(`act_${state}`))}</button>`);
    }
}
function addStepMarks(step, spec, add) {
    if (filled(step.at) && step.s !== "open") {
        add(dayOf(step.at), "marks", 0, `<button class="mk-${step.s}" data-pop="${spec}">${svg(iconNamed(step.s))}</button>`);
    }
    if (filled(step.added)) {
        add(dayOf(step.added), "marks", 0, `<button class="mk-new" data-pop="${spec}">${svg(IC.new)}</button>`);
    }
}
function legend(steps) {
    const stepLegend = steps
        ? `
      <span>${svg(IC.clock)}${t("lg_step")}</span>
      <span><i class="mk-done">${svg(IC.done)}</i>${t("done")}</span>
      <span><i class="mk-failed">${svg(IC.failed)}</i>${t("failed")}</span>
      <span><i class="mk-dropped">${svg(IC.dropped)}</i>${t("dropped")}</span>
      <span><i class="mk-new">${svg(IC.new)}</i>${t("new")}</span>`
        : "";
    return `<div class="legend">
      <span style="color:var(--main)">${svg(TYPE_IC.main)}${t("main")}</span>
      <span style="color:var(--side)">${svg(TYPE_IC.side)}${t("side")}</span>
      <span style="color:var(--act)">${svg(TYPE_IC.activity)}${t("activity")}</span>
      <span>│</span>${stepLegend}
      <span><i class="mk-act">${svg(IC.act_done)}</i><i class="mk-act todo">${svg(IC.act_todo)}</i><i class="mk-act miss">${svg(IC.act_miss)}</i><i class="mk-act skip">${svg(IC.act_skip)}</i>${t("lg_act")}</span>
    </div>`;
}
export function renderCal() {
    const month = ui.month;
    const days = monthDays(month);
    const steps = ui.calMode !== "quests";
    const everything = ui.calMode === "everything";
    const chips = data().cfg.calendarChips;
    const today = dayKey(clock.now);
    const maxChips = days.length > 35 || innerHeight < chips.crowdedBelowPx
        ? chips.crowded
        : chips.perDay;
    const cells = new Map(days.map((day) => [day, { evs: [], marks: [] }]));
    const add = (day, kind, sort, html) => {
        cells.get(day)?.[kind].push([sort, html]);
    };
    for (const quest of visible(data().quests)) {
        const rel = esc(relOf(quest));
        if (quest.type === "activity") {
            addActivity(quest, days, add, everything);
            continue;
        }
        const due = dateOrNull(quest.deadline);
        if (quest.deadline !== undefined && due) {
            add(dayOf(quest.deadline), "evs", due.getTime(), `<button class="ev c-${quest.type} ${urgency(msUntil(due))}" data-pop="q|${rel}"><time>${hm(due)}</time>${svg(emblem(guildView(guildOf(quest))))}<span>${esc(shortOf(quest))}</span></button>`);
        }
        if (!steps) {
            continue;
        }
        for (const { o: step, path } of leaves(quest)) {
            const spec = `o|${rel}|${path.join(".")}`;
            const stepDate = dateOrNull(step.due);
            if (step.due !== undefined && stepDate && step.s === "open") {
                add(dayOf(step.due), "evs", stepDate.getTime(), `<button class="ev sdchip c-${quest.type} ${urgency(msUntil(stepDate))}" data-pop="${spec}"><time>${hm(stepDate)}</time>${svg(IC.clock)}<span>${esc(step.t)}</span></button>`);
            }
            addStepMarks(step, spec, add);
        }
    }
    if (everything) {
        for (const closed of visible(data().journal)) {
            const rel = esc(relOf(closed));
            const end = dateOrNull(closed.completed);
            if (closed.completed !== undefined && end) {
                add(dayOf(closed.completed), "evs", end.getTime(), `<button class="ev fin c-${closed.type}" data-pop="j|${rel}">${svg(IC.finish)}${svg(emblem(guildView(guildOf(closed))))}<span>${esc(shortOf(closed))}</span><b>${closed.grade ?? "✕"}</b></button>`);
            }
            for (const { o: step } of leaves(closed)) {
                addStepMarks(step, `j|${rel}`, add);
            }
        }
    }
    const grid = days
        .map((day) => {
        const cell = cells.get(day) ?? { evs: [], marks: [] };
        const events = cell.evs.sort((a, b) => a[0] - b[0]).map((e) => e[1]);
        const shown = events.length > maxChips ? events.slice(0, maxChips - 1) : events;
        const more = events.length > maxChips
            ? `<button class="ev more" data-pop="d|${day}">${t("more", events.length - shown.length)}</button>`
            : "";
        const marks = cell.marks
            .sort((a, b) => a[0] - b[0])
            .map((m) => m[1])
            .join("");
        return `<div class="day ${day.slice(0, 7) !== month ? "out" : ""} ${day === today ? "today" : ""}">
      <div class="num"><span>${fmt(noonOf(day), { day: "numeric" })}</span><div class="marks">${marks}</div></div>${shown.join("")}${more}</div>`;
    })
        .join("");
    ui.calDays = cells;
    const modes = MODES.map((mode) => `<button class="${ui.calMode === mode ? "on" : ""}" data-calmode="${mode}">${t(`cm_${mode === "everything" ? "all" : mode}`)}</button>`).join("");
    $("#v-cal").innerHTML = `
    <div class="cal-head"><button class="nav-btn" data-cal="-1">‹</button><h2>${fmt(noonOf(`${month}-01`), { month: "long", year: "numeric" })}</h2>
      <button class="nav-btn" data-cal="1">›</button><button class="nav-btn" data-cal="0">${t("today")}</button>
      <div class="seg">${modes}</div></div>
    <div class="wds">${days
        .slice(0, 7)
        .map((day) => `<div>${fmt(noonOf(day), { weekday: "short" })}</div>`)
        .join("")}</div>
    <div class="grid">${grid}</div>
    ${legend(steps)}`;
}
function guildCrumb(quest) {
    const guild = guildView(guildOf(quest));
    return `<span style="display:inline-flex;gap:5px;align-items:center">${svg(emblem(guild))}${esc(guild.name)}</span>`;
}
function questCard(quest, open) {
    const leaf = current(quest);
    const due = dueOf(quest);
    const ms = msUntil(due);
    const when = due ? `${longDate(due)} · ${hm(due)}` : "";
    return `<div class="crumb c-${quest.type}"><b>${svg(TYPE_IC[quest.type])}${t(`${quest.type}_q`).toUpperCase()}</b>//${guildCrumb(quest)}</div>
      <h4>${esc(quest.title)}</h4><p class="cur c-${quest.type}"><b>▸</b> ${leaf ? esc(leaf.o.t) : "—"}</p>
      <div class="due-row"><span>${svg(IC.clock)}${when}</span><b class="${red(ms) ? "red" : ""}">${ms === null ? "" : countdown(ms)}</b></div>
      <div class="meta c-${quest.type}">${ticks(quest)}<span>${String(doneCount(quest))} / ${String(quest.objectives.length)}</span></div>
      <div class="actions">${quest.tracked === true ? "" : `<button class="btn sm primary" data-trackid="${esc(relOf(quest))}">${t("b_track")}</button>`}${open}</div>`;
}
const STEP_COLORS = {
    done: "var(--main)",
    failed: "var(--danger)",
    dropped: "var(--dim)",
    new: "var(--side)",
};
function stepCard(quest, step, open) {
    const meta = `<div class="meta">${svg(TYPE_IC[quest.type])}<span>${esc(quest.title)}</span></div><div class="actions">${open}</div>`;
    const due = dateOrNull(step.due);
    if (step.s === "open" && due) {
        const ms = msUntil(due);
        return `<div class="crumb c-${quest.type}"><b>${svg(IC.clock)}${t("lg_step").toUpperCase()}</b></div><h4>${esc(step.t)}</h4>
        <div class="due-row"><span>${svg(IC.clock)}${longDate(due)} · ${hm(due)}</span><b class="${red(ms) ? "red" : ""}">${ms === null ? "" : countdown(ms)}</b></div>
        ${meta}`;
    }
    const state = step.s === "open" && filled(step.added) ? "new" : step.s;
    const when = step.s === "open" ? step.added : step.at;
    const note = filled(step.note)
        ? `<p class="note">— ${esc(step.note)}</p>`
        : "";
    return `<div class="crumb"><b style="color:${STEP_COLORS[state] ?? ""}">${svg(iconNamed(state))}${t(state).toUpperCase()}</b>//<span>${stamp(dateOrNull(when))}</span></div>
      <h4>${esc(step.t)}</h4>${note}
      ${meta}`;
}
const RUN_COLORS = {
    done: "var(--act)",
    miss: "var(--danger)",
    skip: "var(--dim)",
    todo: "var(--dim)",
};
function runCard(quest, day, open) {
    const state = runState(quest, day);
    const markDone = state !== "done" && day <= dayKey(clock.now)
        ? `<button class="btn sm primary" data-actdone="${esc(relOf(quest))}|${day}">${t("mark_done")}</button>`
        : "";
    return `<div class="crumb c-activity"><b>${svg(TYPE_IC.activity)}${t("activity_q").toUpperCase()}</b>//<span style="color:${RUN_COLORS[state] ?? ""}">${t(`act_${state}`).toUpperCase()}</span></div>
      <h4>${esc(quest.title)}</h4>
      <div class="due-row"><span>${svg(IC.clock)}${longDate(noonOf(day))}</span><b>${t("streak", streak(quest))}</b></div>
      <div class="meta">${repeatLabel(quest.repeat)} · +${String(xpOf(quest))} XP</div>
      <div class="actions">${markDone}${open}</div>`;
}
function closedCard(quest) {
    const complete = quest.status === "complete";
    const end = dateOrNull(quest.completed);
    const grade = quest.grade ?? "undefined";
    return `<div class="crumb c-${quest.type}"><b>${svg(TYPE_IC[quest.type])}${t(complete ? "completed" : "abandoned").toUpperCase()}</b>//${guildCrumb(quest)}</div>
      <h4>${esc(quest.title)}</h4>
      <div class="due-row"><span>${svg(IC.finish)}${end ? `${longDate(end)} · ${hm(end)}` : "—"}</span><b class="g ${complete ? grade : "X"}">${complete ? t("grade_x", grade) : t("abandoned").toUpperCase()}</b></div>
      ${complete && quest.awarded !== undefined && quest.awarded !== 0 ? `<div class="meta">+${num(quest.awarded)} XP</div>` : ""}
      <div class="actions"><button class="btn sm" data-openj="${esc(relOf(quest))}">${t("open_journal")}</button></div>`;
}
function popHtml(spec) {
    const [kind = "", rel = "", extra = ""] = spec.split("|");
    if (kind === "d") {
        const events = ui.calDays.get(rel)?.evs ?? [];
        return `<div class="crumb"><span>${longDate(noonOf(rel))}</span></div><div class="list">${events.map((e) => e[1]).join("")}</div>`;
    }
    const quest = byRel(rel);
    if (!quest) {
        return "";
    }
    const open = `<button class="btn sm" ${goAttr(quest)}>${t("b_open")}</button>`;
    if (kind === "q") {
        return questCard(quest, open);
    }
    if (kind === "o") {
        const step = objectAt(quest, extra.split(".").map(Number));
        return step ? stepCard(quest, step, open) : "";
    }
    if (kind === "a") {
        return runCard(quest, extra, open);
    }
    return kind === "j" ? closedCard(quest) : "";
}
export function openPop(spec, anchor) {
    const panel = $("#pop");
    panel.innerHTML = popHtml(spec);
    panel.classList.add("on");
    placeNear(panel, anchor);
}
export function closePop() {
    $("#pop").classList.remove("on");
}
