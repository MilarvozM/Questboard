import { $, closest, esc, findField, on, placeNear, svg } from "./dom.js";
import { IC } from "./icons.js";
import { render } from "./render.js";
import { ui } from "./state.js";
let opened = null;
export function openedPick() {
    return opened;
}
export function openPick(anchor, html, handle, cls = "") {
    const panel = $("#pick");
    panel.innerHTML = html;
    panel.className = `pick frame on ${cls}`;
    opened = { on: handle, anchor };
    placeNear(panel, anchor);
    findField("#pick input, #pick textarea")?.focus();
}
export function closePick() {
    $("#pick").classList.remove("on");
    opened = null;
    if (ui.stale) {
        ui.stale = false;
        setTimeout(render);
    }
}
export function menu(anchor, items) {
    const html = items
        .map((item, i) => item === "sep"
        ? '<div class="sep"></div>'
        : `<button class="mi ${item.cls ?? ""} ${item.on === true ? "on" : ""}" data-mi="${String(i)}">${item.icon === undefined ? "<span></span>" : svg(item.icon)}<span>${item.label}</span></button>`)
        .join("");
    openPick(anchor, html, (event) => {
        const button = closest(event.target, "[data-mi]");
        const item = items[Number(button?.dataset["mi"])];
        if (!button || item === undefined || item === "sep") {
            return;
        }
        if (item.confirm !== undefined && !button.classList.contains("sure")) {
            button.classList.add("sure");
            const label = button.lastElementChild;
            if (label) {
                label.textContent = item.confirm;
            }
            return;
        }
        closePick();
        item.act();
    }, "menu-p");
}
export function ask(anchor, { icon = IC.pencil, value = "", multi = false }, done) {
    const input = multi
        ? `<textarea rows="3">${esc(value)}</textarea>`
        : `<input value="${esc(value)}">`;
    let finish = () => undefined;
    openPick(anchor, `<div class="ask">${svg(icon)}${input}<button class="ib" data-ok>${svg(IC.check)}</button></div>`, (event) => {
        if (closest(event.target, "[data-ok]")) {
            finish();
        }
    }, "ask-p");
    const answer = findField("#pick input, #pick textarea");
    if (!answer) {
        return;
    }
    answer.select();
    finish = () => {
        const text = answer.value.trim();
        closePick();
        if (text) {
            done(text);
        }
    };
    on(answer, "keydown", (event) => {
        if (event.isComposing) {
            return;
        }
        if (event.key === "Enter" &&
            (!multi || event.ctrlKey || event.metaKey || !event.shiftKey)) {
            event.preventDefault();
            finish();
        }
    });
}
