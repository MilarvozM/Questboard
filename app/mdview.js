import { fileText } from "./api.js";
import { $, esc } from "./dom.js";
import { toast } from "./feedback.js";
import { t } from "./i18n.js";
import { relOf } from "./quests.js";
import { ui } from "./state.js";
export async function showMd(quest) {
    const rel = relOf(quest);
    const text = await fileText(rel);
    ui.md = { rel, text };
    $("#mdview").innerHTML =
        `<h2>${t("md_title")}<span>${esc(rel)}</span></h2><pre>${esc(text)}</pre>
    <div class="actions"><button class="btn primary" data-mdcopy>${t("copy")}</button><button class="btn" data-mddl>${t("download")}</button>
      <button class="btn" data-mdopen>${t("b_open_editor")}</button><button class="btn" data-fclose>${t("close")}</button></div>`;
    $("#mdview").classList.add("on");
    $("#drawer-back").classList.add("on");
}
export async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        toast(t("copied"), "", "var(--dim)", { kind: "edit", undo: false });
    }
    catch (error) {
        console.warn(error);
    }
}
export function download(name, text) {
    const link = Object.assign(document.createElement("a"), {
        href: URL.createObjectURL(new Blob([text], { type: "text/markdown" })),
        download: name,
    });
    link.click();
    setTimeout(() => {
        URL.revokeObjectURL(link.href);
    }, 1000);
}
