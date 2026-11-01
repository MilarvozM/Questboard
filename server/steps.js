import { parseDate } from "../shared/dates.js";
import { filled } from "../shared/records.js";
export const CHECKBOX = /^(\s*)([-*+]|\d+[.)]) \[(.)\] (.*)$/;
const MARK_STATE = {
    " ": "open",
    x: "done",
    X: "done",
    "!": "failed",
    "-": "dropped",
};
const STATE_MARK = {
    open: " ",
    done: "x",
    failed: "!",
    dropped: "-",
};
export function parseItem(mark, rest) {
    const known = MARK_STATE[mark];
    const step = { s: known ?? "open", t: "" };
    if (known === undefined) {
        step.mark = mark;
    }
    const dash = /^(.*?)\s+—\s+(.*)$/.exec(rest);
    let text = (dash ? (dash[1] ?? "") : rest)
        .replace(/(?:^|\s+)@(done|failed|dropped|added|due)\(([^)]*)\)/g, (all, tag, value) => {
        const date = parseDate(value);
        if (date === null) {
            return all;
        }
        if (tag === "due") {
            step.due = date;
        }
        else if (tag === "added") {
            step.added = date;
        }
        else {
            step.at = date;
        }
        return "";
    })
        .replace(/(?:^|\s+)@any\b/g, () => {
        step.any = true;
        return "";
    })
        .trim();
    const wikiLink = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/.exec(text);
    if (wikiLink) {
        const target = wikiLink[1] ?? "";
        step.link = target.trim();
        text = (wikiLink[2] ?? target).trim();
    }
    step.t = text;
    if (dash) {
        step.note = dash[2] ?? "";
    }
    return step;
}
const ITEM_KEYS = [
    "t",
    "s",
    "at",
    "added",
    "due",
    "any",
    "note",
    "link",
    "mark",
];
function meaningful(value) {
    return value === "" || value === false ? undefined : value;
}
function sameItem(a, b) {
    return ITEM_KEYS.every((key) => meaningful(a[key]) === meaningful(b[key]));
}
function bulletFits(bullet, number) {
    if (number === undefined) {
        return true;
    }
    return number === false
        ? !/\d/.test(bullet)
        : Number.parseInt(bullet, 10) === number;
}
export function itemLine(step, indent, number) {
    let bullet = number === undefined || number === false ? "-" : `${String(number)}.`;
    let lead = indent;
    if (step._raw !== undefined) {
        const match = CHECKBOX.exec(step._raw);
        const written = match?.[2] ?? "";
        const fits = match !== null && bulletFits(written, number);
        if (fits && sameItem(parseItem(match[3] ?? "", match[4] ?? ""), step)) {
            return step._raw;
        }
        lead = /^\s*/.exec(step._raw)?.[0] ?? "";
        if (fits) {
            bullet = written;
        }
    }
    const text = filled(step.link)
        ? `[[${step.link}${filled(step.t) && step.t !== step.link ? `|${step.t}` : ""}]]`
        : step.t;
    const mark = step.s === "open" && filled(step.mark) ? step.mark : STATE_MARK[step.s];
    return [
        `${lead}${bullet} [${mark}] ${text}`,
        step.any === true ? " @any" : "",
        filled(step.due) ? ` @due(${step.due})` : "",
        filled(step.at) && step.s !== "open" ? ` @${step.s}(${step.at})` : "",
        filled(step.added) ? ` @added(${step.added})` : "",
        filled(step.note) ? ` — ${step.note}` : "",
    ].join("");
}
