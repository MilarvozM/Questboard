import { parseDate } from "../shared/dates.js";
import { isQuest } from "../shared/guards.js";
import { isRecord } from "../shared/records.js";
import { HttpError } from "./http-error.js";
const DATE_KEYS = ["created", "deadline", "target", "completed"];
const LIST_KEYS = ["objectives", "criteria", "completions", "skipped", "log"];
const TEXT_KEYS = ["briefing", "debrief"];
function withDefaults(value) {
    const quest = Object.fromEntries(Object.entries(value).filter(([key, field]) => !(DATE_KEYS.includes(key) && field === null)));
    quest["type"] ??= "side";
    quest["status"] ??= "active";
    for (const key of LIST_KEYS) {
        quest[key] ??= [];
    }
    for (const key of TEXT_KEYS) {
        quest[key] ??= "";
    }
    return quest;
}
function hasReadableDates(value) {
    return DATE_KEYS.every((key) => {
        const date = value[key];
        return (date === undefined ||
            date === null ||
            (typeof date === "string" && parseDate(date) === date));
    });
}
export function checkQuest(value) {
    const quest = isRecord(value) ? withDefaults(value) : null;
    if (!quest ||
        typeof quest["title"] !== "string" ||
        quest["title"].trim() === "" ||
        !isRecord(value) ||
        !hasReadableDates(value) ||
        !isQuest(quest)) {
        throw new HttpError(400, "A quest needs a title; type, status and dates must be valid; objectives, criteria, completions, skipped and log are lists");
    }
    return quest;
}
