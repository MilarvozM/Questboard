import { parseDate } from "../shared/dates.js";
import { filled, same } from "../shared/records.js";
import { GRADES, includes, QUEST_STATUSES, QUEST_TYPES, } from "../shared/types.js";
import { insertInOrder } from "./order.js";
const BAD = Symbol("bad");
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export function parseRepeat(text) {
    const wanted = text.trim().toLowerCase();
    if (wanted === "daily") {
        return { every: 1 };
    }
    const every = Number(/^every\s*(\d+)\s*d(?:ays?)?$/.exec(wanted)?.[1] ?? 0);
    if (every > 0) {
        return { every };
    }
    const parts = wanted.split(/[,\s]+/).filter((part) => part !== "");
    const days = parts.map((part) => DAYS.indexOf(part.slice(0, 3)));
    return parts.length > 0 && days.every((day) => day >= 0)
        ? { days: [...new Set(days)].sort((a, b) => a - b) }
        : null;
}
function repeatText(repeat) {
    const every = repeat.every ?? 0;
    if (every === 1) {
        return "daily";
    }
    if (every > 0) {
        return `every ${String(every)}d`;
    }
    return (repeat.days ?? []).map((day) => DAYS[day] ?? "").join(",");
}
function yamlValue(raw) {
    const value = raw.trim();
    if (value.startsWith('"')) {
        const quoted = /^"(?:[^"\\]|\\.)*"/.exec(value);
        if (!quoted) {
            return value;
        }
        try {
            const parsed = JSON.parse(quoted[0]);
            return typeof parsed === "string" ? parsed : value;
        }
        catch {
            return value;
        }
    }
    if (value.startsWith("'")) {
        const quoted = /^'((?:[^']|'')*)'/.exec(value);
        return quoted ? (quoted[1] ?? "").replace(/''/g, "'") : value;
    }
    return value.replace(/\s+#.*$/, "");
}
function needsQuotes(text) {
    return (text !== text.trim() ||
        /^[-?:,[\]{}#&*!|>'"%@`]/.test(text) ||
        /: |\s#|:$/.test(text) ||
        /^(true|false|yes|no|on|off|null|~)$/i.test(text) ||
        /^[-+]?\d[\d_]*(\.\d*)?([eE][-+]?\d+)?$/.test(text));
}
function yamlText(text) {
    return needsQuotes(text) ? JSON.stringify(text) : text;
}
function entryValue(raw) {
    const first = raw[0] ?? "";
    return yamlValue(first.slice(first.indexOf(":") + 1));
}
const textField = {
    read: (text) => (text === "" ? undefined : text),
    write: (value) => (filled(value) ? yamlText(value) : null),
};
const dateField = {
    read: (text) => (text === "" ? undefined : (parseDate(text) ?? BAD)),
    write: (value) => (filled(value) ? value.replace(" ", "T") : null),
    code: "w_date",
};
const flagField = {
    read: (text) => (/^true$/i.test(text) ? true : undefined),
    write: (value) => (value === true ? "true" : null),
};
const numberField = {
    read: (text) => {
        if (text === "") {
            return undefined;
        }
        return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : BAD;
    },
    write: (value) => (value === undefined ? null : String(value)),
};
const typeField = {
    read: (text) => {
        const type = text.toLowerCase();
        if (type === "") {
            return "side";
        }
        if (type === "act") {
            return "activity";
        }
        return includes(QUEST_TYPES, type) ? type : BAD;
    },
    write: (value) => value,
    code: "w_type",
};
const statusField = {
    read: (text) => {
        const status = text.toLowerCase();
        if (status === "" || status === "available") {
            return "active";
        }
        return includes(QUEST_STATUSES, status) ? status : BAD;
    },
    write: (value) => value,
    outdated: (text) => /^available$/i.test(text),
};
const repeatField = {
    read: (text) => (text === "" ? undefined : (parseRepeat(text) ?? BAD)),
    write: (value) => (value ? repeatText(value) : null),
    code: "w_repeat",
};
const gradeField = {
    read: (text) => {
        if (text === "") {
            return undefined;
        }
        const grade = text.toUpperCase();
        return includes(GRADES, grade) ? grade : BAD;
    },
    write: (value) => value ?? null,
};
function bind(key, field) {
    const store = (quest, value) => {
        if (value !== BAD && value !== undefined) {
            quest[key] = value;
        }
    };
    const meaning = (text) => {
        const value = field.read(text);
        return value === BAD ? field.read("") : value;
    };
    return {
        code: field.code ?? "w_value",
        readInto: (quest, text) => {
            const value = field.read(text);
            store(quest, value === BAD ? field.read("") : value);
            return value !== BAD;
        },
        setDefault: (quest) => {
            store(quest, field.read(""));
        },
        unchanged: (quest, text) => text === null
            ? same(quest[key], field.read(""))
            : same(meaning(text), quest[key]) && !(field.outdated?.(text) ?? false),
        line: (quest, name) => {
            const written = field.write(quest[key]);
            return written === null ? null : `${name}: ${written}`;
        },
    };
}
const FIELDS = {
    id: bind("id", textField),
    parent: bind("parent", textField),
    type: bind("type", typeField),
    guild: bind("guild", textField),
    title: bind("title", textField),
    short: bind("short", textField),
    status: bind("status", statusField),
    tracked: bind("tracked", flagField),
    favorite: bind("favorite", flagField),
    created: bind("created", dateField),
    deadline: bind("deadline", dateField),
    target: bind("target", dateField),
    repeat: bind("repeat", repeatField),
    xp: bind("xp", numberField),
    completed: bind("completed", dateField),
    grade: bind("grade", gradeField),
    awarded: bind("awarded", numberField),
};
const FIELD_KEYS = Object.keys(FIELDS).filter((key) => key in FIELDS);
const FRONTMATTER_ORDER = ["questboard", ...FIELD_KEYS];
function fieldKey(key) {
    return FIELD_KEYS.find((field) => field === key) ?? null;
}
export function readFrontmatter(quest, entries) {
    const seen = new Set();
    for (const entry of entries) {
        const key = fieldKey(entry.key?.toLowerCase());
        if (key === null || seen.has(key)) {
            continue;
        }
        seen.add(key);
        const field = FIELDS[key];
        const text = entryValue(entry.raw);
        if (!field.readInto(quest, text)) {
            quest.problems.push({ code: field.code, key, value: text });
        }
    }
    for (const key of FIELD_KEYS) {
        if (!seen.has(key)) {
            FIELDS[key].setDefault(quest);
        }
    }
}
function fieldLines(quest, key, entry) {
    const field = FIELDS[key];
    if (field.unchanged(quest, entry.raw ? entryValue(entry.raw) : null)) {
        return entry.raw ?? [];
    }
    const line = field.line(quest, entry.key ?? key);
    return line === null ? [] : [line];
}
export function frontmatterLines(quest, entries) {
    const keyOf = (entry) => entry.key?.toLowerCase();
    const all = [...entries];
    for (const key of FRONTMATTER_ORDER) {
        if (!all.some((entry) => keyOf(entry) === key)) {
            insertInOrder(all, { key }, key, FRONTMATTER_ORDER, keyOf);
        }
    }
    const lines = ["---"];
    const managed = new Set();
    for (const entry of all) {
        const name = keyOf(entry);
        if (name === "questboard" && !managed.has(name)) {
            managed.add(name);
            lines.push(...(entry.raw ?? ["questboard: 1"]));
            continue;
        }
        const key = fieldKey(name);
        if (key === null || managed.has(key)) {
            lines.push(...(entry.raw ?? []));
            continue;
        }
        managed.add(key);
        lines.push(...fieldLines(quest, key, entry));
    }
    lines.push("---");
    return lines;
}
