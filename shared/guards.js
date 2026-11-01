import { parseDate } from "./dates.js";
import { isRecord, isStringArray } from "./records.js";
import { BUCKET_FIELDS, GRADES, includes, QUEST_STATUSES, QUEST_TYPES, SECTION_KINDS, STEP_STATES, } from "./types.js";
const optional = (check) => (value) => value === undefined || check(value);
const isText = (value) => typeof value === "string";
const isFlag = (value) => typeof value === "boolean";
const isNumber = (value) => typeof value === "number" && Number.isFinite(value);
function hasFields(value, fields) {
    return Object.entries(fields).every(([key, check]) => check(value[key]));
}
const listOf = (check) => (value) => Array.isArray(value) && value.every(check);
function isRepeat(value) {
    return (isRecord(value) &&
        optional(isNumber)(value["every"]) &&
        optional(listOf(isNumber))(value["days"]));
}
export function isStep(value) {
    return (isRecord(value) &&
        hasFields(value, {
            t: isText,
            s: (s) => includes(STEP_STATES, s),
            mark: optional(isText),
            at: optional(isText),
            added: optional(isText),
            due: optional(isText),
            any: optional(isFlag),
            note: optional(isText),
            link: optional(isText),
            sub: optional(listOf(isStep)),
            _raw: optional(isText),
            _extra: optional(isStringArray),
        }));
}
function isCriterion(value) {
    return (isRecord(value) &&
        hasFields(value, {
            t: isText,
            met: optional(isFlag),
            _raw: optional(isText),
            _extra: optional(isStringArray),
        }));
}
function isLogEntry(value) {
    return (isRecord(value) &&
        (value["head"] === null || isText(value["head"])) &&
        isText(value["text"]));
}
export function isProblem(value) {
    return (isRecord(value) &&
        hasFields(value, { code: isText, key: isText, value: optional(isText) }));
}
function isFrontmatterEntry(value) {
    return (isRecord(value) &&
        (value["key"] === null || isText(value["key"])) &&
        isStringArray(value["raw"]));
}
function isDocSection(value) {
    if (!isRecord(value)) {
        return false;
    }
    return value["kind"] === undefined
        ? isText(value["heading"]) && isStringArray(value["lines"])
        : includes(SECTION_KINDS, value["kind"]) &&
            optional(isText)(value["heading"]);
}
const isLines = optional(isStringArray);
function isQuestDoc(value) {
    return (isRecord(value) &&
        isRecord(value["raw"]) &&
        isRecord(value["lead"]) &&
        hasFields(value, {
            eol: isText,
            fm: listOf(isFrontmatterEntry),
            pre: isStringArray,
            sections: listOf(isDocSection),
            indent: optional(isText),
        }) &&
        hasFields(value["raw"], {
            briefing: isLines,
            debrief: isLines,
            completions: isLines,
            log: isLines,
        }) &&
        hasFields(value["lead"], { objectives: isLines, criteria: isLines }));
}
export function isQuest(value) {
    return (isRecord(value) &&
        hasFields(value, {
            id: optional(isText),
            parent: optional(isText),
            type: (type) => includes(QUEST_TYPES, type),
            guild: optional(isText),
            title: optional(isText),
            short: optional(isText),
            status: (status) => includes(QUEST_STATUSES, status),
            tracked: optional(isFlag),
            favorite: optional(isFlag),
            created: optional(isText),
            deadline: optional(isText),
            target: optional(isText),
            repeat: optional(isRepeat),
            xp: optional(isNumber),
            completed: optional(isText),
            grade: optional((grade) => includes(GRADES, grade)),
            awarded: optional(isNumber),
            ordered: optional(isFlag),
            briefing: isText,
            debrief: isText,
            objectives: listOf(isStep),
            criteria: listOf(isCriterion),
            completions: isStringArray,
            skipped: isStringArray,
            log: listOf(isLogEntry),
            problems: optional(listOf(isProblem)),
            doc: optional(isQuestDoc),
        }));
}
const optionalText = (value) => value === undefined || typeof value === "string";
export function isGuild(value) {
    return (isRecord(value) &&
        typeof value["id"] === "string" &&
        typeof value["emblem"] === "string" &&
        optionalText(value["name"]) &&
        optionalText(value["motto"]) &&
        optionalText(value["color"]) &&
        (value["hidden"] === undefined || typeof value["hidden"] === "boolean"));
}
function isBucket(value) {
    return (isRecord(value) &&
        BUCKET_FIELDS.every((field) => {
            const count = value[field];
            return count === undefined || (typeof count === "number" && count >= 0);
        }));
}
export function isPlayerDays(value) {
    return (isRecord(value) &&
        Object.entries(value).every(([day, guilds]) => parseDate(day) === day &&
            isRecord(guilds) &&
            Object.values(guilds).every(isBucket)));
}
export function isPlayer(value) {
    return isRecord(value) && isPlayerDays(value["days"]);
}
