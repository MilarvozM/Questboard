import fs from "node:fs";
import path from "node:path";
import { isRecord } from "../shared/records.js";
import { SECTION_KINDS } from "../shared/types.js";
import { APP_DIR } from "./paths.js";
let cachedLocales = null;
let cachedHeadings = null;
function readStrings(file) {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const strings = new Map();
    if (isRecord(parsed)) {
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === "string") {
                strings.set(key, value);
            }
        }
    }
    return strings;
}
export function locales() {
    if (cachedLocales === null) {
        const dir = path.join(APP_DIR, "locales");
        cachedLocales = new Map(fs
            .readdirSync(dir)
            .filter((file) => file.endsWith(".json"))
            .map((file) => [file.slice(0, -5), readStrings(path.join(dir, file))]));
    }
    return cachedLocales;
}
export function translate(lang, key) {
    return locales().get(lang)?.get(key) ?? locales().get("en")?.get(key) ?? key;
}
function headingNames() {
    if (cachedHeadings === null) {
        const headings = new Map();
        for (const [lang, strings] of locales()) {
            for (const kind of SECTION_KINDS) {
                const heading = strings.get(kind);
                if (heading !== undefined && heading !== "") {
                    const byLang = headings.get(kind) ?? new Map();
                    byLang.set(lang, heading);
                    headings.set(kind, byLang);
                }
            }
        }
        cachedHeadings = headings;
    }
    return cachedHeadings;
}
export function headingFor(kind, lang) {
    const names = headingNames().get(kind);
    return names?.get(lang) ?? names?.get("en") ?? kind;
}
export function sectionKind(name) {
    const wanted = name.trim().toLowerCase();
    const named = SECTION_KINDS.find((kind) => [...(headingNames().get(kind)?.values() ?? [])].some((heading) => heading.toLowerCase() === wanted));
    return named ?? (/criteria|条件/.test(wanted) ? "criteria" : null);
}
export function isNotTaken(note) {
    return [...locales().values()].some((strings) => strings.get("not_taken") === note);
}
