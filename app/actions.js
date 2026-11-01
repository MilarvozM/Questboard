import { dayOf } from "../shared/dates.js";
import { copyOf } from "../shared/records.js";
import { isOpen, } from "../shared/types.js";
import { deleteQuest as trashQuest, splitStep as splitOnServer, } from "./api.js";
import { cue, toast } from "./feedback.js";
import { guildOf } from "./guilds.js";
import { IC } from "./icons.js";
import { t } from "./i18n.js";
import { ask } from "./pick.js";
import { pickDate, pickRepeat } from "./pickers.js";
import { byRel, child, favs, leaves, level, relOf, xpOf } from "./quests.js";
import { render } from "./render.js";
import { showAll } from "./search.js";
import { showDone } from "./results.js";
import { isLatestRun, nextRun } from "./schedule.js";
import { data, langs, meta, ui } from "./state.js";
import { dateOnly, dayKey, stampNow } from "./time.js";
import { followSave, persist, pushUndo, reload, remember, run, undoStack, versionOf, } from "./undo.js";
export function objectAt(quest, [i, j]) {
    const step = quest.objectives[i ?? -1];
    return j === undefined ? step : step?.sub?.[j];
}
export function notTaken(note) {
    return [...langs.values()].some((strings) => strings.get("not_taken") === note);
}
export async function act(quests, change, { save = quests, sound = null } = {}) {
    if (sound !== null) {
        cue(sound);
    }
    const entry = remember(quests);
    change();
    render();
    return run(async () => persist(save, entry));
}
const STEP_COLORS = {
    open: "",
    done: "var(--c)",
    failed: "var(--danger)",
    dropped: "var(--dim)",
};
export function setObjective(quest, path, state) {
    const step = objectAt(quest, path);
    if (!step) {
        return;
    }
    const linked = child(step);
    if (state === "done" && linked && isOpen(linked.status)) {
        completeQuest(linked);
        return;
    }
    void act([quest], () => {
        step.s = state;
        step.at = stampNow();
    });
    toast(t(`t_${state}`), step.t, STEP_COLORS[state], { kind: state, q: quest });
}
export function reopenObjective(quest, path) {
    const step = objectAt(quest, path);
    if (!step) {
        return;
    }
    void act([quest], () => {
        step.s = "open";
        delete step.at;
        delete step.note;
    }, { sound: "undo" });
}
export function addObjective(quest, text) {
    void act([quest], () => {
        quest.objectives.push({ t: text, s: "open", added: stampNow() });
    }, { sound: "new" });
}
export function addCriterion(quest, text) {
    void act([quest], () => {
        quest.criteria.push({ t: text });
    }, { sound: "write" });
}
export function toggleCrit(quest, index) {
    const criterion = quest.criteria[index];
    if (!criterion) {
        return;
    }
    if (completesOnLastCriterion(quest, criterion)) {
        closeAsComplete(quest, () => {
            criterion.met = true;
        });
        return;
    }
    const wasMet = criterion.met === true;
    void act([quest], () => {
        if (criterion.met === true) {
            delete criterion.met;
        }
        else {
            criterion.met = true;
        }
    }, { sound: wasMet ? "edit" : "crit" });
}
function completesOnLastCriterion(quest, ticked) {
    return (data().cfg.completeOnAllCriteria &&
        quest.type !== "activity" &&
        ticked.met !== true &&
        quest.criteria.every((criterion) => criterion === ticked || criterion.met === true));
}
export function setStepDue(quest, path, anchor) {
    const step = objectAt(quest, path);
    if (!step) {
        return;
    }
    pickDate(anchor, step.due ?? null, (value) => {
        void act([quest], () => {
            if (value) {
                step.due = value;
            }
            else {
                delete step.due;
            }
        }, { sound: "edit" });
    });
}
export function setSLine(quest, anchor) {
    pickDate(anchor, quest.target ?? null, (value) => {
        void act([quest], () => {
            if (value) {
                quest.target = value;
            }
            else {
                delete quest.target;
            }
        }, { sound: "edit" });
    });
}
export function setDeadline(quest, anchor) {
    pickDate(anchor, quest.deadline ?? null, (value) => {
        void act([quest], () => {
            if (value) {
                quest.deadline = value;
            }
            else {
                delete quest.deadline;
            }
        }, { sound: "edit" });
    });
}
export function setRepeat(quest, anchor) {
    pickRepeat(anchor, quest.repeat, (repeat) => {
        void act([quest], () => {
            quest.repeat = repeat;
        }, { sound: "edit" });
    });
}
export function splitStep(quest, path) {
    const step = objectAt(quest, path);
    const known = meta.get(quest);
    if (!step || !known) {
        return;
    }
    const entry = remember([quest]);
    void run(async () => {
        const split = await splitOnServer(known, path);
        await reload();
        followSave(known, { rel: split.rel, version: versionOf(split.rel) });
        entry.created.push({ rel: split.child, version: versionOf(split.child) });
        toast(t("t_split"), step.t, "var(--side)", {
            kind: "new",
            q: byRel(split.rel) ?? null,
        });
    });
}
export function track(quest) {
    const previous = data().quests.filter((x) => x.tracked === true && x !== quest);
    void act([quest, ...previous], () => {
        for (const other of previous) {
            delete other.tracked;
        }
        quest.tracked = true;
        ui.switchOpen = false;
    }, { save: [quest], sound: "track" });
}
export function untrack(quest) {
    void act([quest], () => {
        delete quest.tracked;
        ui.switchOpen = false;
    }, { sound: "untrack" });
}
export function toggleTrack(quest) {
    if (quest.tracked === true) {
        untrack(quest);
    }
    else {
        track(quest);
    }
}
export function toggleFav(quest) {
    const max = data().cfg.favoritesMax;
    if (quest.favorite !== true && favs().length >= max) {
        toast(t("fav_full", max), t("fav_full_i"), "var(--danger)", {
            kind: "refuse",
            undo: false,
        });
        return;
    }
    const on = quest.favorite !== true;
    void act([quest], () => {
        if (on) {
            quest.favorite = true;
        }
        else {
            delete quest.favorite;
        }
    }, { sound: on ? "fav" : "unfav" });
}
export function changeType(quest, type, anchor, repeat = quest.repeat) {
    if (type === quest.type) {
        return;
    }
    if (type === "activity" && !repeat) {
        pickRepeat(anchor, { every: data().cfg.newActivityEveryDays }, (picked) => {
            changeType(quest, type, anchor, picked);
        });
        return;
    }
    void act([quest], () => {
        quest.type = type;
        if (type === "activity" && repeat) {
            quest.repeat = repeat;
            delete quest.deadline;
            delete quest.target;
        }
        else {
            delete quest.repeat;
        }
    }, { sound: "swap" });
}
export function addLog(quest, anchor) {
    ask(anchor, { icon: IC.log, multi: true }, (text) => {
        void act([quest], () => {
            quest.log.push({ head: stampNow(), text });
        });
        toast(t("ev_log"), text, "var(--dim)", { kind: "write", q: quest });
    });
}
export function changeGuild(quest, id) {
    if (id === guildOf(quest)) {
        return;
    }
    void act([quest], () => {
        if (id === "none") {
            delete quest.guild;
        }
        else {
            quest.guild = id;
        }
    }, { sound: "swap" });
}
export function deleteQuest(quest) {
    const entry = pushUndo({
        items: [],
        created: [],
        restore: [{ rel: relOf(quest), quest: copyOf(quest) }],
    });
    toast(t("t_deleted"), quest.title, "var(--dim)", { kind: "delete" });
    void run(async () => {
        const latest = data().quests.find((x) => x.id === quest.id) ?? quest;
        const known = meta.get(latest);
        try {
            await trashQuest({ rel: known?.rel ?? "", version: known?.version });
        }
        catch (error) {
            const at = undoStack.indexOf(entry);
            if (at >= 0) {
                undoStack.splice(at, 1);
            }
            throw error;
        }
        await reload();
    });
}
function openSteps(quest) {
    for (const { o } of leaves(quest)) {
        o.s = "open";
        delete o.at;
        delete o.note;
    }
    for (const step of quest.objectives) {
        if (step.sub) {
            step.s = "open";
            delete step.at;
        }
    }
}
export function recordRun(quest, day) {
    quest.completions.push(day);
    quest.completions.sort();
    quest.skipped = quest.skipped.filter((d) => dayOf(d) !== day);
    if (isLatestRun(quest, day)) {
        openSteps(quest);
    }
}
export function markRun(quest, day) {
    void act([quest], () => {
        recordRun(quest, day);
    });
    toast(t("t_act"), `${quest.title} · +${String(xpOf(quest))} XP`, "var(--act)", {
        kind: "done",
        q: quest,
    });
}
export function skipRun(quest) {
    const next = nextRun(quest);
    if (!next) {
        return;
    }
    void act([quest], () => {
        quest.skipped.push(dayKey(next));
        quest.skipped.sort();
        openSteps(quest);
    });
    toast(t("t_skip"), `${quest.title} · ${dateOnly(next)}`, "var(--dim)", {
        kind: "dropped",
        q: quest,
    });
}
function completeRefusal(quest) {
    if (quest.type === "activity") {
        const today = dayKey(new Date());
        return quest.completions.some((day) => day.startsWith(today))
            ? "done_today"
            : null;
    }
    return quest.criteria.some((criterion) => criterion.met !== true)
        ? "crit_unmet"
        : null;
}
export function canComplete(quest) {
    return completeRefusal(quest) === null;
}
export function completeQuest(quest) {
    const refusal = completeRefusal(quest);
    if (refusal !== null) {
        toast(t(refusal), quest.title, refusal === "done_today" ? "var(--dim)" : "var(--danger)", { kind: "refuse", undo: false });
        return;
    }
    if (quest.type === "activity") {
        markRun(quest, dayKey(new Date()));
        return;
    }
    closeAsComplete(quest);
}
function closeAsComplete(quest, alsoChange = () => undefined) {
    const before = level();
    void act([quest], () => {
        alsoChange();
        quest.status = "complete";
    }).then((saved) => {
        if (saved) {
            showDone(saved.rel, before);
        }
    });
}
export function abandonQuest(quest) {
    void act([quest], () => {
        quest.status = "abandoned";
    });
    toast(t("ev_abandoned"), quest.title, "var(--dim)", {
        kind: "abandon",
        q: quest,
    });
}
export function reopenQuest(quest) {
    void act([quest], () => {
        quest.status = "active";
    }, { sound: "new" }).then((saved) => {
        if (saved) {
            showAll();
            ui.view = "log";
            ui.sel = saved.rel;
            render();
        }
    });
}
