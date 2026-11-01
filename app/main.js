import { isRecord, isStringArray } from "../shared/records.js";
import { onClick } from "./clicks.js";
import { $, find } from "./dom.js";
import { renderFocus } from "./focus.js";
import { onDetailKey, onKey } from "./keyboard.js";
import { load } from "./load.js";
import { openedPick } from "./pick.js";
import { initSearch, render } from "./render.js";
import { data, emblems, ui } from "./state.js";
import { dayKey } from "./time.js";
function isPair(value) {
    return isStringArray(value) && value.length === 2;
}
function isEmblems(value) {
    return (isRecord(value) &&
        Array.isArray(value["pairs"]) &&
        value["pairs"].every(isPair) &&
        isStringArray(value["singles"]) &&
        isRecord(value["icons"]) &&
        Object.values(value["icons"]).every((icon) => typeof icon === "string"));
}
async function loadEmblems() {
    try {
        const response = await fetch("/emblems.json");
        const loaded = await response.json();
        if (isEmblems(loaded)) {
            Object.assign(emblems, loaded);
        }
    }
    catch (error) {
        console.warn(error);
    }
}
async function loadStyles() {
    await Promise.all(data().styles.map(async (style) => new Promise((done) => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = `/styles/${style}.css`;
        link.addEventListener("load", () => {
            done();
        });
        link.addEventListener("error", () => {
            done();
        });
        document.head.append(link);
    })));
}
let reloading;
async function reloadAfterChange() {
    try {
        await load();
        if (ui.edit || openedPick()) {
            ui.stale = true;
        }
        else {
            render();
        }
    }
    catch (error) {
        console.error(error);
    }
}
function listen() {
    const events = new EventSource("/api/events");
    events.addEventListener("change", () => {
        clearTimeout(reloading);
        reloading = setTimeout(() => {
            void reloadAfterChange();
        }, data().cfg.reloadDelayMs);
    });
    events.addEventListener("error", () => {
        $("#lost").classList.add("on");
    });
    events.addEventListener("open", () => {
        if ($("#lost").classList.contains("on")) {
            $("#lost").classList.remove("on");
            void load().then(render);
        }
    });
}
function tick() {
    if (!ui.edit &&
        !openedPick() &&
        document.activeElement?.matches("#detail input, #sq") !== true &&
        !find(".drawer.on, .pop.on, .settings.on, .mdview.on, .pview.on, .results.on, .capbox.on")) {
        render();
    }
}
async function start() {
    ui.month = dayKey(new Date()).slice(0, 7);
    await load();
    await loadEmblems();
    await loadStyles();
    initSearch();
    render();
    document.body.classList.remove("loading");
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onDetailKey, true);
    document.addEventListener("keydown", onKey);
    addEventListener("resize", renderFocus);
    listen();
    setInterval(tick, data().cfg.redrawSeconds * 1000);
}
void start();
