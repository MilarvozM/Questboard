let current = null;
export function data() {
    if (current === null) {
        throw new Error("The page has not loaded its state yet");
    }
    return current;
}
export function isLoaded() {
    return current !== null;
}
export function setData(next) {
    current = next;
}
export const clock = { now: new Date() };
export const langs = new Map();
export const emblems = { pairs: [], singles: [], icons: {} };
export const meta = new WeakMap();
export const ui = {
    lang: "en",
    view: "log",
    type: null,
    guild: null,
    favView: false,
    search: "",
    dueFrom: null,
    dueTo: null,
    sel: null,
    jsel: null,
    switchOpen: false,
    theme: "terminal",
    sound: true,
    calMode: "quests",
    weekStart: 0,
    pby: "type",
    sort: "due",
    group: true,
    fold: { favorites: false, types: false, guilds: false },
    edit: null,
    month: "",
    calDays: new Map(),
    stale: false,
    md: null,
    form: null,
    aiLang: null,
    aiUpdate: null,
    pimport: undefined,
    done: null,
};
