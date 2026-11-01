import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DAY_MS, stampOf } from "../shared/dates.js";
import { APP_DIR } from "./paths.js";
export const EXAMPLES_WRITTEN_ON = "2026-10-31";
const CALENDAR_DATE = /(?<![\w-])(\d{4})-(\d{2})-(\d{2})(?![\d-])/g;
function utcDay(date) {
    const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
}
export function shiftDates(text, days) {
    return text.replace(CALENDAR_DATE, (date) => new Date(utcDay(date) + days * DAY_MS).toISOString().slice(0, 10));
}
export function copyExamples(to, now = Date.now()) {
    const days = Math.round((utcDay(stampOf(now).slice(0, 10)) - utcDay(EXAMPLES_WRITTEN_ON)) / DAY_MS);
    fs.cpSync(path.join(APP_DIR, "examples"), to, { recursive: true });
    for (const rel of fs.readdirSync(to, { recursive: true, encoding: "utf8" })) {
        const file = path.join(to, rel);
        if (fs.statSync(file).isFile()) {
            fs.writeFileSync(file, shiftDates(fs.readFileSync(file, "utf8"), days));
        }
    }
    return to;
}
export function demoConfig(cfg) {
    const dir = copyExamples(fs.mkdtempSync(path.join(os.tmpdir(), "questboard-demo-")));
    return {
        cfg: { ...cfg, dataDir: dir },
        removeCopy: () => {
            fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
        },
    };
}
