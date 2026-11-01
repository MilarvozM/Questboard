import { isRecord, isStringArray } from "./records.js";
const SETTINGS_SCHEMA = {
    language: "string",
    style: "string",
    sound: "boolean",
    weekStart: "string",
    calendarMode: "string",
    listSort: "string",
    listGroup: "boolean",
    fold: { favorites: "boolean", types: "boolean", guilds: "boolean" },
};
const KEYS_SCHEMA = {
    capture: "string",
    search: "string",
    newQuest: "string",
    viewLog: "string",
    viewCalendar: "string",
    viewJournal: "string",
    track: "string",
    favorite: "string",
    markdown: "string",
    complete: "string",
    logEntry: "string",
    undo: "string",
    close: "string",
    debrief: "string",
    openJournal: "string",
};
export const CONFIG_SCHEMA = {
    port: "number",
    openBrowser: "boolean",
    dataDir: "string",
    maxRequestMB: "number",
    scan: {
        skipFolderPrefixes: "string[]",
        watchDebounceMs: "number",
        pollSeconds: "number",
    },
    renameTries: "number",
    renameRetryMs: "number",
    xp: { main: "number", side: "number", activity: "number" },
    gradeMultiplier: { S: "number", A: "number", B: "number", C: "number" },
    sLineAt: "number",
    gradeBGraceHours: "number",
    levelXpStep: "number",
    favoritesMax: "number",
    completeOnAllCriteria: "boolean",
    urgentDays: "number",
    countdownRedHours: "number",
    shortNameMax: "number",
    fileSlugMax: "number",
    fileIdLength: "number",
    defaults: SETTINGS_SCHEMA,
    muteWithReducedMotion: "boolean",
    undoDepth: "number",
    bannerMs: "number",
    bannerCompleteMs: "number",
    redrawSeconds: "number",
    reloadDelayMs: "number",
    importPreviewDelayMs: "number",
    calendarChips: {
        perDay: "number",
        crowded: "number",
        crowdedBelowPx: "number",
    },
    promptExampleDays: { deadline: "number", due: "number" },
    newActivityEveryDays: "number",
    keys: KEYS_SCHEMA,
};
function matchesLeaf(value, leaf) {
    return leaf === "string[]" ? isStringArray(value) : typeof value === leaf;
}
export function matchesSchema(value, schema) {
    return (isRecord(value) &&
        Object.entries(schema).every(([key, part]) => typeof part === "string"
            ? matchesLeaf(value[key], part)
            : matchesSchema(value[key], part)));
}
export function isConfig(value) {
    return matchesSchema(value, CONFIG_SCHEMA);
}
export function isSettings(value) {
    return matchesSchema(value, SETTINGS_SCHEMA);
}
