import { findField } from "./dom.js";
import { ui } from "./state.js";
export function showAll() {
    Object.assign(ui, {
        type: null,
        guild: null,
        favView: false,
        search: "",
        dueFrom: null,
        dueTo: null,
    });
    const search = findField("#sq");
    if (search) {
        search.value = "";
    }
}
