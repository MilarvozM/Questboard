import { putGuilds } from "./api.js";
import { cue } from "./feedback.js";
import { guildView } from "./guilds.js";
import { emblem, IC, NO_EMBLEM } from "./icons.js";
import { t } from "./i18n.js";
import { ask, menu } from "./pick.js";
import { pickIcon } from "./pickers.js";
import { data, ui } from "./state.js";
import { reload, run } from "./undo.js";
function saveGuilds(list, sound = "edit") {
    cue(sound);
    void run(async () => {
        await putGuilds(list);
        await reload();
    });
}
export function moveGuild(from, to) {
    const guilds = data().guilds;
    const shown = guilds.filter((guild) => guild.hidden !== true);
    const [moved] = shown.splice(from, 1);
    if (!moved) {
        return;
    }
    shown.splice(to, 0, moved);
    let next = 0;
    saveGuilds(guilds.map((guild) => guild.hidden === true ? guild : (shown[next++] ?? guild)));
}
function updated(id, change) {
    return data().guilds.map((guild) => guild.id === id ? { ...guild, ...change } : guild);
}
export function guildMenu(id, anchor) {
    const raw = data().guilds.find((guild) => guild.id === id);
    if (!raw) {
        return;
    }
    menu(anchor, [
        {
            icon: IC.pencil,
            label: t("g_rename"),
            act: () => {
                ask(anchor, { value: guildView(id).name }, (name) => {
                    saveGuilds(updated(id, { name }));
                });
            },
        },
        {
            icon: emblem(raw) || NO_EMBLEM,
            label: t("g_icon"),
            act: () => {
                pickIcon(anchor, raw.emblem, (picked) => {
                    saveGuilds(updated(id, { emblem: picked }));
                });
            },
        },
        "sep",
        {
            icon: IC.trash,
            label: t("g_delete"),
            cls: "danger",
            confirm: t("g_delete_q"),
            act: () => {
                saveGuilds(data().guilds.filter((guild) => guild.id !== id), "delete");
                if (ui.guild === id) {
                    ui.guild = null;
                }
            },
        },
    ]);
}
export function addGuild(anchor) {
    ask(anchor, { icon: IC.plus }, (name) => {
        const slug = name
            .toLowerCase()
            .normalize("NFKD")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 24);
        let id = slug && slug !== "none"
            ? slug
            : `g-${Math.random().toString(36).slice(2, 7)}`;
        const taken = new Set(data().guilds.map((guild) => guild.id));
        while (taken.has(id)) {
            id += "-2";
        }
        saveGuilds([...data().guilds, { id, name, emblem: "" }], "new");
    });
}
