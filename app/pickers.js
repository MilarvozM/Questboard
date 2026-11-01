import { filled } from "../shared/records.js";
import { closest, field, svg } from "./dom.js";
import { IC } from "./icons.js";
import { t } from "./i18n.js";
import { closePick, openPick } from "./pick.js";
import { emblems, ui } from "./state.js";
import { addDays, dayKey, fmt, noonOf, normDate } from "./time.js";
function monthGrid(month) {
    const [year = 0, monthNumber = 1] = month.split("-").map(Number);
    const lead = (new Date(year, monthNumber - 1, 1).getDay() - ui.weekStart + 7) % 7;
    const last = new Date(year, monthNumber, 0).getDate();
    const start = addDays(`${month}-01`, -lead);
    return [...Array(Math.ceil((lead + last) / 7) * 7).keys()].map((i) => addDays(start, i));
}
function openCalendar(calendar, withTime, clear) {
    const [startDay = "", time = ""] = (calendar.value ?? "").split(" ");
    let month = (startDay || dayKey(new Date())).slice(0, 7);
    let first = null;
    const draw = () => {
        const days = monthGrid(month);
        const today = dayKey(new Date());
        const timeRow = withTime
            ? `<div class="dp-time">${svg(IC.clock)}<input id="dp-t" value="${time}" placeholder="--:--" maxlength="5">
        ${filled(calendar.value ?? undefined) ? `<button class="ib" data-dclear title="${t("clear")}">${svg(IC.trash)}</button>` : ""}</div>`
            : "";
        const weekdays = days
            .slice(0, 7)
            .map((day) => `<i>${fmt(noonOf(day), { weekday: "narrow" })}</i>`)
            .join("");
        const buttons = days
            .map((day) => `<button class="${day.slice(0, 7) !== month ? "out" : ""} ${day === today ? "today" : ""} ${calendar.isOn(day, first) ? "on" : ""}" data-dd="${day}">${String(Number(day.slice(8)))}</button>`)
            .join("");
        openPick(calendar.anchor, `${timeRow}
      <div class="dp-head"><button class="ib" data-dm="-1">‹</button><b>${fmt(noonOf(`${month}-01`), { month: "long", year: "numeric" })}</b><button class="ib" data-dm="1">›</button></div>
      <div class="dp-grid">${weekdays}
        ${buttons}</div>`, (event) => {
            const button = closest(event.target, "button");
            if (!button) {
                return;
            }
            const step = button.dataset["dm"];
            if (filled(step)) {
                const shown = new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1 + Number(step), 1);
                month = dayKey(shown).slice(0, 7);
                draw();
                return;
            }
            if ("dclear" in button.dataset) {
                closePick();
                clear();
                return;
            }
            const day = button.dataset["dd"];
            if (!filled(day)) {
                return;
            }
            if (calendar.pick(day, first) === "redraw") {
                first = day;
                draw();
            }
        }, "date-p");
    };
    draw();
}
export function pickDate(anchor, value, done) {
    const [startDay = ""] = (value ?? "").split(" ");
    openCalendar({
        anchor,
        value,
        isOn: (day) => day === startDay,
        pick: (day) => {
            const timeField = field("#dp-t");
            const time = timeField.value.trim();
            const picked = normDate(time ? `${day} ${time}` : day);
            if (picked === null) {
                timeField.classList.add("bad");
                return "done";
            }
            closePick();
            done(picked);
            return "done";
        },
    }, true, () => {
        done("");
    });
}
export function pickRange(anchor, done) {
    openCalendar({
        anchor,
        value: null,
        isOn: (day, first) => {
            if (first !== null) {
                return day === first;
            }
            const from = ui.dueFrom;
            return from !== null && day >= from && day <= (ui.dueTo ?? from);
        },
        pick: (day, first) => {
            if (first === null) {
                return "redraw";
            }
            closePick();
            if (first <= day) {
                done(first, day);
            }
            else {
                done(day, first);
            }
            return "done";
        },
    }, false, () => undefined);
}
export function pickRepeat(anchor, value, done) {
    const days = new Set(value?.days ?? []);
    let every = value?.every ?? 1;
    const draw = () => {
        const dayButtons = [...Array(7).keys()]
            .map((i) => (i + ui.weekStart) % 7)
            .map((day) => `<button class="${days.has(day) ? "on" : ""}" data-rd="${String(day)}">${fmt(new Date(2026, 9, 18 + day), { weekday: "short" })}</button>`)
            .join("");
        openPick(anchor, `<div class="rp-days">${dayButtons}</div>
    <div class="rp-every ${days.size > 0 ? "off" : ""}">${svg(IC.swap)}<input id="rp-n" value="${String(every)}" maxlength="3"><span>${t("d")}</span>
      <button class="ib" data-ok>${svg(IC.check)}</button></div>`, (event) => {
            const button = closest(event.target, "button");
            if (!button) {
                return;
            }
            const dayText = button.dataset["rd"];
            if (filled(dayText)) {
                const day = Number(dayText);
                if (days.has(day)) {
                    days.delete(day);
                }
                else {
                    days.add(day);
                }
                every = Number(field("#rp-n").value) || every;
                draw();
                return;
            }
            if ("ok" in button.dataset) {
                closePick();
                done(days.size > 0
                    ? { days: [...days].sort((a, b) => a - b) }
                    : {
                        every: Math.max(1, Number.parseInt(field("#rp-n").value, 10) || 1),
                    });
            }
        }, "rep-p");
    };
    draw();
}
export function pickIcon(anchor, value, done) {
    const button = (key) => `<button class="${key === value ? "on" : ""}" data-ico="${key}">${svg(emblems.icons[key] ?? "")}</button>`;
    openPick(anchor, `<div class="ico-grid">${emblems.pairs.map(([a, b]) => `<span class="pair">${button(a)}${button(b)}</span>`).join("")}
      ${emblems.singles.map(button).join("")}<button class="${value ? "" : "on"}" data-ico="" title="${t("no_icon")}">${svg(IC.x)}</button></div>`, (event) => {
        const picked = closest(event.target, "[data-ico]");
        if (!picked) {
            return;
        }
        closePick();
        done(picked.dataset["ico"] ?? "");
    }, "ico-p");
}
