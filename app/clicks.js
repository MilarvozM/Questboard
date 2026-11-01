import { filled } from "../shared/records.js";
import { includes, QUEST_TYPES, STEP_STATES, } from "../shared/types.js";
import { abandonQuest, changeGuild, changeType, canComplete, completeQuest, deleteQuest, markRun, reopenObjective, reopenQuest, setDeadline, setObjective, setRepeat, setSLine, setStepDue, skipRun, splitStep, toggleCrit, toggleFav, toggleTrack, track, untrack, addLog, } from "./actions.js";
import { acceptImport } from "./ai.js";
import { openFile } from "./api.js";
import { closePop, openPop } from "./calendar.js";
import { captureDue, captureValue, closeCapbox, openCapbox, setCaptureDue, toggleCaptureGuild, toggleCaptureType, } from "./capture.js";
import { renderDetail, isEditing } from "./detail.js";
import { $, closest, elementOf, field } from "./dom.js";
import { commitEdit, draftDel, isPart, pathOf, readDraft, startEdit, } from "./editing.js";
import { cue, fillThen } from "./feedback.js";
import { openForm, renderWhen, submitForm } from "./form.js";
import { addGuild, guildMenu } from "./guild-actions.js";
import { guildList, guildOf, guildView } from "./guilds.js";
import { emblem, IC, TYPE_IC } from "./icons.js";
import { t } from "./i18n.js";
import { copyText, download, showMd } from "./mdview.js";
import { closePick, menu, openedPick } from "./pick.js";
import { pickDate, pickRange, pickRepeat } from "./pickers.js";
import { closeOverlays, importPlayer, openPlayer, pickPlayerFile, renderPlayer, } from "./player.js";
import { byRel, current, focusQuest, relOf, SORTS } from "./quests.js";
import { renderFocus } from "./focus.js";
import { render } from "./render.js";
import { closeDone } from "./results.js";
import { showAll } from "./search.js";
import { renderSettings, setSettings } from "./settings.js";
import { clock, data, ui, } from "./state.js";
import { dayKey, pad } from "./time.js";
import { run, undo } from "./undo.js";
function stepState(value) {
    return includes(STEP_STATES, value) ? value : null;
}
function questAt(rel) {
    return filled(rel) ? byRel(rel) : undefined;
}
function selected() {
    return data().quests.find((quest) => relOf(quest) === ui.sel);
}
function cycleStyle() {
    const styles = data().styles;
    const next = styles[(styles.indexOf(ui.theme) + 1) % styles.length];
    if (next !== undefined) {
        void setSettings({ style: next });
    }
}
function captureClick(button, d) {
    if ("fab" in d) {
        if ($("#capbox").classList.contains("on")) {
            closeCapbox();
        }
        else {
            openCapbox();
        }
        return true;
    }
    const type = d["ctype"];
    if (includes(QUEST_TYPES, type)) {
        toggleCaptureType(type);
        return true;
    }
    const guild = d["cguild"];
    if (filled(guild)) {
        toggleCaptureGuild(guild);
        return true;
    }
    if ("cdue" in d) {
        pickDate(button, captureDue(), setCaptureDue);
        return true;
    }
    if ("capx" in d) {
        const value = captureValue();
        closeCapbox();
        openForm(value);
        return true;
    }
    return false;
}
function playerClick(d) {
    if ("player" in d) {
        openPlayer();
        return true;
    }
    const by = d["pby"];
    if (by === "type" || by === "guild") {
        ui.pby = by;
        renderPlayer();
        return true;
    }
    if ("pexport" in d) {
        Object.assign(document.createElement("a"), {
            href: "/api/player",
            download: "player.json",
        }).click();
        return true;
    }
    if ("pimport" in d) {
        pickPlayerFile();
        return true;
    }
    const mode = d["pimp"];
    if (mode === "add" || mode === "replace") {
        importPlayer(mode);
        return true;
    }
    if ("pimpcancel" in d) {
        $("#imp").classList.remove("on");
        return true;
    }
    return false;
}
function settingsClick(d) {
    if ("settings" in d) {
        renderSettings();
        $("#settings").classList.toggle("on");
        return true;
    }
    if ("skin" in d) {
        cycleStyle();
        return true;
    }
    const themeSet = d["themeSet"];
    if (filled(themeSet)) {
        void setSettings({ style: themeSet });
        return true;
    }
    const sound = d["sound"];
    if (filled(sound)) {
        void setSettings({ sound: sound === "1" });
        return true;
    }
    const weekStart = d["ws"];
    if (filled(weekStart)) {
        void setSettings({ weekStart: weekStart === "1" ? "monday" : "sunday" });
        return true;
    }
    const lang = d["lang"];
    if (filled(lang)) {
        void setSettings({ language: lang });
        return true;
    }
    if ("sfxtest" in d) {
        cue("done");
        return true;
    }
    return false;
}
function questButtonClick(button, d) {
    const actDone = d["actdone"];
    if (filled(actDone)) {
        const [rel, day = ""] = actDone.split("|");
        closePop();
        const quest = questAt(rel);
        if (quest) {
            markRun(quest, day);
        }
        return true;
    }
    const reopen = questAt(d["reopenq"]);
    if (reopen) {
        reopenQuest(reopen);
        return true;
    }
    if ("undo" in d) {
        undo();
        return true;
    }
    const favorite = questAt(d["fav"]);
    if (favorite) {
        toggleFav(favorite);
        return true;
    }
    const tracked = questAt(d["trackid"]);
    if (tracked) {
        track(tracked);
        return true;
    }
    if ("untrack" in d) {
        const quest = data().quests.find((x) => x.tracked === true);
        if (quest) {
            untrack(quest);
        }
        return true;
    }
    const focusState = stepState(d["fset"]);
    if (focusState) {
        const quest = focusQuest();
        const leaf = quest ? current(quest) : undefined;
        if (quest && leaf) {
            setObjective(quest, leaf.path, focusState);
        }
        return true;
    }
    if ("complete" in d) {
        const quest = button.closest("#focus") ? focusQuest() : selected();
        if (quest && canComplete(quest)) {
            fillThen(button, () => {
                completeQuest(quest);
            });
        }
        else if (quest) {
            completeQuest(quest);
        }
        return true;
    }
    if ("tracktoggle" in d) {
        const quest = selected();
        if (quest) {
            toggleTrack(quest);
        }
        return true;
    }
    return false;
}
function resultsClick(d) {
    if ("close" in d) {
        closeDone();
        return true;
    }
    if ("goj" in d) {
        closeDone();
        ui.view = "journal";
        render();
        return true;
    }
    return false;
}
function formClick(button, d) {
    const tab = d["dtab"];
    if (tab === "write" || tab === "ai") {
        openForm(ui.form?.prefill, tab);
        return true;
    }
    const form = ui.form;
    const type = d["ftype"];
    if (form && includes(QUEST_TYPES, type)) {
        form.type = type;
        for (const other of document.querySelectorAll("[data-ftype]")) {
            other.classList.toggle("on", other === button);
        }
        renderWhen();
        return true;
    }
    const guild = d["fguild"];
    if (form && filled(guild)) {
        form.guild = guild;
        for (const other of document.querySelectorAll("[data-fguild]")) {
            other.classList.toggle("on", other === button);
        }
        return true;
    }
    const date = d["fdate"];
    if (form && (date === "due" || date === "target")) {
        pickDate(button, form[date], (value) => {
            form[date] = value || null;
            renderWhen();
        });
        return true;
    }
    if (form && "frepeat" in d) {
        pickRepeat(button, form.repeat, (repeat) => {
            form.repeat = repeat;
            renderWhen();
        });
        return true;
    }
    if ("fsubmit" in d) {
        submitForm();
        return true;
    }
    return false;
}
function importClick(button, d) {
    const lang = d["ailang"];
    if (filled(lang)) {
        ui.aiLang = lang;
        for (const other of document.querySelectorAll("[data-ailang]")) {
            other.classList.toggle("on", other === button);
        }
        void ui.aiUpdate?.();
        return true;
    }
    if ("aicopy" in d) {
        void copyText(field("#ai-prompt").value);
        return true;
    }
    if ("aiaccept" in d) {
        acceptImport();
        return true;
    }
    const md = ui.md;
    if (md && "mdcopy" in d) {
        void copyText(md.text);
        return true;
    }
    if (md && "mddl" in d) {
        download(md.rel.split("/").pop() ?? md.rel, md.text);
        return true;
    }
    if (md && "mdopen" in d) {
        void run(async () => {
            await openFile(md.rel);
        });
        return true;
    }
    return false;
}
function isFold(value) {
    return value === "favorites" || value === "types" || value === "guilds";
}
function railClick(button, d) {
    const section = d["fold"];
    if (isFold(section)) {
        const fold = { ...ui.fold, [section]: !ui.fold[section] };
        ui.fold = fold;
        render();
        void setSettings({ fold });
        return true;
    }
    if ("favview" in d) {
        ui.favView = !ui.favView;
        ui.view = "log";
        render();
        return true;
    }
    if ("gadd" in d) {
        addGuild(button);
        return true;
    }
    const guildMenuId = d["gmenu"];
    if (filled(guildMenuId)) {
        guildMenu(guildMenuId, button);
        return true;
    }
    if ("sort" in d) {
        menu(button, Object.keys(SORTS).map((key) => ({
            label: t(`sort_${key}`),
            on: ui.sort === key,
            act: () => {
                ui.sort = key;
                render();
                void setSettings({ listSort: key });
            },
        })));
        return true;
    }
    if ("grouping" in d) {
        ui.group = !ui.group;
        render();
        void setSettings({ listGroup: ui.group });
        return true;
    }
    return false;
}
function questMenu(quest, button) {
    menu(button, [
        {
            icon: IC.log,
            label: t("b_log"),
            act: () => {
                addLog(quest, button);
            },
        },
        {
            icon: IC.md,
            label: t("b_md"),
            act: () => {
                void showMd(quest);
            },
        },
        "sep",
        quest.type === "activity"
            ? {
                icon: IC.skip,
                label: t("b_skip"),
                act: () => {
                    skipRun(quest);
                },
            }
            : {
                icon: IC.dropped,
                label: t("b_abandon"),
                act: () => {
                    abandonQuest(quest);
                },
            },
        {
            icon: IC.trash,
            label: t("b_delete"),
            cls: "danger",
            act: () => {
                deleteQuest(quest);
            },
        },
    ]);
}
function detailEditClick(quest, button, d) {
    const part = d["edit"];
    if (filled(part) && isPart(part)) {
        if (isEditing(quest, part)) {
            commitEdit();
        }
        else {
            startEdit(quest, part);
        }
        return true;
    }
    if ("ordered" in d) {
        readDraft();
        const edit = ui.edit;
        if (edit?.part === "objectives") {
            edit.ordered = !edit.ordered;
        }
        renderDetail();
        return true;
    }
    if ("itemdel" in d) {
        draftDel(pathOf(button));
        return true;
    }
    return false;
}
function detailMenuClick(quest, button, d) {
    if ("typeb" in d) {
        menu(button, QUEST_TYPES.map((type) => ({
            icon: TYPE_IC[type],
            label: t(`${type}_q`),
            on: quest.type === type,
            act: () => {
                changeType(quest, type, button);
            },
        })));
        return true;
    }
    if ("guildb" in d) {
        menu(button, [...guildList(), guildView("none")].map((guild) => ({
            icon: emblem(guild),
            label: guild.name,
            on: guildOf(quest) === guild.id,
            act: () => {
                changeGuild(quest, guild.id);
            },
        })));
        return true;
    }
    if ("qmenu" in d) {
        questMenu(quest, button);
        return true;
    }
    return false;
}
function detailStepClick(quest, button, d) {
    if ("deadline" in d) {
        setDeadline(quest, button);
        return true;
    }
    if ("sline" in d) {
        setSLine(quest, button);
        return true;
    }
    const dueAt = d["sdueAt"];
    if (filled(dueAt)) {
        setStepDue(quest, dueAt.split(".").map(Number), button);
        return true;
    }
    if ("repeat" in d) {
        setRepeat(quest, button);
        return true;
    }
    const state = stepState(d["set"]);
    if (state) {
        setObjective(quest, pathOf(button), state);
        return true;
    }
    if ("reopen" in d) {
        reopenObjective(quest, pathOf(button));
        return true;
    }
    if ("sdue" in d) {
        setStepDue(quest, pathOf(button), button);
        return true;
    }
    if ("split" in d) {
        splitStep(quest, pathOf(button));
        return true;
    }
    const criterion = d["crit"];
    if (criterion !== undefined) {
        toggleCrit(quest, Number(criterion));
        return true;
    }
    return false;
}
function navigate(d) {
    const view = d["v"];
    const type = d["type"];
    const guild = d["guild"];
    if (view === "log" || view === "cal" || view === "journal") {
        ui.view = view;
    }
    else if (includes(QUEST_TYPES, type)) {
        ui.type = ui.type === type ? null : type;
        ui.favView = false;
    }
    else if (filled(guild)) {
        ui.guild = ui.guild === guild ? null : guild;
        ui.favView = false;
    }
    else if (filled(d["q"])) {
        if (ui.sel !== d["q"] && ui.edit) {
            commitEdit();
        }
        ui.sel = d["q"];
    }
    else if (filled(d["j"])) {
        ui.jsel = d["j"];
    }
    else if ("switch" in d) {
        ui.switchOpen = !ui.switchOpen;
        renderFocus();
        return false;
    }
    else if (filled(d["cal"])) {
        const [year = 0, month = 1] = ui.month.split("-").map(Number);
        const shown = new Date(year, month - 1 + Number(d["cal"]), 1);
        ui.month =
            d["cal"] === "0"
                ? dayKey(clock.now).slice(0, 7)
                : `${String(shown.getFullYear())}-${pad(shown.getMonth() + 1)}`;
    }
    else if (filled(d["open"])) {
        showAll();
        ui.view = "log";
        ui.sel = d["open"];
    }
    else if (filled(d["openj"])) {
        showAll();
        ui.view = "journal";
        ui.jsel = d["openj"];
    }
    else {
        return false;
    }
    return true;
}
function buttonClick(button) {
    const d = button.dataset;
    const pop = d["pop"];
    if (filled(pop)) {
        openPop(pop, button);
        return;
    }
    if (settingsClick(d) || captureClick(button, d)) {
        return;
    }
    if ("range" in d) {
        pickRange(button, (from, to) => {
            ui.dueFrom = from;
            ui.dueTo = to;
            render();
        });
        return;
    }
    if ("rangeX" in d) {
        ui.dueFrom = null;
        ui.dueTo = null;
        render();
        return;
    }
    if (playerClick(d)) {
        return;
    }
    if ("fclose" in d) {
        closeOverlays();
        return;
    }
    const mode = d["calmode"];
    if (filled(mode)) {
        void setSettings({ calendarMode: mode });
        return;
    }
    if (questButtonClick(button, d) ||
        resultsClick(d) ||
        formClick(button, d) ||
        importClick(button, d) ||
        railClick(button, d)) {
        return;
    }
    const quest = selected();
    if (quest &&
        button.closest("#detail") &&
        (detailEditClick(quest, button, d) ||
            detailMenuClick(quest, button, d) ||
            detailStepClick(quest, button, d))) {
        return;
    }
    if (navigate(d)) {
        render();
    }
}
export function onClick(event) {
    const target = elementOf(event.target);
    const pick = openedPick();
    if (pick) {
        if (target?.closest("#pick")) {
            pick.on(event);
            return;
        }
        const again = target !== null && pick.anchor.contains(target);
        closePick();
        if (again) {
            return;
        }
    }
    if (!target?.closest("#settings, [data-settings]")) {
        $("#settings").classList.remove("on");
    }
    if (!target?.closest("#capbox, #fab, #pick, #drawer") &&
        $("#capbox").classList.contains("on")) {
        closeCapbox();
    }
    if (ui.edit && !target?.closest("#detail .sect, #detail .title-row")) {
        commitEdit();
    }
    const button = closest(event.target, "button, [data-q], [data-j], [data-fclose]");
    if (!button) {
        if (!target?.closest("#pop")) {
            closePop();
        }
        if (ui.switchOpen && !target?.closest(".menu")) {
            ui.switchOpen = false;
            renderFocus();
        }
        return;
    }
    buttonClick(button);
}
