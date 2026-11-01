import { stampOf } from "../shared/dates.js";
import { filled } from "../shared/records.js";
import { isNotTaken, translate } from "./locales.js";
function latestAt(steps) {
    return steps
        .map((step) => step.at)
        .filter(filled)
        .sort()
        .at(-1);
}
export function groupState(group) {
    const states = (group.sub ?? []).map((step) => step.s);
    if (group.any === true && states.includes("done")) {
        return "done";
    }
    if (states.includes("open")) {
        return "open";
    }
    if (states.every((state) => state === "dropped")) {
        return "dropped";
    }
    return states.includes("done") ? "done" : "failed";
}
function dropRoutesNotTaken(group, sub, lang, when) {
    const taken = group.any === true ? sub.find((step) => step.s === "done") : undefined;
    if (!taken) {
        return false;
    }
    let changed = false;
    for (const step of sub) {
        if (step.s === "open") {
            step.s = "dropped";
            step.at = taken.at ?? stampOf(when);
            step.note = translate(lang, "not_taken");
            changed = true;
        }
    }
    return changed;
}
function reopenGroup(group, sub) {
    group.s = "open";
    delete group.at;
    delete group.note;
    if (group.any !== true) {
        return;
    }
    for (const step of sub) {
        if (step.s === "dropped" && isNotTaken(step.note)) {
            step.s = "open";
            delete step.at;
            delete step.note;
        }
    }
}
export function rollUp(quest, lang, when) {
    let changed = false;
    for (const group of quest.objectives) {
        const sub = group.sub ?? [];
        if (sub.length === 0) {
            continue;
        }
        if (dropRoutesNotTaken(group, sub, lang, when)) {
            changed = true;
        }
        const state = groupState(group);
        if (state === group.s) {
            continue;
        }
        changed = true;
        if (state === "open") {
            reopenGroup(group, sub);
        }
        else {
            group.s = state;
            group.at = latestAt(sub) ?? stampOf(when);
        }
    }
    return changed;
}
