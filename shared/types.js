export const QUEST_TYPES = ["main", "side", "activity"];
export const QUEST_STATUSES = ["active", "complete", "abandoned"];
export const STEP_STATES = ["open", "done", "failed", "dropped"];
export const GRADES = ["S", "A", "B", "C"];
export const SECTION_KINDS = [
    "briefing",
    "objectives",
    "criteria",
    "completions",
    "log",
    "debrief",
];
export const BUCKET_FIELDS = [
    "main",
    "side",
    "activity",
    "abandoned",
    "xp",
];
export function isOpen(status) {
    return status === "active";
}
export function includes(list, value) {
    return list.some((item) => item === value);
}
