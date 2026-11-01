import { copyOf } from "../shared/records.js";
import { QUEST_TYPES } from "../shared/types.js";
import { postPlayer } from "./api.js";
import { $, esc, find, svg } from "./dom.js";
import { toast } from "./feedback.js";
import { guildList, guildView } from "./guilds.js";
import { emblem, IC, TYPE_IC } from "./icons.js";
import { num, t } from "./i18n.js";
import { level } from "./quests.js";
import { clock, data, ui } from "./state.js";
import { addDays, dayKey, noonOf, pad } from "./time.js";
import { pushUndo, reload, run } from "./undo.js";
const PERIODS = ["today", "week", "month", "year"];
function periodTests() {
    const today = dayKey(clock.now);
    const weekFrom = addDays(today, -((noonOf(today).getDay() - ui.weekStart + 7) % 7));
    return {
        today: (day) => day === today,
        week: (day) => day >= weekFrom && day <= today,
        month: (day) => day.slice(0, 7) === today.slice(0, 7),
        year: (day) => day.slice(0, 4) === today.slice(0, 4),
    };
}
function sumOver(test, pick) {
    let total = 0;
    for (const [day, guilds] of Object.entries(data().player.days)) {
        if (test(day)) {
            for (const [guild, bucket] of Object.entries(guilds)) {
                total += pick(bucket, guild) || 0;
            }
        }
    }
    return total;
}
function cells(pick, xpPick) {
    const tests = periodTests();
    return PERIODS.map((period) => {
        const value = sumOver(tests[period], pick);
        const xp = xpPick && value
            ? `<small>${num(sumOver(tests[period], xpPick))} XP</small>`
            : "";
        return `<td class="${value ? "" : "z"}">${num(value)}${xp}</td>`;
    }).join("");
}
function guildRows() {
    const listed = guildList();
    const ids = new Set(Object.values(data().player.days).flatMap((guilds) => Object.keys(guilds)));
    const unlisted = [...ids]
        .filter((id) => id !== "none" && !listed.some((guild) => guild.id === id))
        .map((id) => data().guilds.some((guild) => guild.id === id)
        ? guildView(id)
        : { id, name: id, motto: "", emblem: "none" });
    return [...listed, ...unlisted, { ...guildView("none"), id: "none" }];
}
function typeRows() {
    const byType = QUEST_TYPES.map((type) => `<tr><td><span class="rl c-${type}">${svg(TYPE_IC[type])}${t(type)}</span></td>${cells((bucket) => bucket[type] ?? 0)}</tr>`).join("");
    return `${byType}<tr><td><span class="rl" style="--c:var(--danger)">${svg(IC.failed)}${t("abandoned")}</span></td>${cells((bucket) => bucket.abandoned ?? 0)}</tr><tr class="xp"><td><span class="rl">XP</span></td>${cells((bucket) => bucket.xp ?? 0)}</tr>`;
}
function rows() {
    if (ui.pby === "type") {
        return typeRows();
    }
    return guildRows()
        .map((row) => {
        const quests = (bucket, guild) => guild === row.id
            ? (bucket.main ?? 0) + (bucket.side ?? 0) + (bucket.activity ?? 0)
            : 0;
        const xp = (bucket, guild) => guild === row.id ? (bucket.xp ?? 0) : 0;
        return `<tr><td><span class="rl">${svg(emblem(row))}${esc(row.name)}</span></td>${cells(quests, xp)}</tr>`;
    })
        .join("");
}
export function renderPlayer() {
    const { lv, xp, need } = level();
    const views = ["type", "guild"]
        .map((by) => `<button class="${ui.pby === by ? "on" : ""}" data-pby="${by}">${t(`by_${by}`)}</button>`)
        .join("");
    const heads = PERIODS.map((period) => `<th>${t(`p_${period}`)}</th>`).join("");
    $("#pview").innerHTML = `
    <div class="p-head"><div class="hexclip"><div><small>LV</small><strong>${pad(lv)}</strong></div></div>
      <div><h2>${t("player")}</h2><div class="xpgain"><div class="row"><span>XP ${num(xp)} / ${num(need)}</span><b>${t("to_next", num(need - xp))}</b></div><div class="bar"><i style="width:${String((xp / need) * 100)}%"></i></div></div></div>
      <div class="seg">${views}</div></div>
    <table class="ptable"><thead><tr><th></th>${heads}</tr></thead><tbody>${rows()}</tbody></table>
    <div class="p-foot"><button class="btn sm" data-pexport>${t("export")}</button><button class="btn sm" data-pimport>${t("import")}</button>
      <span class="note">${t("numbers_only")}</span><button class="btn sm" data-fclose>${t("close")}</button></div>
    <div class="imp" id="imp"><p>${t("imp_q")}</p><div class="actions"><button class="btn sm primary" data-pimp="add">${t("imp_add")}</button>
      <button class="btn sm" data-pimp="replace">${t("imp_replace")}</button><button class="btn sm" data-pimpcancel>${t("cancel")}</button></div></div>`;
}
export function openPlayer() {
    renderPlayer();
    $("#pview").classList.add("on");
    $("#drawer-back").classList.add("on");
}
export function closeOverlays() {
    for (const selector of ["#pview", "#drawer-back", "#drawer", "#mdview"]) {
        $(selector).classList.remove("on");
    }
}
async function readPlayerFile(file) {
    try {
        if (!file) {
            throw new Error("No file was picked");
        }
        ui.pimport = JSON.parse(await file.text());
        $("#imp").classList.add("on");
    }
    catch {
        toast(t("imp_bad"), file?.name ?? "", "var(--danger)", {
            kind: "refuse",
            undo: false,
        });
    }
}
export function pickPlayerFile() {
    const input = Object.assign(document.createElement("input"), {
        type: "file",
        accept: ".json,application/json",
    });
    input.addEventListener("change", () => {
        void readPlayerFile(input.files?.[0]);
    });
    input.click();
}
export function importPlayer(mode) {
    const before = copyOf(data().player);
    find("#imp")?.classList.remove("on");
    void run(async () => {
        await postPlayer(mode, ui.pimport);
        pushUndo({ items: [], created: [], player: before });
        await reload();
        toast(t(`t_imp_${mode}`), "player.json", "var(--main)", { kind: "write" });
    });
}
