import { HOUR_MS } from "../shared/dates.js";
import { filled } from "../shared/records.js";
import { $, esc, find, svg } from "./dom.js";
import { dragSort } from "./drag.js";
import { moveItem } from "./editing.js";
import { guildOf, guildView } from "./guilds.js";
import { emblem, IC, iconNamed, TYPE_IC } from "./icons.js";
import { t } from "./i18n.js";
import { notTaken } from "./actions.js";
import { completeButton, starButton, trackButton } from "./list.js";
import { child, current, goAttr, leaves, msUntil, parentOf, relOf, sLine, stepDue, ticks, } from "./quests.js";
import { nextRun, repeatLabel, streak } from "./schedule.js";
import { clock, data, meta, ui } from "./state.js";
import { countdown, dateOnly, dateOrNull, dur, fmt, hm, red, stamp, } from "./time.js";
function editOf(quest) {
    return ui.edit?.rel === relOf(quest) ? ui.edit : null;
}
export function isEditing(quest, part) {
    return editOf(quest)?.part === part;
}
function activityLine(quest) {
    const next = nextRun(quest);
    const ms = msUntil(next);
    const when = next && ms !== null
        ? `${svg(IC.clock)}${dateOnly(next)} · ${countdown(ms)}`
        : "";
    return `<div class="actline frame"><button class="repb" data-repeat>${svg(IC.swap)}${repeatLabel(quest.repeat)}</button>
    <span>${t("streak", streak(quest))}</span><span class="nx">${when}</span></div>`;
}
function emptyTimeline() {
    return `<div class="tl2 empty frame"><div class="rail2"><div class="track"></div><i class="now" style="left:0"></i>
    <button class="end" data-deadline title="${t("set_deadline")}">${svg(IC.clock)}</button></div></div>`;
}
function gradesLeft(deadline, sDate) {
    const now = clock.now.getTime();
    const graceEnd = deadline.getTime() + data().cfg.gradeBGraceHours * HOUR_MS;
    const lines = [
        ...(sDate
            ? [
                {
                    grade: "S",
                    ms: sDate.getTime() - now,
                    action: "data-sline",
                },
            ]
            : []),
        { grade: "A", ms: deadline.getTime() - now, action: "data-deadline" },
        { grade: "B", ms: graceEnd - now, action: "data-deadline" },
    ];
    const ahead = lines.filter((line) => line.ms > 0).slice(0, 2);
    return ahead.length > 0
        ? ahead
        : [{ grade: "C", ms: deadline.getTime() - now, action: "data-deadline" }];
}
function timeLeftBlock(deadline, sDate) {
    if (!deadline) {
        return "<div></div>";
    }
    const rows = gradesLeft(deadline, sDate).map(({ grade, ms, action }) => `<button class="tl-g" ${action}><i class="${grade}">${grade}</i><b class="${grade !== "S" && red(ms) ? "red" : ""}">${ms < 0 ? countdown(ms) : dur(ms)}</b></button>`);
    return `<div class="tl-left">${rows.join("")}</div>`;
}
function deadlineBlock(deadline) {
    if (!deadline) {
        return `<button class="tl-set" data-deadline title="${t("set_deadline")}">${svg(IC.clock)}</button>`;
    }
    return `<button class="tl-dl" data-deadline><small>${t("deadline")}</small><b>${fmt(deadline, { month: "short", day: "numeric" })}</b><span>${fmt(deadline, { weekday: "short" })} ${hm(deadline)}</span></button>`;
}
function deadlineTimeline(quest) {
    const now = clock.now.getTime();
    const deadline = dateOrNull(quest.deadline);
    const sDate = quest.deadline === undefined ? null : sLine(quest);
    const marks = [];
    for (const { o: step, path } of leaves(quest)) {
        const due = step.s === "open" ? stepDue(step) : null;
        if (due) {
            marks.push({
                at: due,
                kind: "step",
                label: step.t,
                path: path.join("."),
                link: filled(step.link),
            });
        }
    }
    if (sDate && sDate.getTime() > now) {
        marks.push({ at: sDate, kind: "s", label: `S · ${stamp(sDate)}` });
    }
    if (!deadline && marks.length === 0) {
        return emptyTimeline();
    }
    const times = [
        now,
        ...marks.map((mark) => mark.at.getTime()),
        ...(deadline ? [deadline.getTime()] : []),
    ];
    const start = Math.min(...times);
    const end = Math.max(...times, start + 36e5);
    const pct = (time) => ((time - start) / (end - start)) * 100;
    const pos = (time) => `${pct(time).toFixed(2)}%`;
    const over = deadline !== null && deadline.getTime() < now;
    const markHtml = (mark) => {
        const tag = mark.link === true ? "span" : "button";
        let action = "";
        if (mark.kind === "s") {
            action = "data-sline";
        }
        else if (mark.link !== true) {
            action = `data-sdue-at="${mark.path ?? ""}"`;
        }
        return `<${tag} class="mk ${mark.kind} ${mark.at.getTime() < now ? "late" : ""}" style="left:${pos(mark.at.getTime())}" ${action}><span class="sl">${esc(mark.label)}</span></${tag}>`;
    };
    const lateSegment = over
        ? `<div class="late-seg" style="left:${pos(deadline.getTime())};right:${(100 - pct(now)).toFixed(2)}%"></div>`
        : "";
    const endMark = deadline
        ? `<button class="mk dl" style="left:${pos(deadline.getTime())}" data-deadline title="${t("deadline")}"></button>`
        : "";
    return `<div class="tl2 frame ${over ? "over" : ""}">${timeLeftBlock(deadline, sDate)}<div class="rail-box"><div class="rail2">
    <div class="track"></div>${lateSegment}
    <i class="now" style="left:${pos(now)}"><span>${t("now")}</span></i>${marks.map(markHtml).join("")}
    ${endMark}</div></div>${deadlineBlock(deadline)}</div>`;
}
function addRow(attrs) {
    return `<li class="ob addrow"><span></span><span class="st">${svg(IC.plus)}</span><span class="tools"></span><input class="ob-in" ${attrs}><span></span></li>`;
}
function editRow(item, path, group, stepNo) {
    const number = typeof stepNo === "number" ? `<i class="num">${String(stepNo)}.</i>` : "";
    return `<li class="ob ${path.length > 1 ? "sub" : ""}" data-path="${path.join(".")}" data-drag="${group}"><span class="grip">${svg(IC.grip)}</span>
    <button class="st" data-itemdel title="${t("g_delete")}">${svg(IC.x)}</button><span class="tools">${number}</span>
    <input class="ob-in" data-itemtext value="${esc(item.t)}"><span></span></li>`;
}
function stepTools(step, linked, canSplit) {
    if (step.s !== "open" || step.sub) {
        return "";
    }
    return [
        linked
            ? ""
            : `<button data-set="failed" title="${t("a_fail")}">${svg(IC.failed)}</button>`,
        `<button data-set="dropped" title="${t("a_drop")}">${svg(IC.dropped)}</button>`,
        linked
            ? ""
            : `<button data-sdue title="${t("a_due")}">${svg(IC.clock)}</button>`,
        canSplit
            ? `<button data-split title="${t("a_split")}">${svg(IC.link)}</button>`
            : "",
    ].join("");
}
function stepChips(quest, step) {
    const chips = [];
    const open = step.s === "open";
    if (step.any === true) {
        chips.push(`<em class="any" title="${t("any_one")}">${svg(IC.branch)}</em>`);
    }
    const due = dateOrNull(step.due);
    if (due) {
        const deadline = dateOrNull(quest.deadline);
        const late = deadline !== null && due > deadline;
        chips.push(`<button class="due-c ${open && red(msUntil(due)) ? "red" : ""} ${late ? "warn" : ""}" data-sdue ${late ? `title="${t("due_after")}"` : ""}>${svg(IC.clock)}${stamp(due)}</button>`);
    }
    const linked = child(step);
    const childDeadline = dateOrNull(linked?.deadline);
    if (linked && open && childDeadline) {
        chips.push(`<em class="due-c ${red(msUntil(childDeadline)) ? "red" : ""}">${svg(IC.clock)}${stamp(childDeadline)}</em>`);
    }
    return chips.join("");
}
function stepRow(quest, step, path, leaf, stepNo) {
    const linked = child(step);
    const open = step.s === "open";
    const sub = path.length > 1;
    let icon = iconNamed(step.s);
    if (open && filled(step.added)) {
        icon = IC.new;
    }
    else if (open && linked) {
        icon = IC.link;
    }
    const group = sub ? quest.objectives[path[0] ?? -1] : undefined;
    const passedOver = group?.any === true && group.s === "done" && notTaken(step.note);
    const state = step.sub || passedOver
        ? `<span class="st">${svg(icon)}</span>`
        : `<button class="st" ${open ? 'data-set="done"' : "data-reopen"} title="${t(open ? "a_done" : "reopen")}">${svg(icon)}</button>`;
    const canSplit = !filled(quest.parent) && !filled(step.link) && step.any !== true;
    const kids = linked
        ? `<span class="kid">${ticks(linked)}<span>${String(linked.objectives.filter((x) => x.s !== "open").length)} / ${String(linked.objectives.length)}</span></span>`
        : "";
    const text = linked
        ? `<button class="lk" ${goAttr(linked)}>${esc(step.t)}</button>`
        : esc(step.t);
    const number = typeof stepNo === "number" ? `<i class="num">${String(stepNo)}.</i>` : "";
    const note = filled(step.note)
        ? `<small class="note">— ${esc(step.note)}</small>`
        : "";
    const time = !open && filled(step.at)
        ? `<time title="${t(step.s)}">${stamp(dateOrNull(step.at))}</time>`
        : "<span></span>";
    return `<li class="ob ${step.s} ${sub ? "sub" : ""} ${leaf?.o === step ? "cur" : ""}" data-path="${path.join(".")}" data-drag="${sub ? `o.${String(path[0])}` : "o"}">
    <span class="grip">${svg(IC.grip)}</span>${state}<span class="tools">${stepTools(step, linked !== undefined, canSplit)}</span>
    <div class="tx">${number}<span>${text}</span>${stepChips(quest, step)}${note}${kids}</div>
    ${time}</li>`;
}
function objectiveList(quest, leaf, edit) {
    if (edit?.part === "objectives") {
        const rows = edit.items
            .map((step, i) => editRow(step, [i], "o", edit.ordered && i + 1) +
            (step.sub ?? [])
                .map((sub, j) => editRow(sub, [i, j], `o.${String(i)}`))
                .join(""))
            .join("");
        return `<ul class="obs o edit">${rows}${addRow("data-newitem")}</ul>`;
    }
    const rows = quest.objectives
        .map((step, i) => stepRow(quest, step, [i], leaf, quest.ordered === true && i + 1) +
        (step.sub ?? [])
            .map((sub, j) => stepRow(quest, sub, [i, j], leaf))
            .join(""))
        .join("");
    return `<ul class="obs o">${rows}${addRow('id="ob-new" data-addob')}</ul>`;
}
function criteriaList(quest, edit) {
    if (edit?.part === "criteria") {
        return `<ul class="obs c edit">${edit.items.map((criterion, i) => editRow(criterion, [i], "c")).join("")}${addRow("data-newitem")}</ul>`;
    }
    const rows = quest.criteria
        .map((criterion, i) => `<li class="ob ${criterion.met === true ? "done" : ""}" data-path="${String(i)}" data-drag="c"><span class="grip">${svg(IC.grip)}</span>
      <button class="st" data-crit="${String(i)}">${svg(criterion.met === true ? IC.crit_done : IC.crit_open)}</button><span class="tools"></span><div class="tx"><span>${esc(criterion.t)}</span></div><span></span></li>`)
        .join("");
    return `<ul class="obs c crit">${rows}
    ${addRow('id="crit-new" data-addcrit')}</ul>`;
}
function section(edit, part, label, body, tools = "") {
    return `<section class="sect"><div class="sect-h"><span class="label">${label}</span>
    <button class="ib pen ${edit?.part === part ? "on" : ""}" data-edit="${part}" title="${t("b_edit")}">${svg(IC.pencil)}</button>${tools}<i class="sect-rule"></i></div>${body}</section>`;
}
function titleRow(quest, edit) {
    const title = edit?.part === "title"
        ? `<input class="t-in" id="ed-title" value="${esc(quest.title)}">`
        : `<h1>${esc(quest.title)}</h1><button class="ib hov" data-edit="title" title="${t("b_edit")}">${svg(IC.pencil)}</button>`;
    return `<div class="title-row">
          ${trackButton(quest)}${starButton(quest)}
          ${title}
        </div>`;
}
function briefingBody(quest, edit) {
    if (edit?.part === "briefing") {
        return `<textarea class="ed-area" id="ed-brief" rows="4">${esc(quest.briefing)}</textarea>`;
    }
    return quest.briefing ? `<p class="prose">${esc(quest.briefing)}</p>` : "";
}
export function renderDetail() {
    const panel = $("#detail");
    const quest = data().quests.find((x) => relOf(x) === ui.sel);
    if (!quest) {
        panel.innerHTML = "";
        return;
    }
    const guild = guildView(guildOf(quest));
    const leaf = current(quest);
    const parent = parentOf(quest);
    const edit = editOf(quest);
    const partOf = parent
        ? `<span class="partof">${svg(IC.link)}<button ${goAttr(parent)}>${esc(parent.title)}</button></span>`
        : "";
    const clash = meta.get(quest)?.clash === true
        ? `<span class="clash">${t("id_clash")}</span>`
        : "";
    const briefing = briefingBody(quest, edit);
    const ordered = edit?.part === "objectives"
        ? `<button class="ib on" data-ordered title="${t(edit.ordered ? "ordered" : "unordered")}">${svg(edit.ordered ? IC.ol : IC.ul)}</button>`
        : "";
    panel.className = `detail frame c-${quest.type}`;
    panel.innerHTML = `
    <div class="head-row c-${quest.type}">
      <div class="hl">
        <div class="crumb"><button class="typeb" data-typeb>${svg(TYPE_IC[quest.type])}${t(`${quest.type}_q`)}</button><button class="guildb" data-guildb>${svg(emblem(guild))}${esc(guild.name)}</button>${partOf}${clash}</div>
        ${titleRow(quest, edit)}
      </div>
      ${completeButton(quest)}
      <button class="ib qmenu" data-qmenu>${svg(IC.dots)}</button>
    </div>
    ${quest.type === "activity" ? activityLine(quest) : deadlineTimeline(quest)}
    ${section(edit, "briefing", t("briefing"), briefing)}
    ${section(edit, "objectives", t("objectives"), objectiveList(quest, leaf, edit), ordered)}
    ${section(edit, "criteria", t("criteria"), criteriaList(quest, edit))}`;
    for (const [selector, kind] of [
        [".obs.o", "o"],
        [".obs.c", "c"],
    ]) {
        const box = find(`#detail ${selector}`);
        if (box) {
            dragSort(box, "li[data-drag]", ".grip", (from, to, group) => {
                moveItem(quest, kind, group, from, to);
            });
        }
    }
    const focusOn = edit?.focus ?? null;
    const target = focusOn === null ? null : document.querySelector(focusOn);
    if (target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement) {
        target.focus();
        target.setSelectionRange(target.value.length, target.value.length);
    }
    else if (target instanceof HTMLElement) {
        target.focus();
    }
}
