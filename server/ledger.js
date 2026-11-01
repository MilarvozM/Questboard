import fs from "node:fs";
import { msOf, stampOf } from "../shared/dates.js";
import { gradeAt, questXp } from "../shared/grades.js";
import { isPlayerDays } from "../shared/guards.js";
import { filled, isRecord } from "../shared/records.js";
import { BUCKET_FIELDS, includes, } from "../shared/types.js";
import { HttpError } from "./http-error.js";
import { translate } from "./locales.js";
const textOf = (value) => typeof value === "string" ? value : "";
const numberOf = (value) => typeof value === "number" ? value : undefined;
function closedByOf(value) {
    return value === "app" || value === "file" ? value : undefined;
}
function readHistory(file) {
    const closed = new Map();
    const runs = new Map();
    if (!fs.existsSync(file)) {
        return { closed, runs };
    }
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        let entry;
        try {
            entry = JSON.parse(line);
        }
        catch {
            continue;
        }
        if (!isRecord(entry)) {
            continue;
        }
        const id = textOf(entry["id"]);
        const day = textOf(entry["day"]);
        if (day) {
            const days = runs.get(id) ?? new Map();
            runs.set(id, days);
            if (entry["event"] === "complete") {
                days.set(day, {
                    guild: textOf(entry["guild"]),
                    xp: numberOf(entry["xp"]) ?? 0,
                });
            }
            else {
                days.delete(day);
            }
        }
        else if (entry["event"] === "reopen") {
            closed.delete(id);
        }
        else {
            closed.set(id, {
                event: textOf(entry["event"]),
                type: textOf(entry["type"]),
                guild: textOf(entry["guild"]),
                xp: numberOf(entry["xp"]),
                at: textOf(entry["at"]),
                by: closedByOf(entry["by"]),
            });
        }
    }
    return { closed, runs };
}
function closingEvent(status) {
    if (status === "complete") {
        return "complete";
    }
    return status === "abandoned" ? "abandon" : null;
}
const emptyBucket = () => ({
    main: 0,
    side: 0,
    activity: 0,
    abandoned: 0,
    xp: 0,
});
function bucketFor(player, day, guild) {
    const guilds = player.days[day] ?? {};
    player.days[day] = guilds;
    const bucket = guilds[guild] ?? emptyBucket();
    guilds[guild] = bucket;
    return bucket;
}
function without(record, key) {
    return Object.fromEntries(Object.entries(record).filter(([name]) => name !== key));
}
function dropBucket(player, day, guild) {
    const guilds = without(player.days[day] ?? {}, guild);
    player.days =
        Object.keys(guilds).length === 0
            ? without(player.days, day)
            : { ...player.days, [day]: guilds };
}
export function createLedger(cfg, historyFile, startingPlayer, writePlayer) {
    const { closed, runs } = readHistory(historyFile);
    let player = startingPlayer;
    let playerChanged = false;
    function record(event, ms) {
        fs.appendFileSync(historyFile, `${JSON.stringify({ at: stampOf(ms).replace(" ", "T"), ...event })}\n`);
    }
    function bump(day, guild, field, xp, sign) {
        if (!includes(BUCKET_FIELDS, field)) {
            return;
        }
        const bucket = bucketFor(player, day, guild);
        bucket[field] = Math.max(0, (bucket[field] ?? 0) + sign);
        bucket.xp = Math.max(0, (bucket.xp ?? 0) + sign * xp);
        if (Object.values(bucket).every((count) => count === 0)) {
            dropBucket(player, day, guild);
        }
        playerChanged = true;
    }
    function takeBack(quest, id, was, { now, lang, quiet }) {
        record({ event: "reopen", id, xp: -(was.xp ?? 0) }, now);
        const day = was.at.slice(0, 10);
        if (was.event === "abandon") {
            bump(day, was.guild, "abandoned", 0, -1);
        }
        else if (was.type !== "activity") {
            bump(day, was.guild, was.type, was.xp ?? 0, -1);
        }
        closed.delete(id);
        if (closingEvent(quest.status) !== null) {
            return false;
        }
        delete quest.completed;
        delete quest.grade;
        delete quest.awarded;
        if (!quiet) {
            quest.log.push({
                head: stampOf(now),
                text: translate(lang, "t_reopen_q"),
            });
        }
        return true;
    }
    function close(quest, id, want, { by, when }) {
        let touched = false;
        const at = quest.completed === undefined ? when : msOf(quest.completed);
        const guild = filled(quest.guild) ? quest.guild : "none";
        if (quest.completed === undefined) {
            quest.completed = stampOf(at);
            touched = true;
        }
        if (want === "abandon" &&
            (quest.grade !== undefined || quest.awarded !== undefined)) {
            delete quest.grade;
            delete quest.awarded;
            touched = true;
        }
        let award = null;
        if (want === "complete" && quest.type !== "activity") {
            const grade = quest.grade ?? gradeAt(quest, at, cfg);
            const xp = quest.awarded ??
                Math.round(questXp(quest, cfg) * cfg.gradeMultiplier[grade]);
            if (quest.grade !== grade || quest.awarded !== xp) {
                quest.grade = grade;
                quest.awarded = xp;
                touched = true;
            }
            award = { grade, xp };
        }
        record({ event: want, id, type: quest.type, guild, ...award, by }, at);
        closed.set(id, {
            event: want,
            type: quest.type,
            guild,
            xp: award?.xp,
            at: stampOf(at).replace(" ", "T"),
            by,
        });
        const day = stampOf(at).slice(0, 10);
        if (want === "abandon") {
            bump(day, guild, "abandoned", 0, 1);
        }
        else if (quest.type !== "activity") {
            bump(day, guild, quest.type, award?.xp ?? 0, 1);
        }
        return touched;
    }
    function countRuns(quest, id, by, now) {
        const days = runs.get(id) ?? new Map();
        const have = new Set(quest.completions.map((day) => day.slice(0, 10)));
        for (const [day, run] of days) {
            if (!have.has(day)) {
                record({ event: "reopen", id, day, xp: -run.xp }, now);
                bump(day, run.guild, "activity", run.xp, -1);
                days.delete(day);
            }
        }
        if (quest.type === "activity") {
            const guild = filled(quest.guild) ? quest.guild : "none";
            const xp = questXp(quest, cfg);
            for (const day of have) {
                if (!days.has(day)) {
                    record({ event: "complete", id, type: "activity", guild, day, xp, by }, now);
                    bump(day, guild, "activity", xp, 1);
                    days.set(day, { guild, xp });
                }
            }
        }
        runs.set(id, days);
    }
    return {
        count(quest, options) {
            const id = quest.id ?? "";
            const want = closingEvent(quest.status);
            const was = closed.get(id);
            let touched = false;
            if (was && was.event !== want && takeBack(quest, id, was, options)) {
                touched = true;
            }
            if (want !== null && !closed.has(id) && close(quest, id, want, options)) {
                touched = true;
            }
            if (quest.type === "activity" || runs.has(id)) {
                countRuns(quest, id, options.by, options.now);
            }
            return touched;
        },
        closedBy: (id) => closed.get(id)?.by,
        player: () => player,
        importPlayer(incoming, mode) {
            if (!isRecord(incoming) ||
                !isPlayerDays(incoming["days"]) ||
                (mode !== "add" && mode !== "replace")) {
                throw new HttpError(400, 'Not a player.json, or mode is not "add" or "replace"');
            }
            if (mode === "replace") {
                player = { questboard: 1, days: {} };
            }
            for (const [day, guilds] of Object.entries(incoming["days"])) {
                for (const [guild, bucket] of Object.entries(guilds)) {
                    const to = bucketFor(player, day, guild);
                    for (const field of BUCKET_FIELDS) {
                        to[field] = (to[field] ?? 0) + (bucket[field] ?? 0);
                    }
                }
            }
            writePlayer(player);
        },
        saveIfChanged() {
            if (playerChanged) {
                writePlayer(player);
                playerChanged = false;
            }
        },
    };
}
