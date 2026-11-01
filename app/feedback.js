import { $, esc, svg } from "./dom.js";
import { TYPE_IC } from "./icons.js";
import { t } from "./i18n.js";
import { keyLabel } from "./keys.js";
import { doneCount, ticks } from "./quests.js";
import { data, ui } from "./state.js";
import { undoStack } from "./undo.js";
let audio;
let audioFailed = false;
let bannerTimer;
function cueNotes(value) {
    return value
        .split(",")
        .map((note) => note.trim().split(/\s+/).map(Number))
        .flatMap((note) => {
        const [frequency, delay] = note;
        return note.length === 2 &&
            frequency !== undefined &&
            delay !== undefined &&
            Number.isFinite(frequency) &&
            Number.isFinite(delay)
            ? [[frequency, delay]]
            : [];
    });
}
function isWave(value) {
    return ["sine", "square", "sawtooth", "triangle"].includes(value);
}
export function cue(kind) {
    const css = getComputedStyle(document.documentElement);
    const token = (key) => css.getPropertyValue(`--cue-${key}`).trim();
    const notes = cueNotes(token(kind));
    if (!ui.sound ||
        audioFailed ||
        notes.length === 0 ||
        (data().cfg.muteWithReducedMotion &&
            matchMedia("(prefers-reduced-motion: reduce)").matches)) {
        return;
    }
    try {
        audio ??= new AudioContext();
        const start = audio.currentTime + 0.01;
        const length = Number(token("length"));
        const volume = Number(token("volume"));
        const attack = Number(token("attack"));
        const wave = token("wave");
        for (const [frequency, delay] of notes) {
            const oscillator = audio.createOscillator();
            const gain = audio.createGain();
            const at = start + delay;
            if (isWave(wave)) {
                oscillator.type = wave;
            }
            oscillator.frequency.value = frequency;
            gain.gain.setValueAtTime(0.0001, at);
            gain.gain.exponentialRampToValueAtTime(volume, at + attack);
            gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
            oscillator.connect(gain).connect(audio.destination);
            oscillator.start(at);
            oscillator.stop(at + length + 0.05);
        }
    }
    catch {
        audioFailed = true;
    }
}
function questLine(q) {
    const progress = q.type === "activity"
        ? ""
        : `${ticks(q)}<span>${String(doneCount(q))} / ${String(q.objectives.length)}</span>`;
    return `${svg(TYPE_IC[q.type])}<span>${esc(q.title)}</span>${progress}`;
}
export function toast(head, text, color = "var(--main)", { kind = "info", q = null, undo = true } = {}) {
    const banner = $("#banner");
    banner.className = `banner c-${q ? q.type : "main"} ${kind === "done" ? "big" : ""} ${undo && undoStack.length > 0 ? "can-undo" : ""}`;
    banner.style.setProperty("--tc", color);
    const part = (selector) => banner.querySelector(selector);
    const headPart = part(".k");
    const textPart = part(".t");
    const questPart = part(".q");
    const undoPart = part(".undo");
    if (headPart) {
        headPart.textContent = head;
    }
    if (textPart) {
        textPart.textContent = text;
    }
    if (questPart) {
        questPart.innerHTML = q ? questLine(q) : "";
    }
    if (undoPart) {
        undoPart.textContent = `${t("undo")} · ${keyLabel(data().cfg.keys.undo)}`;
    }
    banner.getBoundingClientRect();
    banner.classList.add("on");
    cue(kind);
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
        banner.classList.remove("on");
    }, kind === "done" ? data().cfg.bannerCompleteMs : data().cfg.bannerMs);
}
export function hideToast() {
    clearTimeout(bannerTimer);
    $("#banner").classList.remove("on");
}
export function fillThen(button, then) {
    const icon = button.querySelector(".ic") ?? button;
    button.classList.add("fill");
    const [animation] = icon.getAnimations();
    if (!animation) {
        then();
        return;
    }
    void animation.finished.then(then, then);
}
