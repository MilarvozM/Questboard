const ESCAPES = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
};
export function esc(text) {
    return String(text ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}
export function svg(inner, cls = "") {
    return `<svg class="ic ${cls}" viewBox="0 0 24 24">${inner}</svg>`;
}
export function find(selector) {
    const element = document.querySelector(selector);
    return element instanceof HTMLElement ? element : null;
}
export function $(selector) {
    const element = find(selector);
    if (!element) {
        throw new Error(`The page has no ${selector}`);
    }
    return element;
}
export function isTextField(element) {
    return (element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement);
}
export function findField(selector) {
    const element = document.querySelector(selector);
    return isTextField(element) ? element : null;
}
export function field(selector) {
    const element = findField(selector);
    if (!element) {
        throw new Error(`The page has no field ${selector}`);
    }
    return element;
}
export function elementOf(target) {
    return target instanceof Element ? target : null;
}
export function closest(target, selector) {
    const found = elementOf(target)?.closest(selector);
    return found instanceof HTMLElement ? found : null;
}
export function all(selector, root = document) {
    return [...root.querySelectorAll(selector)].filter((element) => element instanceof HTMLElement);
}
export function placeNear(panel, anchor) {
    const box = anchor.getBoundingClientRect();
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    let top = box.bottom + 6;
    if (top + height > innerHeight - 12) {
        top = Math.max(12, box.top - height - 6);
    }
    panel.style.left = `${String(Math.max(12, Math.min(box.left, innerWidth - width - 12)))}px`;
    panel.style.top = `${String(top)}px`;
}
export function on(element, type, listener) {
    element.addEventListener(type, listener);
}
