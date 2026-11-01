import { DAY_MS, dayOf } from "../shared/dates.js";
import { t } from "./i18n.js";
import { addDays, dateOrNull, dayKey, fmt, noonOf } from "./time.js";
import { clock } from "./state.js";
function daysBetween(a, b) {
    return Math.round((noonOf(a).getTime() - noonOf(b).getTime()) / DAY_MS);
}
function everyDays(repeat) {
    return repeat?.every ?? 0;
}
export function occurs(activity, day) {
    const repeat = activity.repeat;
    const from = (activity.created ?? dayKey(clock.now)).slice(0, 10);
    if (repeat?.days) {
        return repeat.days.includes(noonOf(day).getDay());
    }
    return day >= from && daysBetween(day, from) % (everyDays(repeat) || 1) === 0;
}
function cycle(activity) {
    return (everyDays(activity.repeat) || 7) + 1;
}
export function nextRun(activity) {
    const passed = new Set([...activity.completions, ...activity.skipped].map(dayOf));
    const today = dayKey(clock.now);
    for (let i = 0; i < 2 * cycle(activity); i++) {
        const day = addDays(today, i);
        if (occurs(activity, day) && !passed.has(day)) {
            return dateOrNull(`${day} 23:59`);
        }
    }
    return null;
}
export function streak(activity) {
    const done = new Set(activity.completions.map(dayOf));
    const skipped = new Set(activity.skipped.map(dayOf));
    let count = 0;
    let day = dayKey(clock.now);
    if (!done.has(day)) {
        day = addDays(day, -1);
    }
    for (let gap = 0; gap < cycle(activity); day = addDays(day, -1)) {
        if (day < (activity.created ?? day).slice(0, 10)) {
            break;
        }
        if (skipped.has(day)) {
            continue;
        }
        if (!occurs(activity, day)) {
            gap++;
            continue;
        }
        if (!done.has(day)) {
            break;
        }
        count++;
        gap = 0;
    }
    return count;
}
export function runState(activity, day) {
    if (activity.completions.some((d) => dayOf(d) === day)) {
        return "done";
    }
    if (activity.skipped.some((d) => dayOf(d) === day)) {
        return "skip";
    }
    return day < dayKey(clock.now) ? "miss" : "todo";
}
export function isLatestRun(activity, day) {
    const today = dayKey(new Date());
    for (let k = addDays(day, 1); k <= today; k = addDays(k, 1)) {
        if (occurs(activity, k)) {
            return false;
        }
    }
    return true;
}
export function repeatLabel(repeat) {
    if (!repeat?.days) {
        const every = everyDays(repeat);
        return !repeat || every === 1 ? t("daily") : t("every_n", every);
    }
    return repeat.days
        .map((n) => fmt(new Date(2026, 9, 18 + n), { weekday: "short" }))
        .join(" · ");
}
