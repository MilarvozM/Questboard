import { $, esc, find, svg } from "./dom.js";
import { dragSort } from "./drag.js";
import { moveGuild } from "./guild-actions.js";
import { guildList, guildOf, guildView } from "./guilds.js";
import { emblem, IC, TYPE_IC } from "./icons.js";
import { t } from "./i18n.js";
import { current, dueOf, favs, focusQuest, msUntil, relOf } from "./quests.js";
import { data, ui } from "./state.js";
import { countdown, red } from "./time.js";
import { QUEST_TYPES } from "../shared/types.js";
function count(n) {
    return String(n).padStart(2, "0");
}
function section(key, name, tools = "") {
    return `<div class="sec ${ui.fold[key] ? "shut" : ""}"><button class="fold" data-fold="${key}">${svg(IC.fold)}</button>${name}${tools}</div>`;
}
function body(key, html) {
    return ui.fold[key] ? "" : html;
}
function favorites() {
    const list = favs();
    const shown = focusQuest();
    const max = data().cfg.favoritesMax;
    const over = list.length > max
        ? `<span class="cnt over">${String(list.length)} / ${String(max)}</span>`
        : "";
    const rows = list
        .map((quest) => {
        const ms = msUntil(dueOf(quest));
        const leaf = current(quest);
        return `<button class="fav c-${quest.type} ${quest === shown ? "on" : ""}" data-open="${esc(relOf(quest))}">${svg(IC.star_f)}<span class="nm">${esc(quest.title)}</span>
        <span class="cd ${red(ms) ? "red" : ""}">${ms === null ? "" : countdown(ms)}</span><span class="o1">${leaf ? esc(leaf.o.t) : ""}</span></button>`;
    })
        .join("");
    return (section("favorites", `<button class="sec-n ${ui.favView ? "on" : ""}" data-favview>${t("favorites")}${over}</button>`) + body("favorites", rows));
}
export function renderRail() {
    const source = ui.view === "journal" ? data().journal : data().quests;
    const byGuild = source.filter((quest) => ui.guild === null || guildOf(quest) === ui.guild);
    const byType = source.filter((quest) => ui.type === null || quest.type === ui.type);
    const held = (id) => source.some((quest) => guildOf(quest) === id);
    const guilds = [
        ...guildList(),
        ...data()
            .guilds.filter((guild) => guild.hidden === true && held(guild.id))
            .map((guild) => guildView(guild.id)),
        ...(held("none") ? [guildView("none")] : []),
    ];
    const types = QUEST_TYPES.map((type) => {
        const n = byGuild.filter((quest) => quest.type === type).length;
        return `<button class="fbtn c-${type} ${ui.type === type ? "on" : ""} ${n ? "" : "zero"}" data-type="${type}">${svg(TYPE_IC[type])}<span class="nm">${t(type)}</span><span class="n">${count(n)}</span></button>`;
    }).join("");
    const guildRows = guilds
        .map((guild) => {
        const n = byType.filter((quest) => guildOf(quest) === guild.id).length;
        const own = guild.id !== "none" && guild.hidden !== true;
        const on = ui.guild === guild.id ? "on" : "";
        return `<div class="grow ${own ? "own" : ""} ${on}" data-gid="${esc(guild.id)}">${own ? `<span class="grip">${svg(IC.grip)}</span>` : "<span></span>"}
        <button class="fbtn guild ${on} ${n ? "" : "zero"}" data-guild="${esc(guild.id)}">${svg(emblem(guild))}<span class="nm">${esc(guild.name)}</span></button>
        ${own ? `<button class="ib hov gm" data-gmenu="${esc(guild.id)}" title="${t("b_edit")}">${svg(IC.pencil)}</button>` : "<span></span>"}
        <button class="gcount ${n ? "" : "zero"}" data-guild="${esc(guild.id)}"><span class="n">${count(n)}</span></button></div>`;
    })
        .join("");
    $("#rail").innerHTML =
        favorites() +
            section("types", `<button class="sec-n" data-fold="types">${t("type")}</button>`) +
            body("types", types) +
            section("guilds", `<button class="sec-n" data-fold="guilds">${t("guilds")}</button>`, `<button class="ib hov" data-gadd title="${t("g_add")}">${svg(IC.plus)}</button>`) +
            body("guilds", `<div class="glist">${guildRows}</div>`);
    const list = find("#rail .glist");
    if (list) {
        dragSort(list, ".grow.own", ".grip", (from, to) => {
            moveGuild(from, to);
        });
    }
}
