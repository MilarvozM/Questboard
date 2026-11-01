import { filled } from "../shared/records.js";
import { QUEST_TYPES } from "../shared/types.js";
import { $, esc, field, findField, on, svg } from "./dom.js";
import { toast } from "./feedback.js";
import { openForm } from "./form.js";
import { guildList } from "./guilds.js";
import { emblem, IC, TYPE_IC } from "./icons.js";
import { t } from "./i18n.js";
import { keyMatch } from "./keys.js";
import { render } from "./render.js";
import { showAll } from "./search.js";
import { data, ui } from "./state.js";
import { addDays, dateOrNull, dayKey, normDate, stamp } from "./time.js";
import { persist, pushUndo, run } from "./undo.js";
export async function createQuest(fields) {
    const type = fields.type ?? "side";
    const quest = {
        title: fields.title,
        type,
        status: "active",
        briefing: fields.briefing ?? "",
        debrief: "",
        objectives: fields.objectives ?? [],
        criteria: fields.criteria ?? [],
        completions: [],
        skipped: [],
        log: [],
    };
    if (filled(fields.guild) && fields.guild !== "none") {
        quest.guild = fields.guild;
    }
    if (type === "activity") {
        quest.repeat = fields.repeat ?? { every: data().cfg.newActivityEveryDays };
    }
    else {
        if (filled(fields.due)) {
            quest.deadline = fields.due;
        }
        if (filled(fields.target)) {
            quest.target = fields.target;
        }
    }
    if (filled(fields.short)) {
        quest.short = fields.short;
    }
    const entry = pushUndo({ items: [], created: [] });
    toast(t("t_quest"), fields.title, "var(--main)", { kind: "new" });
    await run(async () => {
        const saved = await persist([quest], entry);
        showAll();
        ui.view = "log";
        ui.sel = saved?.rel ?? null;
        render();
    });
}
const TYPE_TOKENS = {
    m: "main",
    s: "side",
    a: "activity",
};
function dueToken(token, time) {
    const today = dayKey(new Date());
    let day;
    if (token.startsWith("+")) {
        day = addDays(today, Number.parseInt(token.slice(1), 10));
    }
    else {
        const parts = token.split("-");
        const year = Number(today.slice(0, 4));
        const [month = "", date = ""] = parts.slice(-2);
        day = normDate(parts.length === 3 ? token : `${String(year)}-${month}-${date}`);
        if (day !== null && parts.length === 2 && day < today) {
            day = normDate(`${String(year + 1)}-${month}-${date}`);
        }
    }
    if (day === null) {
        return null;
    }
    return time === undefined ? day : (normDate(`${day} ${time}`) ?? day);
}
export function parseCapture(text) {
    let type;
    let guild;
    let due;
    const title = text
        .replace(/(^|\s)@(\+\d+d|(?:\d{4}-)?\d{1,2}-\d{1,2})(?:\s+(\d{1,2}:\d{2}))?(?=\s|$)/, (all, space, token, time) => {
        const found = dueToken(token, time);
        if (found === null) {
            return all;
        }
        due = found;
        return space;
    })
        .replace(/(^|\s)!(main|side|act\w*)\b/i, (all, space, word) => {
        type = TYPE_TOKENS[word.charAt(0).toLowerCase()];
        return type === undefined ? all : space;
    })
        .replace(/(^|\s)#(\S+)/, (all, space, name) => {
        const wanted = name.toLowerCase();
        const found = guildList().find((x) => x.id.startsWith(wanted) || x.name.toLowerCase().startsWith(wanted));
        if (!found) {
            return all;
        }
        guild = found.id;
        return space;
    });
    return { title: title.replace(/\s+/g, " ").trim(), type, guild, due };
}
const choice = { type: null, guild: null, due: null };
export function captureValue() {
    const typed = parseCapture(findField("#cap")?.value ?? "");
    return {
        title: typed.title,
        type: typed.type ?? choice.type ?? "side",
        guild: typed.guild ?? choice.guild,
        due: typed.due ?? choice.due,
    };
}
function firstLetter(name) {
    const code = name.codePointAt(0);
    return code === undefined ? "?" : String.fromCodePoint(code);
}
export function renderCaptureOptions() {
    const value = captureValue();
    const due = dateOrNull(value.due);
    const types = QUEST_TYPES.map((type) => `<button class="ib c-${type} ${value.type === type ? "on" : ""}" data-ctype="${type}" title="${t(`${type}_q`)}">${svg(TYPE_IC[type])}</button>`).join("");
    const guilds = guildList()
        .map((guild) => `<button class="ib ${value.guild === guild.id ? "on" : ""}" data-cguild="${esc(guild.id)}" title="${esc(guild.name)}">${guild.emblem
        ? svg(emblem(guild))
        : `<b>${esc(firstLetter(guild.name))}</b>`}</button>`)
        .join("");
    $("#cap-opts").innerHTML =
        `${types}<i class="sep"></i>${guilds}<i class="sep"></i><button class="cdue ${due ? "on" : ""}" data-cdue title="${t("f_deadline")}">${svg(IC.clock)}${due ? `<span>${stamp(due)}</span>` : ""}</button>`;
}
export function closeCapbox() {
    $("#capbox").classList.remove("on");
    $("#fab").classList.remove("on");
}
export function openCapbox() {
    Object.assign(choice, { type: null, guild: null, due: null });
    $("#capbox").innerHTML =
        `<div class="cap-in">${svg(IC.plus)}<input id="cap" autocomplete="off" spellcheck="false">
    <button class="ib" data-capx title="${t("new_quest")}">${svg(IC.expand)}</button></div><div class="cap-opts" id="cap-opts"></div>`;
    $("#capbox").classList.add("on");
    $("#fab").classList.add("on");
    renderCaptureOptions();
    const input = field("#cap");
    input.addEventListener("input", renderCaptureOptions);
    on(input, "keydown", (event) => {
        if (event.isComposing) {
            return;
        }
        if (keyMatch(event, data().cfg.keys.close)) {
            event.stopPropagation();
            closeCapbox();
            return;
        }
        if (event.key !== "Enter") {
            return;
        }
        const value = captureValue();
        if (event.shiftKey) {
            closeCapbox();
            openForm(value);
            return;
        }
        if (!value.title) {
            return;
        }
        closeCapbox();
        void createQuest(value);
    });
    input.focus();
}
export function toggleCaptureType(type) {
    choice.type = choice.type === type ? null : type;
    renderCaptureOptions();
    field("#cap").focus();
}
export function toggleCaptureGuild(guild) {
    choice.guild = choice.guild === guild ? null : guild;
    renderCaptureOptions();
    field("#cap").focus();
}
export function captureDue() {
    return choice.due;
}
export function setCaptureDue(due) {
    choice.due = due || null;
    renderCaptureOptions();
    field("#cap").focus();
}
