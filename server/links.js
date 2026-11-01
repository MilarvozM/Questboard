import path from "node:path";
import { stampOf } from "../shared/dates.js";
import { filled } from "../shared/records.js";
import { baseOf } from "./names.js";
const STEP_FOR_STATUS = {
    complete: "done",
    abandoned: "dropped",
    active: "open",
};
const STATUS_FOR_STEP = {
    done: "complete",
    dropped: "abandoned",
    open: "active",
};
function linkTarget(link) {
    return path.posix.basename(link.split("#")[0] ?? "");
}
function linkedSteps(quest) {
    return quest.objectives
        .flatMap((step) => [step, ...(step.sub ?? [])])
        .filter((step) => filled(step.link));
}
export class Links {
    files;
    idCount;
    byName;
    byId;
    constructor(files, idCount) {
        this.files = files;
        this.idCount = idCount;
        this.byName = new Map(files.map((file) => [baseOf(file.rel).toLowerCase(), file.rel]));
        this.byId = new Map(files.map((file) => [file.quest.id ?? "", file]));
    }
    hasId(id) {
        return this.byId.has(id);
    }
    resolve(link) {
        return this.byName.get(linkTarget(link ?? "")
            .replace(/\.md$/i, "")
            .toLowerCase());
    }
    dropLinksTo(goneNames, dirty) {
        for (const file of this.files) {
            for (const step of linkedSteps(file.quest)) {
                if (this.resolve(step.link) === undefined &&
                    goneNames.has(linkTarget(step.link ?? "").toLowerCase())) {
                    delete step.link;
                    dirty.add(file.rel);
                }
            }
        }
    }
    stepFor(parent, child) {
        const steps = linkedSteps(parent.quest);
        const linked = steps.find((step) => this.resolve(step.link) === child.rel);
        if (linked) {
            return linked;
        }
        const broken = steps.filter((step) => this.resolve(step.link) === undefined);
        const named = broken.find((step) => step.t === child.quest.title);
        return named ?? (broken.length === 1 ? (broken[0] ?? null) : null);
    }
    parentOf(child) {
        const id = child.quest.parent;
        if (!filled(id) || (this.idCount.get(id) ?? 0) > 1) {
            return null;
        }
        const parent = this.byId.get(id);
        return parent && !filled(parent.quest.parent) ? parent : null;
    }
    sync(pass, parentsWin) {
        const followed = new Set();
        for (const child of this.files) {
            const parent = this.parentOf(child);
            if (!parent) {
                continue;
            }
            const step = this.stepFor(parent, child);
            if (!step) {
                continue;
            }
            if (!filled(step.link) || this.resolve(step.link) !== child.rel) {
                step.link = baseOf(child.rel);
                pass.dirty.add(parent.rel);
            }
            const status = child.quest.status;
            if (STEP_FOR_STATUS[status] === step.s) {
                continue;
            }
            const parentChanged = pass.changed.has(parent.rel);
            const parentWins = parentsWin.has(parent.rel) ||
                (parentChanged === pass.changed.has(child.rel)
                    ? parent.mtimeMs > child.mtimeMs
                    : parentChanged);
            const statusFromStep = STATUS_FOR_STEP[step.s];
            if (parentWins && statusFromStep !== undefined) {
                child.quest.status = statusFromStep;
                pass.count(child.quest, pass.by, pass.by === "app" ? pass.now : parent.mtimeMs);
                pass.dirty.add(child.rel);
            }
            else if (!parentWins) {
                step.s = STEP_FOR_STATUS[status];
                if (step.s === "open") {
                    delete step.at;
                }
                else {
                    step.at = child.quest.completed ?? stampOf(pass.now);
                }
                pass.dirty.add(parent.rel);
                followed.add(parent.rel);
            }
        }
        return followed;
    }
}
