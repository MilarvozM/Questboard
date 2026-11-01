import { filled } from "../shared/records.js";
import { importText, parseText } from "./api.js";
import { $, esc, field, find, findField, on, svg } from "./dom.js";
import { toast } from "./feedback.js";
import { guildList, guildOf, guildView } from "./guilds.js";
import { TYPE_IC } from "./icons.js";
import { t } from "./i18n.js";
import { closeOverlays } from "./player.js";
import { byRel } from "./quests.js";
import { data, langs, ui } from "./state.js";
import { addDays, dateOrNull, dayKey, hm, longDate, pad } from "./time.js";
import { pushUndo, reload, run, versionOf } from "./undo.js";
const prompts = new Map();
async function promptFor(lang) {
    if (!prompts.has(lang)) {
        const response = await fetch(`/prompts/${lang}.md`);
        prompts.set(lang, response.ok ? await response.text() : null);
    }
    const prompt = prompts.get(lang);
    if (prompt !== null && prompt !== undefined) {
        return prompt;
    }
    return lang === "en" ? "" : promptFor("en");
}
function motto(guild, lang) {
    const raw = data().guilds.find((x) => x.id === guild.id);
    return (raw?.motto ??
        langs.get(lang)?.get(`gm_${guild.id}`) ??
        raw?.name ??
        guild.name);
}
function fillPrompt(template, lang, notes) {
    const now = new Date();
    const offset = -now.getTimezoneOffset();
    const sign = offset >= 0 ? "+" : "-";
    const cfg = data().cfg;
    const today = dayKey(now);
    const values = {
        now: `${today} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
        timezone: `${Intl.DateTimeFormat().resolvedOptions().timeZone} (UTC${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)})`,
        short_max: String(cfg.shortNameMax),
        guilds: guildList()
            .map((guild) => `  ${guild.id} = ${motto(guild, lang)}`)
            .join("\n"),
        example_deadline: `${addDays(today, cfg.promptExampleDays.deadline)}T10:00`,
        example_due: `${addDays(today, cfg.promptExampleDays.due)} 18:00`,
        notes,
    };
    return template.replace(/\{\{(\w+)(?:\|([^}]*))?\}\}/g, (...[, key = "", empty]) => {
        const value = values[key];
        return filled(value) ? value : (empty ?? "");
    });
}
function problemNote(problem) {
    return t(problem.code, problem.code === "w_value" ? problem.key : problem.value);
}
async function renderAiPreview() {
    const text = findField("#ai-answer")?.value ?? "";
    const quests = text.trim() ? await parseText(text) : [];
    const preview = find("#ai-preview");
    if (!preview) {
        return;
    }
    preview.innerHTML =
        quests.length > 0
            ? quests
                .map(({ quest, problems, ok }) => {
                const due = dateOrNull(quest.deadline);
                const guild = guildView(guildOf(quest));
                return `<div class="pcard c-${quest.type} ${ok ? "" : "bad"}"><div class="h">${svg(TYPE_IC[quest.type])}${esc(filled(quest.title) ? quest.title : "—")}</div>
      <div class="m">${t(`${quest.type}_q`)} · ${esc(guild.name)} · ${due ? `${longDate(due)} ${hm(due)}` : t("no_deadline")} · ${t("objectives")} ${String(quest.objectives.length)} · ${t("criteria")} ${String(quest.criteria.length)}</div>
      ${problems.map((problem) => `<div class="w">• ${esc(problemNote(problem))}</div>`).join("")}</div>`;
            })
                .join("")
            : `<p class="i" style="color:var(--faint);margin-top:8px">${t("ai_none")}</p>`;
    const ready = quests.filter((entry) => entry.ok).length;
    const accept = $("[data-aiaccept]");
    if (accept instanceof HTMLButtonElement) {
        accept.disabled = ready === 0;
    }
    accept.textContent = t("ai_accept", ready);
}
export function openAi(head) {
    ui.aiLang ??= ui.lang;
    const languages = [...langs]
        .map(([lang, strings]) => `<button class="${lang === ui.aiLang ? "on" : ""}" data-ailang="${lang}">${esc(strings.get("lang_name") ?? lang)}</button>`)
        .join("");
    $("#drawer").innerHTML = `${head}
    <div class="step"><i><span>1</span></i><div><h3>${t("ai_s1")}</h3>
      <textarea id="ai-notes" rows="5" placeholder="${esc(t("ai_ph"))}"></textarea>
      <div class="row"><div class="seg" id="ai-lang">${languages}</div></div></div></div>
    <div class="step"><i><span>2</span></i><div><h3>${t("ai_s2")}</h3>
      <textarea id="ai-prompt" class="code" rows="7" readonly></textarea>
      <div class="row"><button class="btn sm primary" data-aicopy>${t("copy")}</button></div></div></div>
    <div class="step"><i><span>3</span></i><div><h3>${t("ai_s3")}</h3>
      <textarea id="ai-answer" class="code drop" rows="7" placeholder="---&#10;questboard: 1&#10;title: …"></textarea>
      <div id="ai-preview"></div>
      <div class="actions" style="margin-top:14px"><button class="btn primary" data-aiaccept disabled></button><button class="btn" data-fclose>${t("f_cancel")}</button></div></div></div>`;
    const update = async () => {
        const lang = ui.aiLang ?? ui.lang;
        field("#ai-prompt").value = fillPrompt(await promptFor(lang), lang, field("#ai-notes").value.trim());
    };
    ui.aiUpdate = update;
    field("#ai-notes").addEventListener("input", () => {
        void update();
    });
    const answer = field("#ai-answer");
    let timer;
    answer.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            void renderAiPreview();
        }, data().cfg.importPreviewDelayMs);
    });
    answer.addEventListener("dragover", (event) => {
        event.preventDefault();
        answer.classList.add("over");
    });
    answer.addEventListener("dragleave", () => {
        answer.classList.remove("over");
    });
    on(answer, "drop", (event) => {
        event.preventDefault();
        answer.classList.remove("over");
        void (async () => {
            for (const file of event.dataTransfer?.files ?? []) {
                answer.value += (answer.value ? "\n\n" : "") + (await file.text());
            }
            await renderAiPreview();
        })();
    });
    void update();
    void renderAiPreview();
}
export function acceptImport() {
    const text = field("#ai-answer").value;
    const entry = pushUndo({ items: [], created: [] });
    closeOverlays();
    void run(async () => {
        const rels = await importText(text);
        await reload();
        entry.created.push(...rels.map((rel) => ({ rel, version: versionOf(rel) })));
        toast(t("t_imported"), rels
            .map((rel) => byRel(rel)?.title)
            .filter((title) => title !== undefined)
            .join(" · "), "var(--main)", { kind: "new" });
    });
}
