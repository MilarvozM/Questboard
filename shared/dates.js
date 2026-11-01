export const HOUR_MS = 36e5;
export const DAY_MS = 864e5;
const FILE_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::\d{2})?)?$/;
export function pad(n) {
    return String(n).padStart(2, "0");
}
export function dayKey(date) {
    return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export function stampOf(ms) {
    const date = new Date(ms);
    return `${dayKey(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function dateOf(text) {
    const [year = 0, month = 1, day = 1, hour = 23, minute = 59] = text
        .split(/[- :]/)
        .map(Number);
    return new Date(year, month - 1, day, hour, minute);
}
export function msOf(text) {
    return dateOf(text).getTime();
}
export function dayOf(text) {
    return text.slice(0, 10);
}
export function addDays(day, n) {
    const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
    return dayKey(new Date(year, month - 1, date + n));
}
export function parseDate(text) {
    const match = FILE_DATE.exec(text.trim());
    if (!match) {
        return null;
    }
    const [, year = "", month = "", day = "", hour, minute = ""] = match;
    const utc = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (utc.getUTCMonth() !== Number(month) - 1 ||
        utc.getUTCDate() !== Number(day)) {
        return null;
    }
    if (hour === undefined) {
        return `${year}-${month}-${day}`;
    }
    return Number(hour) > 23 || Number(minute) > 59
        ? null
        : `${year}-${month}-${day} ${hour.padStart(2, "0")}:${minute}`;
}
