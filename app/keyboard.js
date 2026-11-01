import { addCriterion, addLog, addObjective, completeQuest, toggleFav, toggleTrack, } from "./actions.js";
import { closePop } from "./calendar.js";
import { closeCapbox, openCapbox } from "./capture.js";
import { $, elementOf, field, find, isTextField } from "./dom.js";
import { cancelEdit, commitEdit, draftAdd, pathOf } from "./editing.js";
import { renderFocus } from "./focus.js";
import { openForm } from "./form.js";
import { keyMatch } from "./keys.js";
import { showMd } from "./mdview.js";
import { closePick, openedPick } from "./pick.js";
import { closeOverlays } from "./player.js";
import { relOf } from "./quests.js";
import { render } from "./render.js";
import { closeDone } from "./results.js";
import { data, ui } from "./state.js";
import { undo } from "./undo.js";
function selected() {
    return data().quests.find((quest) => relOf(quest) === ui.sel);
}
export function onDetailKey(event) {
    const target = elementOf(event.target);
    if (event.isComposing || !target?.closest("#detail")) {
        return;
    }
    if (keyMatch(event, data().cfg.keys.close) && ui.edit) {
        event.stopPropagation();
        cancelEdit();
        return;
    }
    if (event.key !== "Enter" || !isTextField(target)) {
        return;
    }
    if (target.id === "ed-title") {
        event.preventDefault();
        commitEdit();
        return;
    }
    if (target.id === "ed-brief" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        commitEdit();
        return;
    }
    const text = target.value.trim();
    if ("itemtext" in target.dataset) {
        event.preventDefault();
        draftAdd(pathOf(target));
        return;
    }
    if ("newitem" in target.dataset) {
        event.preventDefault();
        if (text) {
            draftAdd(null, text);
        }
        else {
            commitEdit();
        }
        return;
    }
    const quest = selected();
    if (!quest || !text) {
        return;
    }
    if ("addob" in target.dataset) {
        addObjective(quest, text);
    }
    else if ("addcrit" in target.dataset) {
        addCriterion(quest, text);
    }
}
function closeEverything() {
    if (openedPick()) {
        closePick();
        return;
    }
    ui.switchOpen = false;
    closePop();
    closeOverlays();
    closeCapbox();
    $("#settings").classList.remove("on");
    closeDone();
    renderFocus();
}
function resultsKey(event) {
    const keys = data().cfg.keys;
    if (keyMatch(event, keys.debrief)) {
        event.preventDefault();
        field("#debrief").focus();
    }
    else if (keyMatch(event, keys.openJournal)) {
        closeDone();
        ui.view = "journal";
        render();
    }
}
function questKey(event, quest) {
    const keys = data().cfg.keys;
    if (keyMatch(event, keys.track)) {
        toggleTrack(quest);
    }
    else if (keyMatch(event, keys.favorite)) {
        toggleFav(quest);
    }
    else if (keyMatch(event, keys.complete)) {
        completeQuest(quest);
    }
    else if (keyMatch(event, keys.logEntry)) {
        addLog(quest, $("#detail [data-qmenu]"));
    }
    else if (keyMatch(event, keys.markdown)) {
        void showMd(quest);
    }
}
export function onKey(event) {
    const keys = data().cfg.keys;
    if (event.isComposing) {
        return;
    }
    if (keyMatch(event, keys.close)) {
        closeEverything();
        return;
    }
    if (elementOf(event.target)?.closest("input, textarea, select")) {
        return;
    }
    if ($("#done").classList.contains("on")) {
        resultsKey(event);
        return;
    }
    if (keyMatch(event, keys.undo)) {
        event.preventDefault();
        undo();
        return;
    }
    if (find(".drawer.on, .mdview.on, .pview.on")) {
        return;
    }
    if (keyMatch(event, keys.capture)) {
        event.preventDefault();
        openCapbox();
        return;
    }
    if (keyMatch(event, keys.newQuest)) {
        event.preventDefault();
        openForm();
        return;
    }
    if (keyMatch(event, keys.search)) {
        event.preventDefault();
        field("#sq").focus();
        return;
    }
    const views = [
        [keys.viewLog, "log"],
        [keys.viewCalendar, "cal"],
        [keys.viewJournal, "journal"],
    ];
    const view = views.find(([binding]) => keyMatch(event, binding));
    if (view) {
        ui.view = view[1];
        render();
        return;
    }
    const quest = ui.view === "log" ? selected() : undefined;
    if (quest) {
        questKey(event, quest);
    }
}
