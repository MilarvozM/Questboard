import { HOUR_MS, msOf } from "./dates.js";
export function sLineMs(quest, sLineAt) {
    if (quest.target !== undefined) {
        return msOf(quest.target);
    }
    if (quest.deadline === undefined || quest.created === undefined) {
        return null;
    }
    const accepted = msOf(quest.created);
    return accepted + (msOf(quest.deadline) - accepted) * sLineAt;
}
export function gradeAt(quest, ms, cfg) {
    const sLine = sLineMs(quest, cfg.sLineAt);
    if (sLine !== null && ms <= sLine) {
        return "S";
    }
    if (quest.deadline === undefined) {
        return "A";
    }
    const deadline = msOf(quest.deadline);
    if (ms <= deadline) {
        return "A";
    }
    return ms <= deadline + cfg.gradeBGraceHours * HOUR_MS ? "B" : "C";
}
export function questXp(quest, cfg) {
    return quest.xp ?? cfg.xp[quest.type];
}
