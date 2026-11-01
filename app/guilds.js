import { t } from "./i18n.js";
import { data, langs } from "./state.js";
export function guildView(id) {
    const guild = data().guilds.find((x) => x.id === id);
    if (!guild) {
        return { id: "none", name: t("unassigned"), motto: "", emblem: "none" };
    }
    const own = (prefix) => langs.get("en")?.has(prefix + id) === true ? t(prefix + id) : "";
    return {
        ...guild,
        name: guild.name ?? (own("g_") || id),
        motto: guild.motto ?? own("gm_"),
    };
}
export function guildOf(quest) {
    const id = quest.guild;
    return id !== undefined && data().guilds.some((g) => g.id === id)
        ? id
        : "none";
}
export function guildList() {
    return data()
        .guilds.filter((g) => g.hidden !== true)
        .map((g) => guildView(g.id));
}
