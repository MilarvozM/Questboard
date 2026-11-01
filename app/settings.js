import { putSettings } from "./api.js";
import { $, esc } from "./dom.js";
import { t } from "./i18n.js";
import { applySettings } from "./load.js";
import { render } from "./render.js";
import { data, langs, ui } from "./state.js";
function toggle(name, buttons) {
    return `<div class="fld"><span>${t(name)}</span><div class="toggle">${buttons}</div></div>`;
}
export function renderSettings() {
    const { styles, paths } = data();
    const styleButtons = styles
        .map((style) => `<button class="${ui.theme === style ? "on" : ""}" data-theme-set="${esc(style)}"><div class="sw ${esc(style)}"></div><b>${t(`st_${style}`)}</b><small>${t(`st_${style}_d`)}</small></button>`)
        .join("");
    const sound = `<button class="${ui.sound ? "on" : ""}" data-sound="1">${t("on")}</button><button class="${ui.sound ? "" : "on"}" data-sound="0">${t("off")}</button>
      <button data-sfxtest>${t("test")} ▸</button>`;
    const weekStart = [0, 1]
        .map((n) => `<button class="${ui.weekStart === n ? "on" : ""}" data-ws="${String(n)}">${t(`ws_${String(n)}`)}</button>`)
        .join("");
    const languages = [...langs]
        .map(([lang, strings]) => `<button class="${ui.lang === lang ? "on" : ""}" data-lang="${lang}">${esc(strings.get("lang_name") ?? lang)}</button>`)
        .join("");
    const pathRows = [
        ["data_folder", paths.dataDir],
        ["config_file", paths.config],
        ["start_command", paths.start],
    ]
        .map(([key, value]) => `<div class="fld"><span>${t(key)}</span><code class="path">${esc(value)}</code></div>`)
        .join("");
    $("#settings").innerHTML = `
    <div class="fld"><span>${t("style")}</span><div class="styles">${styleButtons}</div></div>
    ${toggle("sound", sound)}
    ${toggle("week_start", weekStart)}
    ${toggle("language", languages)}
    ${pathRows}
    <div class="fld"><a class="btn sm" href="/api/export" download>${t("export_all")}</a></div>`;
}
export async function setSettings(values) {
    try {
        applySettings(await putSettings(values));
    }
    catch (error) {
        console.error(error);
    }
    render();
}
