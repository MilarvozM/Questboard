import { act } from "./actions.js";
import { $, esc, field, find, svg } from "./dom.js";
import { cue, hideToast, toast } from "./feedback.js";
import { guildOf, guildView } from "./guilds.js";
import { TYPE_IC } from "./icons.js";
import { num, t } from "./i18n.js";
import { keyLabel } from "./keys.js";
import { byRel, leaves, level, xpOf } from "./quests.js";
import { data, ui } from "./state.js";
import { dateOrNull, dur, pad } from "./time.js";
function deadlineResult(quest) {
    const end = dateOrNull(quest.completed);
    const deadline = dateOrNull(quest.deadline);
    if (!end || !deadline) {
        return `<b class="good">—</b>`;
    }
    const delta = deadline.getTime() - end.getTime();
    return `<b class="${delta >= 0 ? "good" : ""}">${t(delta >= 0 ? "early" : "late", dur(delta))}</b>`;
}
function stats(quest) {
    const steps = leaves(quest);
    const count = (state) => String(steps.filter((leaf) => leaf.o.s === state).length);
    const late = steps.filter(({ o }) => {
        const at = dateOrNull(o.at);
        const due = dateOrNull(o.due);
        return o.s === "done" && at !== null && due !== null && at > due;
    }).length;
    const end = dateOrNull(quest.completed);
    const created = dateOrNull(quest.created);
    const taken = end && created ? end.getTime() - created.getTime() : Number.NaN;
    const grade = quest.grade ?? "A";
    return `<div class="stats">
        <div class="stat"><span>${t("time_taken")}</span><b>${dur(taken)}</b></div>
        <div class="stat"><span>${t("vs_deadline")}</span>${deadlineResult(quest)}</div>
        <div class="stat"><span>${t("obj_tally")}</span><b>${count("done")} <i>· ${count("failed")} ${t("failed")} · ${count("dropped")} ${t("dropped")}${late ? ` · ${t("late", late)}` : ""}</i></b></div>
        <div class="stat"><span>${t("crit_tally")}</span><b>${String(quest.criteria.filter((c) => c.met === true).length)} / ${String(quest.criteria.length)}</b></div>
        <div class="stat"><span>${t("log_entries")}</span><b>${String(quest.log.length)}</b></div>
        <div class="stat"><span>${t("xp_earned")}</span><b style="color:var(--main)">${String(xpOf(quest))} × ${String(data().cfg.gradeMultiplier[grade])}</b></div></div>`;
}
export function showDone(rel, before) {
    const quest = byRel(rel);
    if (!quest) {
        return;
    }
    ui.done = rel;
    hideToast();
    const after = level();
    const guild = guildView(guildOf(quest));
    const up = after.lv > before.lv;
    const grade = quest.grade ?? "undefined";
    const keys = data().cfg.keys;
    const panel = $("#done");
    panel.innerHTML = `<div class="results-inner">
    <div class="kicker">${svg(TYPE_IC[quest.type])}${t(`${quest.type}_q`)} // ${esc(guild.name)}</div>
    <h1>${t("quest_complete")}</h1><div class="qt">${esc(quest.title)}</div>
    <div class="rule"></div>
    <div class="result">
      <div class="grade"><div class="hexclip"><strong>${grade}</strong></div><p>${t("grade_x", grade)} · ${t(grade === "S" ? "exceptional" : `gd_${grade}`)}</p></div>
      <div>${stats(quest)}
        <div class="xpgain"><div class="row"><span>XP</span><b>+${num(quest.awarded ?? 0)} XP</b></div><div class="bar"><i id="xpfill"></i></div>
          <div class="row" style="margin-top:8px"><span>LV ${pad(before.lv)} · ${num(before.xp)}</span><span>${up ? `LV ${pad(after.lv)} · ` : ""}${num(after.xp)} / ${num(after.need)}</span></div></div></div>
    </div>
    ${up ? `<div class="lvup" id="lvup"><b>${t("level_up")}</b><span>LV ${pad(before.lv)} → LV ${pad(after.lv)}</span></div>` : ""}
    <textarea class="debrief" id="debrief" placeholder="${t("debrief_ph")}">${esc(quest.debrief)}</textarea>
    <div class="actions">
      <button class="btn primary" data-close><kbd>${keyLabel(keys.close)}</kbd><span id="close-l">${closeLabel(quest)}</span></button>
      <button class="btn" data-goj><kbd>${keyLabel(keys.openJournal)}</kbd>${t("open_journal")}</button></div></div>`;
    field("#debrief").addEventListener("input", () => {
        $("#close-l").textContent = closeLabel(quest);
    });
    panel.classList.add("on");
    cue("quest");
    requestAnimationFrame(() => requestAnimationFrame(() => {
        $("#xpfill").style.width =
            `${String(up ? 100 : (after.xp / after.need) * 100)}%`;
        find("#lvup")?.classList.add("on");
    }));
}
function typedDebrief(quest) {
    const text = find("#debrief") ? field("#debrief").value.trim() : "";
    return text === quest.debrief.trim() ? null : text;
}
function closeLabel(quest) {
    return t(typedDebrief(quest) === null ? "close" : "b_save_close");
}
function saveDebrief() {
    const quest = ui.done === null ? undefined : byRel(ui.done);
    const text = quest ? typedDebrief(quest) : null;
    if (!quest || text === null) {
        return;
    }
    void act([quest], () => {
        quest.debrief = text;
    });
    toast(t("t_debrief"), quest.title, "var(--main)", {
        kind: "write",
        q: quest,
    });
}
export function closeDone() {
    const panel = $("#done");
    if (!panel.classList.contains("on")) {
        return;
    }
    saveDebrief();
    panel.classList.remove("on");
}
