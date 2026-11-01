import { filled } from "../shared/records.js";
import { isOpen } from "../shared/types.js";
import { $, esc, svg } from "./dom.js";
import { guildOf, guildView } from "./guilds.js";
import { emblem, IC, iconNamed, TYPE_IC } from "./icons.js";
import { num, t } from "./i18n.js";
import { allQuests, goAttr, leaves, parentOf, relOf, visible, } from "./quests.js";
import { data, meta, ui } from "./state.js";
import { dateOrNull, dur, fmt, stamp } from "./time.js";
const ORDER = { start: 0, finish: 2 };
const TONES = {
    done: "var(--main)",
    failed: "var(--danger)",
    dropped: "var(--faint)",
    new: "var(--side)",
    log: "var(--dim)",
    start: "var(--text)",
    finish: "var(--text)",
};
function closingKey(closed) {
    if (closed.status === "abandoned") {
        return "ev_abandoned";
    }
    return meta.get(closed)?.by === "file" ? "ev_complete_file" : "ev_complete";
}
function journalTimeline(closed) {
    const events = [];
    if (filled(closed.created)) {
        events.push({
            at: closed.created,
            kind: "start",
            text: null,
            extra: "ev_accepted",
        });
    }
    for (const step of closed.objectives) {
        const parts = step.sub
            ? step.sub.map((sub) => ({ x: sub, label: `${step.t} → ${sub.t}` }))
            : [{ x: step, label: step.t }];
        for (const { x, label } of parts) {
            if (filled(x.added)) {
                events.push({ at: x.added, kind: "new", text: label });
            }
            if (filled(x.at) && x.s !== "open") {
                events.push({ at: x.at, kind: x.s, text: label, extra: x.note });
            }
        }
    }
    for (const entry of closed.log) {
        const head = entry.head ?? "";
        events.push(/^\d{4}-\d{2}-\d{2}( \d{1,2}:\d{2})?$/.test(head)
            ? { at: head, kind: "log", text: entry.text }
            : { at: null, kind: "log", text: entry.text, head: entry.head });
    }
    if (filled(closed.completed)) {
        events.push({
            at: closed.completed,
            kind: "finish",
            text: null,
            extra: closingKey(closed),
        });
    }
    const time = (event) => dateOrNull(event.at)?.getTime() ?? Infinity;
    return events.sort((a, b) => time(a) - time(b) || (ORDER[a.kind] ?? 1) - (ORDER[b.kind] ?? 1));
}
function timelineRow({ at, kind, text, extra, head }) {
    const tone = TONES[kind] ?? "";
    const label = kind === "start" || kind === "finish"
        ? ""
        : `<b style="color:${tone}">${t(kind === "log" ? "ev_log" : kind)}</b>`;
    const body = text === null ? t(extra ?? "undefined") : esc(text);
    const note = text !== null && filled(extra)
        ? `<span class="note"> — ${esc(extra)}</span>`
        : "";
    return `<li class="${kind}"><span style="color:${tone}">${svg(iconNamed(kind))}</span><time>${at === null ? esc(head) : stamp(dateOrNull(at))}${label}</time><p>${kind === "log" ? `“${body}”` : body}${note}</p></li>`;
}
function linkedList(closed) {
    const kids = allQuests().filter((quest) => quest.parent === closed.id);
    if (kids.length === 0) {
        return "";
    }
    const state = (kid) => {
        if (isOpen(kid.status)) {
            return t("active");
        }
        return kid.status === "complete"
            ? `${t("completed")} · ${t("grade_x", kid.grade ?? "undefined")}`
            : t("abandoned");
    };
    const rows = kids
        .map((kid) => `<li class="c-${kid.type}"><button ${goAttr(kid)}>${svg(IC.link)}${esc(kid.title)}</button><span>${state(kid)}</span></li>`)
        .join("");
    return `<div class="label">${t("linked_quests")}</div><ul class="links">${rows}</ul>`;
}
function gradeOf(closed) {
    if (closed.status !== "complete") {
        return t("abandoned").toUpperCase();
    }
    return closed.grade ?? "—";
}
function entryRow(closed) {
    const guild = guildView(guildOf(closed));
    const end = dateOrNull(closed.completed);
    const date = end
        ? fmt(end, { year: "numeric", month: "2-digit", day: "2-digit" })
        : "—";
    return `<div class="entry c-${closed.type} ${relOf(closed) === ui.jsel ? "sel" : ""}" data-j="${esc(relOf(closed))}">${svg(TYPE_IC[closed.type])}
      <time>${svg(emblem(guild))}${date} · ${esc(guild.name)}</time>
      <h3>${esc(closed.title)}</h3><span class="g ${closed.status === "complete" ? (closed.grade ?? "undefined") : "X"}">${gradeOf(closed)}</span></div>`;
}
const SMALL = "display:inline;font-size:14px;letter-spacing:0";
function stats(closed) {
    const end = dateOrNull(closed.completed);
    const created = dateOrNull(closed.created);
    const deadline = dateOrNull(closed.deadline);
    const steps = leaves(closed);
    const count = (state) => steps.filter((leaf) => leaf.o.s === state).length;
    const taken = end && created ? end.getTime() - created.getTime() : null;
    const delta = end && deadline ? deadline.getTime() - end.getTime() : null;
    const late = steps.filter(({ o }) => {
        const at = dateOrNull(o.at);
        const due = dateOrNull(o.due);
        return o.s === "done" && at !== null && due !== null && at > due;
    }).length;
    let deltaColor = "var(--dim)";
    if (delta !== null) {
        deltaColor = delta >= 0 ? "var(--act)" : "var(--danger)";
    }
    const lateNote = late
        ? `<span style="${SMALL};color:var(--side)"> · ${t("late", late)}</span>`
        : "";
    return `<div class="strip">
      <div><span>${t("grade_x", "").trim()}</span><b class="g ${closed.grade ?? "X"}">${closed.grade ?? "—"}</b></div>
      <div><span>${t("time_taken")}</span><b>${taken === null ? "—" : dur(taken)}</b></div>
      <div><span>${t("vs_deadline")}</span><b style="color:${deltaColor}">${delta === null ? "—" : t(delta >= 0 ? "early" : "late", dur(delta))}</b></div>
      <div><span>${t("obj_tally")}</span><b>${String(count("done"))}<span style="${SMALL};color:var(--danger)"> · ${String(count("failed"))}✕</span><span style="${SMALL};color:var(--faint)"> · ${String(count("dropped"))}–</span>${lateNote}</b></div>
      <div><span>XP</span><b style="color:var(--main)">${closed.awarded !== undefined && closed.awarded !== 0 ? `+${num(closed.awarded)}` : "—"}</b></div></div>`;
}
function prose(label, text, empty) {
    return `<div class="label">${t(label)}</div><p class="prose ${text ? "" : "empty"}" style="white-space:pre-line">${text ? esc(text) : t(empty)}</p>`;
}
export function renderJournal() {
    const entries = visible(data().journal).sort((a, b) => (b.completed ?? "").localeCompare(a.completed ?? ""));
    if (!entries.some((closed) => relOf(closed) === ui.jsel)) {
        const first = entries[0];
        ui.jsel = first ? relOf(first) : null;
    }
    $("#entries").innerHTML =
        `<div class="list-head"><h2>${t("tab_journal")}</h2><span>${t("entries", entries.length)}</span></div>${entries
            .map(entryRow)
            .join("")}`;
    const closed = data().journal.find((x) => relOf(x) === ui.jsel);
    if (!closed) {
        $("#page").innerHTML = "";
        return;
    }
    const guild = guildView(guildOf(closed));
    const parent = parentOf(closed);
    const partOf = filled(closed.parent)
        ? `//<span class="partof">${t("part_of")} <button ${goAttr(parent)}>${svg(IC.link)}${parent ? esc(parent.title) : "—"}</button></span>`
        : "";
    $("#page").innerHTML = `
    <div class="crumb c-${closed.type}"><b>${svg(TYPE_IC[closed.type])}${t(`${closed.type}_q`).toUpperCase()}</b>//<span style="display:inline-flex;gap:6px;align-items:center">${svg(emblem(guild))}${esc(guild.name)}</span>//<span>${t(closed.status === "complete" ? "completed" : "abandoned").toUpperCase()} ${stamp(dateOrNull(closed.completed))}</span>${partOf}</div>
    <h1>${esc(closed.title)}</h1>
    ${stats(closed)}
    ${prose("briefing", closed.briefing, "no_briefing")}
    ${prose("debrief", closed.debrief, "no_debrief")}
    <div class="label">${t("timeline")}</div>
    <ul class="timeline">${journalTimeline(closed).map(timelineRow).join("")}</ul>
    ${linkedList(closed)}
    <div class="actions" style="margin-top:22px"><button class="btn" data-reopenq="${esc(relOf(closed))}">${svg(IC.swap)}${t("reopen_q")}</button></div>
    <div class="file">${t("source")} <b>${esc(relOf(closed))}</b> · ${t("readable")}</div>`;
}
