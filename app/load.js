import { isOpen } from "../shared/types.js";
import { getState, getStrings } from "./api.js";
import { langs, meta, setData, ui } from "./state.js";
export function applySettings(settings) {
    Object.assign(ui, {
        lang: settings.language,
        theme: settings.style,
        sound: settings.sound,
        weekStart: settings.weekStart === "monday" ? 1 : 0,
        calMode: settings.calendarMode,
        sort: settings.listSort,
        group: settings.listGroup,
        fold: settings.fold,
    });
}
export async function load() {
    const state = await getState();
    for (const lang of state.languages) {
        if (!langs.has(lang)) {
            langs.set(lang, await getStrings(lang));
        }
    }
    applySettings(state.settings);
    const quests = [];
    const journal = [];
    for (const { rel, version, clash, by, quest } of state.quests) {
        meta.set(quest, { rel, version, clash, by });
        (isOpen(quest.status) ? quests : journal).push(quest);
    }
    setData({
        cfg: state.config,
        paths: state.paths,
        guilds: state.guilds,
        player: state.player,
        styles: state.styles,
        quests,
        journal,
    });
}
