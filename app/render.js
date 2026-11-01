import { closePop, renderCal } from "./calendar.js";
import { renderDetail } from "./detail.js";
import { $, all, field, find, on, svg } from "./dom.js";
import { renderFocus } from "./focus.js";
import { IC, iconNamed } from "./icons.js";
import { num, t } from "./i18n.js";
import { renderJournal } from "./journal.js";
import { keyLabel, keyMatch } from "./keys.js";
import { renderList } from "./list.js";
import { closePick } from "./pick.js";
import { renderPlayer } from "./player.js";
import { level } from "./quests.js";
import { renderRail } from "./rail.js";
import { renderSettings } from "./settings.js";
import { clock, data, ui } from "./state.js";
import { fmt, noonOf, pad } from "./time.js";
const VIEWS = ["log", "cal", "journal"];
function keyBinding(name) {
    return (Object.entries(data().cfg.keys).find(([key]) => key === name)?.[1] ?? "");
}
export function renderRange() {
    const day = (key) => fmt(noonOf(key), { month: "short", day: "numeric" });
    const from = ui.dueFrom;
    const to = ui.dueTo !== null && ui.dueTo !== from ? ui.dueTo : null;
    $("#srange").innerHTML =
        from === null
            ? `<button class="ib" data-range title="${t("due_range")}">${svg(IC.cal)}</button>`
            : `<button class="range" data-range>${day(from)}${to === null ? "" : ` – ${day(to)}`}</button><button class="ib" data-range-x>${svg(IC.x)}</button>`;
    $("#search").classList.toggle("on", ui.search !== "" || from !== null);
}
export function initSearch() {
    $("#search").innerHTML =
        `${svg(IC.search)}<input id="sq" autocomplete="off" spellcheck="false"><span id="srange"></span>`;
    const search = field("#sq");
    search.addEventListener("input", () => {
        ui.search = search.value;
        render();
    });
    on(search, "keydown", (event) => {
        if (!event.isComposing && keyMatch(event, data().cfg.keys.close)) {
            ui.search = "";
            search.value = "";
            search.blur();
            render();
        }
    });
}
function renderStatic() {
    const root = document.documentElement;
    root.lang = t("locale").startsWith("zh") ? "zh-CN" : ui.lang;
    root.dataset["theme"] = ui.theme;
    if ($("#settings").classList.contains("on")) {
        renderSettings();
    }
    const button = (selector, icon, title) => {
        const element = $(selector);
        element.innerHTML = svg(icon);
        element.title = title;
    };
    button("#skin", IC.skin, t("style"));
    button("#gear", IC.gear, t("settings"));
    button("#fab", iconNamed(`fab_${ui.theme}`) || IC.fab_terminal, t("new_quest"));
    renderRange();
    for (const element of all("[data-t]")) {
        element.textContent = t(element.dataset["t"] ?? "");
    }
    for (const element of all("[data-key]")) {
        element.textContent = keyLabel(keyBinding(element.dataset["key"] ?? ""));
    }
    $("#tabs").innerHTML = VIEWS.map((view) => `<button data-v="${view}" class="${ui.view === view ? "on" : ""}">${t(`tab_${view}`)}</button>`).join("");
    for (const view of all(".view")) {
        view.classList.toggle("on", view.id === `v-${ui.view}`);
    }
    const { lv, xp, need } = level();
    $("#lv").textContent = pad(lv);
    $("#xp-n").textContent = `${num(xp)} / ${num(need)}`;
    $("#xp-bar").style.width = `${String(Math.min(100, (xp / need) * 100))}%`;
    $("#lost").textContent = t("server_lost", data().paths.start);
}
export function render() {
    clock.now = new Date();
    ui.stale = false;
    const keep = document.activeElement?.id;
    closePop();
    closePick();
    renderStatic();
    renderFocus();
    renderRail();
    if (ui.view === "log") {
        renderList();
        renderDetail();
    }
    if (ui.view === "cal") {
        renderCal();
    }
    if (ui.view === "journal") {
        renderJournal();
    }
    if ($("#pview").classList.contains("on") &&
        find("#imp")?.classList.contains("on") !== true) {
        renderPlayer();
    }
    if (keep !== undefined &&
        keep !== "" &&
        document.activeElement?.id !== keep) {
        document.getElementById(keep)?.focus();
    }
}
