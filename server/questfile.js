import { filled } from "../shared/records.js";
import { SECTION_KINDS, } from "../shared/types.js";
import { frontmatterLines, readFrontmatter } from "./frontmatter.js";
import { headingFor, sectionKind } from "./locales.js";
import { insertInOrder } from "./order.js";
import { READ, WANT, WRITE } from "./sections.js";
import { trimBlank, withoutBom } from "./text.js";
export function isQuestFile(text) {
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(withoutBom(text));
    return frontmatter !== null && /^questboard\s*:/im.test(frontmatter[1] ?? "");
}
function splitSections(lines, doc) {
    const found = [];
    let current = null;
    let fenced = false;
    for (const line of lines) {
        const heading = fenced ? null : /^##\s+(.+?)\s*$/.exec(line);
        if (/^\s*(```|~~~)/.test(line)) {
            fenced = !fenced;
        }
        if (heading) {
            current = { heading: line, name: heading[1] ?? "", lines: [] };
            found.push(current);
        }
        else {
            (current ? current.lines : doc.pre).push(line);
        }
    }
    return found;
}
export function parseQuest(text) {
    const lines = withoutBom(text).split(/\r?\n/);
    const close = lines.findIndex((line, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(line));
    if (lines[0]?.trimEnd() !== "---" || close < 0) {
        return null;
    }
    const doc = {
        eol: text.includes("\r\n") ? "\r\n" : "\n",
        fm: [],
        pre: [],
        sections: [],
        raw: {},
        lead: {},
    };
    const quest = {
        problems: [],
        objectives: [],
        criteria: [],
        completions: [],
        skipped: [],
        log: [],
        briefing: "",
        debrief: "",
        type: "side",
        status: "active",
        doc,
    };
    for (const line of lines.slice(1, close)) {
        const key = /^([A-Za-z_][\w-]*)\s*:/.exec(line);
        const last = doc.fm.at(-1);
        if (key || !last) {
            doc.fm.push({ key: key ? (key[1] ?? null) : null, raw: [line] });
        }
        else {
            last.raw.push(line);
        }
    }
    readFrontmatter(quest, doc.fm);
    const found = splitSections(lines.slice(close + 1), doc);
    doc.pre = trimBlank(doc.pre);
    const read = new Set();
    doc.sections = found.map((section) => {
        const kind = sectionKind(section.name);
        const body = section.lines.slice(0, trimBlank(["x", ...section.lines]).length - 1);
        if (kind === null || read.has(kind)) {
            return { heading: section.heading, lines: body };
        }
        read.add(kind);
        READ[kind](body, quest, doc);
        return { kind, heading: section.heading };
    });
    if (!filled(quest.title)) {
        quest.problems.push({ code: "e_title", key: "title" });
    }
    return quest;
}
function kindOf(section) {
    return "kind" in section ? section.kind : undefined;
}
export function writeQuest(quest, lang = "en") {
    const doc = quest.doc;
    const frontmatter = frontmatterLines(quest, doc?.fm ?? []);
    const sections = [...(doc?.sections ?? [])];
    for (const kind of SECTION_KINDS) {
        if (!sections.some((section) => kindOf(section) === kind) &&
            WANT[kind](quest, doc)) {
            insertInOrder(sections, { kind }, kind, SECTION_KINDS, kindOf);
        }
    }
    const blocks = doc && doc.pre.length > 0 ? [doc.pre] : [];
    for (const section of sections) {
        blocks.push("kind" in section
            ? [
                section.heading ?? `## ${headingFor(section.kind, lang)}`,
                ...WRITE[section.kind](quest, doc),
            ]
            : [section.heading, ...section.lines]);
    }
    const body = blocks.map((block) => block.join("\n")).join("\n\n");
    return `${frontmatter.join("\n")}\n${body ? `\n${body}\n` : ""}`.replace(/\n/g, doc?.eol ?? "\n");
}
