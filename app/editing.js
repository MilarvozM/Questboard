import { copyOf, same } from "../shared/records.js";
import { act } from "./actions.js";
import { renderDetail } from "./detail.js";
import { all, findField } from "./dom.js";
import { cue } from "./feedback.js";
import { byRel, relOf } from "./quests.js";
import { render } from "./render.js";
import { ui } from "./state.js";
import { stampNow } from "./time.js";
const PARTS = ["title", "briefing", "objectives", "criteria"];
export function isPart(value) {
    return PARTS.some((part) => part === value);
}
export function pathOf(element) {
    const holder = element.closest("[data-path]");
    const path = holder instanceof HTMLElement ? (holder.dataset["path"] ?? "") : "";
    return path.split(".").map(Number);
}
function moveWithin(list, from, to) {
    const [moved] = list.splice(from, 1);
    if (moved !== undefined) {
        list.splice(to, 0, moved);
    }
}
function itemAt(edit, [i, j]) {
    if (edit.part === "objectives") {
        const step = edit.items[i ?? -1];
        return j === undefined ? step : step?.sub?.[j];
    }
    return edit.part === "criteria" ? edit.items[i ?? -1] : undefined;
}
export function readDraft(edit = ui.edit) {
    if (!edit) {
        return;
    }
    for (const input of all("#detail [data-itemtext]")) {
        const item = itemAt(edit, pathOf(input));
        if (item && input instanceof HTMLInputElement) {
            item.t = input.value;
        }
    }
}
export function commitEdit() {
    const edit = ui.edit;
    if (!edit) {
        return;
    }
    ui.edit = null;
    const quest = byRel(edit.rel);
    if (!quest) {
        render();
        return;
    }
    if (edit.part === "title") {
        const title = findField("#ed-title")?.value.trim();
        if (title !== undefined && title !== "" && title !== quest.title) {
            void act([quest], () => {
                quest.title = title;
            }, { sound: "write" });
            return;
        }
    }
    else if (edit.part === "briefing") {
        const briefing = findField("#ed-brief")?.value.trim() ?? quest.briefing;
        if (briefing !== quest.briefing) {
            void act([quest], () => {
                quest.briefing = briefing;
            }, { sound: "write" });
            return;
        }
    }
    else if (edit.part === "objectives") {
        readDraft(edit);
        const items = keptSteps(edit.items);
        if (!same(items, quest.objectives) ||
            edit.ordered !== (quest.ordered === true)) {
            void act([quest], () => {
                quest.objectives = items;
                if (edit.ordered) {
                    quest.ordered = true;
                }
                else {
                    delete quest.ordered;
                }
            }, { sound: "write" });
            return;
        }
    }
    else {
        readDraft(edit);
        const items = edit.items.filter((item) => item.t.trim() !== "");
        if (!same(items, quest.criteria)) {
            void act([quest], () => {
                quest.criteria = items;
            }, { sound: "write" });
            return;
        }
    }
    render();
}
function keptSteps(steps) {
    const keep = (step) => step.t.trim() !== "";
    return steps.filter(keep).map((step) => {
        if (!step.sub) {
            return step;
        }
        const sub = step.sub.filter(keep);
        if (sub.length > 0) {
            return { ...step, sub };
        }
        const alone = { ...step };
        delete alone.sub;
        return alone;
    });
}
export function startEdit(quest, part) {
    if (ui.edit) {
        commitEdit();
    }
    const rel = relOf(quest);
    if (part === "title") {
        ui.edit = { rel, part, focus: "#ed-title" };
    }
    else if (part === "briefing") {
        ui.edit = { rel, part, focus: "#ed-brief" };
    }
    else if (part === "objectives") {
        ui.edit = {
            rel,
            part,
            items: copyOf(quest.objectives),
            ordered: quest.ordered === true,
            focus: null,
        };
    }
    else {
        ui.edit = { rel, part, items: copyOf(quest.criteria), focus: null };
    }
    renderDetail();
}
export function cancelEdit() {
    ui.edit = null;
    render();
}
export function draftAdd(after, text = "") {
    readDraft();
    const edit = ui.edit;
    if (!edit || (edit.part !== "objectives" && edit.part !== "criteria")) {
        return;
    }
    const [i = -1, j] = after ?? [];
    let at;
    if (edit.part === "objectives") {
        const step = { t: text, s: "open", added: stampNow() };
        if (after === null) {
            edit.items.push(step);
            at = String(edit.items.length - 1);
        }
        else if (j === undefined) {
            edit.items.splice(i + 1, 0, step);
            at = String(i + 1);
        }
        else {
            edit.items[i]?.sub?.splice(j + 1, 0, step);
            at = `${String(i)}.${String(j + 1)}`;
        }
    }
    else if (after === null) {
        edit.items.push({ t: text });
        at = String(edit.items.length - 1);
    }
    else {
        edit.items.splice(i + 1, 0, { t: text });
        at = String(i + 1);
    }
    edit.focus = `#detail [data-path="${at}"] [data-itemtext]`;
    renderDetail();
}
export function draftDel([i = -1, j]) {
    readDraft();
    const edit = ui.edit;
    if (!edit || (edit.part !== "objectives" && edit.part !== "criteria")) {
        return;
    }
    if (j === undefined) {
        edit.items.splice(i, 1);
    }
    else if (edit.part === "objectives") {
        edit.items[i]?.sub?.splice(j, 1);
    }
    edit.focus = null;
    renderDetail();
}
function groupOf(root, group) {
    if (!group.includes(".")) {
        return root;
    }
    const parent = root[Number(group.split(".")[1])];
    return parent && "sub" in parent ? parent.sub : undefined;
}
export function moveItem(quest, kind, group, from, to) {
    const edit = ui.edit;
    if (edit) {
        readDraft();
        if (edit.part === "objectives" || edit.part === "criteria") {
            const list = groupOf(edit.items, group);
            if (list) {
                moveWithin(list, from, to);
            }
        }
        cue("edit");
        renderDetail();
        return;
    }
    void act([quest], () => {
        const list = groupOf(kind === "o" ? quest.objectives : quest.criteria, group);
        if (list) {
            moveWithin(list, from, to);
        }
    }, { sound: "edit" });
}
