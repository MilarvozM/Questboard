import { isConfig, isSettings, } from "../shared/config.js";
import { isGuild, isPlayer, isProblem, isQuest } from "../shared/guards.js";
import { isRecord, isStringArray } from "../shared/records.js";
export class ApiError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
function isStoredQuest(value) {
    return (isQuest(value) &&
        typeof value.id === "string" &&
        typeof value.title === "string");
}
function isEntry(value) {
    return (isRecord(value) &&
        typeof value["rel"] === "string" &&
        typeof value["version"] === "number" &&
        typeof value["clash"] === "boolean" &&
        (value["by"] === undefined ||
            value["by"] === "app" ||
            value["by"] === "file") &&
        isStoredQuest(value["quest"]));
}
function isPaths(value) {
    return (isRecord(value) &&
        typeof value["dataDir"] === "string" &&
        typeof value["config"] === "string" &&
        typeof value["start"] === "string");
}
function isStateReply(value) {
    return (isRecord(value) &&
        isConfig(value["config"]) &&
        isSettings(value["settings"]) &&
        Array.isArray(value["guilds"]) &&
        value["guilds"].every(isGuild) &&
        isPlayer(value["player"]) &&
        isStringArray(value["languages"]) &&
        isStringArray(value["styles"]) &&
        isPaths(value["paths"]) &&
        Array.isArray(value["quests"]) &&
        value["quests"].every(isEntry));
}
function expect(value, check, url) {
    if (!check(value)) {
        throw new ApiError(500, `${url} answered in an unexpected form`);
    }
    return value;
}
async function request(method, url, body) {
    const response = await fetch(url, {
        method,
        headers: body === undefined ? {} : { "Content-Type": "application/json" },
        body: body === undefined ? null : JSON.stringify(body),
    });
    const reply = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = isRecord(reply) ? reply["error"] : undefined;
        throw new ApiError(response.status, typeof error === "string" && error !== "" ? error : response.statusText);
    }
    return reply;
}
async function call(method, url, check, body) {
    return expect(await request(method, url, body), check, url);
}
export async function getState() {
    return call("GET", "/api/state", isStateReply);
}
export async function getStrings(lang) {
    const response = await fetch(`/locales/${lang}.json`);
    const strings = await response.json();
    return new Map(isRecord(strings)
        ? Object.entries(strings).filter((entry) => typeof entry[1] === "string")
        : []);
}
function isSaved(value) {
    return (isRecord(value) &&
        typeof value["rel"] === "string" &&
        typeof value["version"] === "number" &&
        isStoredQuest(value["quest"]));
}
export async function saveQuest(body) {
    return call("POST", "/api/save", isSaved, body);
}
function isSplit(value) {
    return (isRecord(value) &&
        typeof value["rel"] === "string" &&
        typeof value["child"] === "string");
}
export async function splitStep(file, at) {
    return call("POST", "/api/split", isSplit, { ...file, at });
}
export async function removeQuest(file) {
    await request("POST", "/api/remove", file);
}
export async function deleteQuest(file) {
    await request("POST", "/api/delete", file);
}
function isParsedEntry(value) {
    return (isRecord(value) &&
        isQuest(value["quest"]) &&
        Array.isArray(value["problems"]) &&
        value["problems"].every(isProblem) &&
        typeof value["ok"] === "boolean");
}
function isParsed(value) {
    return (isRecord(value) &&
        Array.isArray(value["quests"]) &&
        value["quests"].every(isParsedEntry));
}
export async function parseText(text) {
    return (await call("POST", "/api/parse", isParsed, { text })).quests;
}
function isImported(value) {
    return isRecord(value) && isStringArray(value["rels"]);
}
export async function importText(text) {
    return (await call("POST", "/api/import", isImported, { text })).rels;
}
export async function putGuilds(guilds) {
    await request("PUT", "/api/guilds", { guilds });
}
function isSettingsReply(value) {
    return isRecord(value) && isSettings(value["settings"]);
}
export async function putSettings(values) {
    return (await call("PUT", "/api/settings", isSettingsReply, values)).settings;
}
export async function postPlayer(mode, player) {
    await request("POST", "/api/player", { mode, player });
}
function isFileText(value) {
    return isRecord(value) && typeof value["text"] === "string";
}
export async function fileText(rel) {
    return (await call("GET", `/api/file?rel=${encodeURIComponent(rel)}`, isFileText)).text;
}
export async function openFile(rel) {
    await request("POST", "/api/open", { rel });
}
