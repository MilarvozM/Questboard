import { filled } from "../shared/records.js";
import { QUEST_TYPES } from "../shared/types.js";
import { openAi } from "./ai.js";
import { createQuest } from "./capture.js";
import { $, esc, field, findField, svg } from "./dom.js";
import { guildList, guildView } from "./guilds.js";
import { emblem, IC, TYPE_IC } from "./icons.js";
import { t } from "./i18n.js";
import { keyLabel } from "./keys.js";
import { closeOverlays } from "./player.js";
import { repeatLabel } from "./schedule.js";
import { data, ui } from "./state.js";
import { dateOrNull, stamp } from "./time.js";
export function renderWhen() {
    const form = ui.form;
    if (!form) {
        return;
    }
    const shown = (value) => filled(value) ? stamp(dateOrNull(value)) : "—";
    $("#f-when").innerHTML =
        form.type === "activity"
            ? `<span>${t("repeats")}</span><button class="dbtn" data-frepeat>${svg(IC.swap)}<b>${repeatLabel(form.repeat)}</b></button>`
            : `<div class="two"><div><span>${t("f_deadline")}</span><button class="dbtn" data-fdate="due">${svg(IC.clock)}<b>${shown(form.due)}</b></button></div>
        <div><span>${t("f_target")}</span><button class="dbtn" data-fdate="target"><i>S</i><b>${shown(form.target)}</b></button></div></div>`;
}
export function openForm(prefill = {}, tab = "write") {
    const title = prefill.title ?? "";
    const type = prefill.type ?? "side";
    const form = {
        type,
        guild: filled(prefill.guild) ? prefill.guild : "none",
        due: filled(prefill.due) ? prefill.due : null,
        target: null,
        repeat: { every: data().cfg.newActivityEveryDays },
        prefill,
    };
    ui.form = form;
    const head = `<h2>+ ${t("new_quest")}<kbd>${keyLabel(data().cfg.keys.close)}</kbd></h2>
    <div class="dtabs">${["write", "ai"].map((name) => `<button class="${name === tab ? "on" : ""}" data-dtab="${name}">${t(`tab_${name}`)}</button>`).join("")}</div>`;
    const drawer = $("#drawer");
    drawer.classList.toggle("wide", tab === "ai");
    drawer.classList.add("on");
    $("#drawer-back").classList.add("on");
    if (tab === "ai") {
        openAi(head);
        return;
    }
    const types = QUEST_TYPES.map((name) => `<button class="c-${name} ${name === type ? "on" : ""}" data-ftype="${name}">${svg(TYPE_IC[name])}<span>${t(name)}</span><small>${String(data().cfg.xp[name])} XP</small></button>`).join("");
    const guilds = [...guildList(), guildView("none")]
        .map((guild) => `<button class="${guild.id === form.guild ? "on" : ""}" data-fguild="${esc(guild.id)}">${svg(emblem(guild))}${esc(guild.name)}</button>`)
        .join("");
    drawer.innerHTML = `${head}
    <div class="fld"><input class="big" id="f-title" value="${esc(title)}"></div>
    <div class="fld"><div class="seg3">${types}</div></div>
    <div class="fld"><div class="gg">${guilds}</div></div>
    <div class="fld" id="f-when"></div>
    <label class="fld"><span>${t("f_short")}</span><input id="f-short" maxlength="${String(data().cfg.shortNameMax)}"></label>
    <label class="fld"><span>${t("f_briefing")}</span><textarea id="f-brief" rows="2"></textarea></label>
    <label class="fld"><span>${t("f_obj")}</span><textarea id="f-obj" rows="5" placeholder="${esc(t("obj_ph"))}"></textarea></label>
    <label class="fld"><span>${t("f_crit")}</span><textarea id="f-crit" rows="3"></textarea></label>
    <p class="err" id="f-err"></p>
    <div class="actions"><button class="btn primary" data-fsubmit>${t("f_accept")}</button><button class="btn" data-fclose>${t("f_cancel")}</button></div>`;
    renderWhen();
    setTimeout(() => {
        findField("#f-title")?.focus();
    }, 0);
}
function objectivesFrom(text) {
    const objectives = [];
    for (const line of text.split("\n")) {
        if (!line.trim()) {
            continue;
        }
        const step = { t: line.trim(), s: "open" };
        const parent = objectives.at(-1);
        if (/^(\s{2,}|\t)/.test(line) && parent) {
            (parent.sub ??= []).push(step);
        }
        else {
            objectives.push(step);
        }
    }
    return objectives;
}
export function submitForm() {
    const form = ui.form;
    if (!form) {
        return;
    }
    const title = field("#f-title").value.trim();
    const criteria = field("#f-crit")
        .value.split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "");
    if (!title) {
        $("#f-err").textContent = t("f_need_title");
        return;
    }
    if (form.type === "main" && criteria.length === 0) {
        $("#f-err").textContent = t("f_need_crit");
        return;
    }
    void createQuest({
        title,
        type: form.type,
        guild: form.guild,
        due: form.due,
        target: form.target,
        repeat: form.repeat,
        short: field("#f-short").value.trim(),
        briefing: field("#f-brief").value.trim(),
        objectives: objectivesFrom(field("#f-obj").value),
        criteria: criteria.map((text) => ({ t: text })),
    });
    closeOverlays();
}
