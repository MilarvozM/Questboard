import { esc } from "./dom.js";
import { emblems } from "./state.js";
export const TYPE_IC = {
    main: '<path d="M12 2.5 21.5 12 12 21.5 2.5 12z"/><path d="M12 7.5 16.5 12 12 16.5 7.5 12z"/>',
    side: '<circle cx="12" cy="12" r="8.5"/>',
    activity: '<path d="M12 4 20.5 19h-17z"/>',
};
export const IC = {
    open: '<path d="M12 3 21 12 12 21 3 12z"/>',
    done: '<path class="f" d="M12 3 21 12 12 21 3 12z"/>',
    failed: '<path d="M12 3 21 12 12 21 3 12z"/><path d="M9 9l6 6M15 9l-6 6"/>',
    dropped: '<path d="M12 3 21 12 12 21 3 12z"/><path d="M8.5 12h7"/>',
    new: '<path d="M12 3 21 12 12 21 3 12z"/><path d="M12 8.5v7M8.5 12h7"/>',
    crit_open: '<circle cx="12" cy="12" r="8"/>',
    crit_done: '<circle cx="12" cy="12" r="8"/><circle class="f" cx="12" cy="12" r="4.5"/>',
    log: '<path d="M5 4h14v16H5z"/><path d="M8.5 9h7M8.5 13h7M8.5 17h4"/>',
    start: '<circle cx="12" cy="12" r="8"/><path d="M10 8.5 15.5 12 10 15.5z"/>',
    finish: '<path d="M6 21V4"/><path d="M6 4h12l-3 4 3 4H6"/>',
    branch: '<path d="M6 4v6c0 3 2 4 6 4s6 1 6 4v2M6 10c0 3-2 4-2 6v4"/><circle cx="6" cy="4" r="1.5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
    act_done: '<path class="f" d="M12 4 20.5 19h-17z"/>',
    act_todo: '<path d="M12 4 20.5 19h-17z"/>',
    act_miss: '<path d="M12 4 20.5 19h-17z"/><path d="M12 10v4"/>',
    act_skip: '<path d="M12 4 20.5 19h-17z"/><path d="M9.5 15h5"/>',
    skip: '<path d="M4.5 6.5 11 12l-6.5 5.5z"/><path d="M12.5 6.5 19 12l-6.5 5.5z"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
    star_f: '<path class="f" d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
    check: '<path d="M4.5 12.5l5 5 10-11"/>',
    complete: '<path d="M2.5 11.6l3.2-3.2 4.3 4.3 8.3-8.3 3.2 3.2-11.5 11.5z"/>',
    pencil: '<path d="M15.5 4.5l4 4L8 20H4v-4z"/><path d="M13 7l4 4"/>',
    dots: '<circle class="f" cx="5.5" cy="12" r="1.4"/><circle class="f" cx="12" cy="12" r="1.4"/><circle class="f" cx="18.5" cy="12" r="1.4"/>',
    grip: '<circle class="f" cx="9" cy="6" r="1.3"/><circle class="f" cx="15" cy="6" r="1.3"/><circle class="f" cx="9" cy="12" r="1.3"/><circle class="f" cx="15" cy="12" r="1.3"/><circle class="f" cx="9" cy="18" r="1.3"/><circle class="f" cx="15" cy="18" r="1.3"/>',
    fold: '<path class="f" d="M6 9h12l-6 7z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.4-4.4"/>',
    cal: '<path d="M3.5 5h17v15.5h-17z"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    sort: '<path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3"/>',
    layers: '<path d="M12 3.5 21 8l-9 4.5L3 8z"/><path d="M3 12.5l9 4.5 9-4.5M3 16.5 12 21l9-4.5"/>',
    ol: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 4.5h1.5V9M4 9h3M4 14.5c.5-.8 2.8-.8 2.8.6 0 1.2-2.8 2-2.8 3.4h3"/>',
    ul: '<path d="M10 6h10M10 12h10M10 18h10"/><circle class="f" cx="5" cy="6" r="1.3"/><circle class="f" cx="5" cy="12" r="1.3"/><circle class="f" cx="5" cy="18" r="1.3"/>',
    expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
    track: '<circle cx="12" cy="12" r="7"/><path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5"/>',
    md: '<path d="M3.5 6h17v12h-17z"/><path d="M6.5 15V9l2.5 3 2.5-3v6M15.5 9v6M13.5 13l2 2 2-2"/>',
    skin: '<circle cx="12" cy="12" r="8.5"/><path class="f" d="M12 3.5a8.5 8.5 0 0 1 0 17z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
    fab_terminal: '<path d="M12 2.5 20.5 7.25v9.5L12 21.5 3.5 16.75v-9.5z"/><path d="M12 8v8M8 12h8"/>',
    fab_chronicle: '<path d="M5 14.5h9l1.5 6h-12z"/><path d="M7 14.5v-2h5v2"/><path d="M21 2.5c-5 1-9 4.5-10.5 10l1.2.9C17 12.5 20 8 21 2.5z"/><path d="M10.5 12.5 9.5 16.5"/>',
};
export const NO_EMBLEM = '<path d="M12 3.5 19.5 7.75v8.5L12 20.5 4.5 16.25v-8.5z" stroke-dasharray="2.5 2.5"/>';
export function emblem(guild) {
    if (guild.emblem === "none") {
        return NO_EMBLEM;
    }
    if (!guild.emblem) {
        return "";
    }
    return emblems.icons[guild.emblem] ?? `<path d="${esc(guild.emblem)}"/>`;
}
const ICONS = new Map(Object.entries(IC));
export function iconNamed(name) {
    return ICONS.get(name) ?? "";
}
