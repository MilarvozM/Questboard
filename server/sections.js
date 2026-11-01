import { parseDate } from "../shared/dates.js";
import { filled, same } from "../shared/records.js";
import { CHECKBOX, itemLine, parseItem } from "./steps.js";
import { textLines, trimText } from "./text.js";
function parseLog(lines) {
    const entries = [];
    for (const line of lines) {
        const heading = /^###\s+(.+?)\s*$/.exec(line);
        const last = entries.at(-1);
        if (heading) {
            entries.push({ head: heading[1] ?? "", lines: [] });
        }
        else if (last) {
            last.lines.push(line);
        }
        else if (line.trim()) {
            entries.push({ head: null, lines: [line] });
        }
    }
    return entries.map((entry) => ({
        head: entry.head,
        text: trimText(entry.lines),
    }));
}
function logLines(entry) {
    return [
        ...(entry.head === null ? [] : [`### ${entry.head}`]),
        ...textLines(entry.text),
    ];
}
function parseCompletions(lines) {
    const found = { dates: [], skipped: [], extra: [] };
    for (const line of lines) {
        const match = /^\s*[-*+]\s+(.+?)(\s+@skipped)?\s*$/.exec(line);
        const date = match ? parseDate(match[1] ?? "") : null;
        if (date !== null) {
            (match?.[2] === undefined ? found.dates : found.skipped).push(date);
        }
        else if (line.trim()) {
            found.extra.push(line);
        }
    }
    return found;
}
function runLine([day, skipped]) {
    return `- ${day}${skipped ? " @skipped" : ""}`;
}
function runsOf(dates, skipped) {
    return [
        ...dates.map((day) => [day, false]),
        ...skipped.map((day) => [day, true]),
    ].sort(([a], [b]) => a.localeCompare(b));
}
function extendsList(now, before) {
    return (now.length >= before.length && same(now.slice(0, before.length), before));
}
function appendedLog(raw, now) {
    if (!raw) {
        return null;
    }
    const before = parseLog(raw);
    if (!extendsList(now, before)) {
        return null;
    }
    const out = [...raw];
    for (const entry of now.slice(before.length)) {
        out.push(...(out.length > 0 ? [""] : []), ...logLines(entry));
    }
    return out;
}
function readObjectives(lines, quest, doc) {
    const lead = [];
    doc.lead.objectives = lead;
    let top = null;
    let last = null;
    let topIndent = null;
    let subIndent = null;
    for (const line of lines) {
        const match = CHECKBOX.exec(line);
        if (match) {
            const indent = match[1] ?? "";
            const step = {
                ...parseItem(match[3] ?? "", match[4] ?? ""),
                _raw: line,
            };
            if (topIndent === null && /\d/.test(match[2] ?? "")) {
                quest.ordered = true;
            }
            if (topIndent === null || indent.length <= topIndent) {
                topIndent ??= indent.length;
                quest.objectives.push(step);
                top = step;
                last = step;
                continue;
            }
            if (top !== null && (subIndent === null || indent.length <= subIndent)) {
                if (subIndent === null) {
                    subIndent = indent.length;
                    doc.indent = indent;
                }
                (top.sub ??= []).push(step);
                last = step;
                continue;
            }
        }
        if (last) {
            (last._extra ??= []).push(line);
        }
        else {
            lead.push(line);
        }
    }
}
function readCriteria(lines, quest, doc) {
    const lead = [];
    doc.lead.criteria = lead;
    for (const line of lines) {
        const match = CHECKBOX.exec(line);
        const last = quest.criteria.at(-1);
        if (match) {
            const criterion = { t: match[4] ?? "" };
            if (/x/i.test(match[3] ?? "")) {
                criterion.met = true;
            }
            criterion._raw = line;
            quest.criteria.push(criterion);
        }
        else if (last) {
            (last._extra ??= []).push(line);
        }
        else {
            lead.push(line);
        }
    }
}
export const READ = {
    briefing: (lines, quest, doc) => {
        quest.briefing = trimText(lines);
        doc.raw.briefing = lines;
    },
    debrief: (lines, quest, doc) => {
        quest.debrief = trimText(lines);
        doc.raw.debrief = lines;
    },
    objectives: readObjectives,
    criteria: readCriteria,
    completions: (lines, quest, doc) => {
        const found = parseCompletions(lines);
        quest.completions = found.dates;
        quest.skipped = found.skipped;
        doc.raw.completions = lines;
    },
    log: (lines, quest, doc) => {
        quest.log = parseLog(lines);
        doc.raw.log = lines;
    },
};
export const WANT = {
    briefing: (quest) => quest.briefing !== "",
    objectives: (quest, doc) => quest.objectives.length > 0 || !doc,
    criteria: (quest) => quest.criteria.length > 0,
    completions: (quest) => quest.completions.length > 0 || quest.skipped.length > 0,
    log: (quest) => quest.log.length > 0,
    debrief: (quest) => quest.debrief !== "",
};
function keptText(raw, text) {
    return raw && trimText(raw) === text ? raw : textLines(text);
}
function criterionLine(criterion) {
    const match = criterion._raw === undefined ? null : CHECKBOX.exec(criterion._raw);
    const unchanged = match !== null &&
        match[4] === criterion.t &&
        /x/i.test(match[3] ?? "") === (criterion.met === true);
    return unchanged && criterion._raw !== undefined
        ? criterion._raw
        : `- [${criterion.met === true ? "x" : " "}] ${criterion.t}`;
}
function objectiveLines(quest, doc) {
    const subIndent = doc?.indent;
    return [
        ...(doc?.lead.objectives ?? []),
        ...quest.objectives.flatMap((step, i) => [
            itemLine(step, "", quest.ordered === true && i + 1),
            ...(step._extra ?? []),
            ...(step.sub ?? []).flatMap((sub) => [
                itemLine(sub, filled(subIndent) ? subIndent : "  "),
                ...(sub._extra ?? []),
            ]),
        ]),
    ];
}
function completionLines(quest, doc) {
    const raw = doc?.raw.completions;
    const was = raw ? parseCompletions(raw) : null;
    if (raw &&
        was &&
        extendsList(quest.completions, was.dates) &&
        extendsList(quest.skipped, was.skipped)) {
        return [
            ...raw,
            ...runsOf(quest.completions.slice(was.dates.length), quest.skipped.slice(was.skipped.length)).map(runLine),
        ];
    }
    return [
        ...runsOf(quest.completions, quest.skipped).map(runLine),
        ...(was?.extra ?? []),
    ];
}
export const WRITE = {
    briefing: (quest, doc) => keptText(doc?.raw.briefing, quest.briefing),
    debrief: (quest, doc) => keptText(doc?.raw.debrief, quest.debrief),
    objectives: objectiveLines,
    criteria: (quest, doc) => [
        ...(doc?.lead.criteria ?? []),
        ...quest.criteria.flatMap((criterion) => [
            criterionLine(criterion),
            ...(criterion._extra ?? []),
        ]),
    ],
    completions: completionLines,
    log: (quest, doc) => appendedLog(doc?.raw.log, quest.log) ??
        quest.log.flatMap((entry, i) => [
            ...(i > 0 ? [""] : []),
            ...logLines(entry),
        ]),
};
