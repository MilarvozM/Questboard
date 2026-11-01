import { addDays, dateOf, dayKey, HOUR_MS, pad } from "../shared/dates.js";
import { locale, t } from "./i18n.js";
import { data } from "./state.js";
export { addDays, dayKey, pad };
export function dateOrNull(text) {
    return text === null || text === undefined || text === ""
        ? null
        : dateOf(text);
}
export function noonOf(day) {
    return dateOf(`${day} 12:00`);
}
export function fmt(date, options) {
    return new Intl.DateTimeFormat(locale(), options).format(date);
}
export function hm(date) {
    return fmt(date, { hour: "2-digit", minute: "2-digit", hour12: false });
}
export function stamp(date) {
    return date
        ? `${fmt(date, { month: "short", day: "numeric" })} ${hm(date)}`
        : "";
}
export function dateOnly(date) {
    return fmt(date, { month: "short", day: "numeric", weekday: "short" });
}
export function longDate(date) {
    return fmt(date, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}
export function dur(ms) {
    const minutes = Math.floor(Math.abs(ms) / 60000);
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const rest = minutes % 60;
    return days
        ? `${String(days)}${t("d")} ${String(hours)}${t("h")}`
        : `${String(hours)}${t("h")} ${String(rest)}${t("m")}`;
}
export function countdown(ms) {
    return t(ms < 0 ? "over" : "left", dur(ms));
}
export function red(ms) {
    return ms !== null && ms < data().cfg.countdownRedHours * HOUR_MS;
}
export function stampNow() {
    const now = new Date();
    return `${dayKey(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
export function normDate(value) {
    const match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?$/.exec(value.trim());
    if (!match) {
        return null;
    }
    const [, year = "", month = "", day = "", hour, minute = ""] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (date.getMonth() !== Number(month) - 1 ||
        date.getDate() !== Number(day) ||
        (hour !== undefined && (Number(hour) > 23 || Number(minute) > 59))) {
        return null;
    }
    const dayText = `${year}-${pad(Number(month))}-${pad(Number(day))}`;
    return hour === undefined
        ? dayText
        : `${dayText} ${pad(Number(hour))}:${minute}`;
}
