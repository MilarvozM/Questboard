import { isGuild } from "../shared/guards.js";
import { isRecord } from "../shared/records.js";
import { HttpError } from "./http-error.js";
export const STARTER_GUILDS = [
    { id: "work", emblem: "nodes" },
    { id: "study", emblem: "book" },
    { id: "health", emblem: "shield" },
    { id: "home", emblem: "roof" },
    { id: "people", emblem: "rings" },
    { id: "admin", emblem: "coin" },
    { id: "play", emblem: "nib" },
];
function isGuildList(list) {
    return Array.isArray(list) && list.every(isGuild);
}
export function isGuildsFile(value) {
    return isRecord(value) && isGuildList(value["guilds"]);
}
export function checkedGuilds(list) {
    if (!isGuildList(list) ||
        !list.every((guild) => /^[a-z0-9-]+$/.test(guild.id)) ||
        new Set(list.map((guild) => guild.id)).size !== list.length ||
        list.some((guild) => guild.id === "none")) {
        throw new HttpError(400, 'Each guild needs a unique lowercase id (not "none") and an emblem; name, motto and color are text, hidden is true or false');
    }
    return list;
}
