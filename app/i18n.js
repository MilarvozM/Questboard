import { langs, ui } from "./state.js";
export function t(key, value) {
    const text = langs.get(ui.lang)?.get(key) ?? langs.get("en")?.get(key) ?? key;
    return text.replace("{x}", value === undefined ? "undefined" : String(value));
}
export function locale() {
    return t("locale");
}
export function num(value) {
    return value.toLocaleString(locale());
}
