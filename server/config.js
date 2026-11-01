import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isConfig } from "../shared/config.js";
import { isRecord } from "../shared/records.js";
import { APP_DIR, CONFIG_FILE } from "./paths.js";
export const warnOnConsole = (message) => {
    console.warn(message);
};
export function stripJsonc(text) {
    let out = "";
    let comma = -1;
    for (let i = 0; i < text.length; i++) {
        const c = text.charAt(i);
        const next = text.charAt(i + 1);
        if (c === "/" && next === "/") {
            while (i + 1 < text.length && text.charAt(i + 1) !== "\n") {
                i++;
            }
            continue;
        }
        if (c === "/" && next === "*") {
            const end = text.indexOf("*/", i + 2);
            i = end < 0 ? text.length : end + 1;
            continue;
        }
        if ((c === "}" || c === "]") && comma >= 0) {
            out = out.slice(0, comma) + out.slice(comma + 1);
        }
        if (c === '"') {
            let j = i + 1;
            while (j < text.length && text.charAt(j) !== '"') {
                j += text.charAt(j) === "\\" ? 2 : 1;
            }
            out += text.slice(i, j + 1);
            i = j;
            comma = -1;
            continue;
        }
        if (!/\s/.test(c)) {
            comma = c === "," ? out.length : -1;
        }
        out += c;
    }
    return out;
}
function readJsonc(file) {
    return JSON.parse(stripJsonc(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")));
}
const whole = (v) => Number.isInteger(v);
const positive = (v) => v > 0;
const positiveWhole = (v) => whole(v) && v > 0;
const oneOf = (...allowed) => (v) => allowed.includes(v);
const shippedFile = (folder, extension) => (v) => /^[\w-]+$/.test(v) &&
    fs.existsSync(path.join(APP_DIR, folder, v + extension));
const NUMBER_RULES = {
    port: (v) => whole(v) && v > 0 && v < 65536,
    sLineAt: (v) => v > 0 && v <= 1,
    levelXpStep: positive,
    favoritesMax: whole,
    urgentDays: positive,
    shortNameMax: positiveWhole,
    fileSlugMax: positiveWhole,
    fileIdLength: positiveWhole,
    undoDepth: whole,
    maxRequestMB: positive,
    "scan.pollSeconds": positive,
    renameTries: positiveWhole,
    redrawSeconds: positive,
    "calendarChips.perDay": positiveWhole,
    "calendarChips.crowded": positiveWhole,
    "promptExampleDays.deadline": whole,
    "promptExampleDays.due": whole,
    newActivityEveryDays: positiveWhole,
};
const STRING_RULES = {
    dataDir: (v) => v.trim() !== "",
    "defaults.language": shippedFile("locales", ".json"),
    "defaults.style": shippedFile("styles", ".css"),
    "defaults.weekStart": oneOf("sunday", "monday"),
    "defaults.calendarMode": oneOf("quests", "steps", "everything"),
    "defaults.listSort": oneOf("due", "deadline", "created", "title"),
};
function sameKind(value, fallback) {
    if (Array.isArray(fallback)) {
        return (Array.isArray(value) &&
            value.every((item) => typeof item === typeof fallback[0]));
    }
    return typeof value === typeof fallback && !Array.isArray(value);
}
function acceptable(key, value, fallback) {
    if (value === null || !sameKind(value, fallback)) {
        return false;
    }
    if (typeof value === "number") {
        return (Number.isFinite(value) &&
            value >= 0 &&
            (NUMBER_RULES[key]?.(value) ?? true));
    }
    if (typeof value === "string") {
        return STRING_RULES[key]?.(value) ?? true;
    }
    return true;
}
export function mergeConfig(base, over, file, warn, prefix = "") {
    const out = { ...base };
    for (const [k, v] of Object.entries(over)) {
        const key = prefix + k;
        if (!Object.hasOwn(base, k)) {
            warn(`${file}: unknown key "${key}" is ignored.`);
            continue;
        }
        const fallback = base[k];
        if (isRecord(fallback)) {
            if (isRecord(v)) {
                out[k] = mergeConfig(fallback, v, file, warn, `${key}.`);
            }
            else {
                warn(`${file}: "${key}" must be a { … } group of keys; using the defaults.`);
            }
            continue;
        }
        if (acceptable(key, v, fallback)) {
            out[k] = v;
        }
        else {
            warn(`${file}: "${key}" can't be ${JSON.stringify(v)}; using the default ${JSON.stringify(fallback)}.`);
        }
    }
    return out;
}
function asConfig(value) {
    if (!isConfig(value)) {
        throw new Error(`${path.join(APP_DIR, "config.default.jsonc")} is missing settings; download Questboard again.`);
    }
    return value;
}
export function loadConfig(warn = warnOnConsole) {
    const defaults = asConfig(readJsonc(path.join(APP_DIR, "config.default.jsonc")));
    if (!fs.existsSync(CONFIG_FILE)) {
        return defaults;
    }
    let user;
    try {
        user = readJsonc(CONFIG_FILE);
    }
    catch (error) {
        warn(`config.jsonc: not valid JSONC (${messageOf(error)}); using all defaults.`);
        return defaults;
    }
    if (!isRecord(user)) {
        warn("config.jsonc: must be one { … } group of keys; using all defaults.");
        return defaults;
    }
    return asConfig(mergeConfig(defaults, user, "config.jsonc", warn));
}
export function resolveDataDir(dir) {
    return path.resolve(APP_DIR, dir.replace(/^~(?=$|[\\/])/, os.homedir()));
}
export function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
