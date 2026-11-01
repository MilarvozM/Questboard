import path from "node:path";
import { stampOf } from "../shared/dates.js";
const ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
export function randomId(length) {
    return Array.from({ length }, () => ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)] ?? "").join("");
}
export function baseOf(rel) {
    return path.posix.basename(rel, path.posix.extname(rel));
}
export function fileSlug(title, cfg) {
    if (/[^\p{Script=Latin}\P{L}]/u.test(title)) {
        return "";
    }
    const full = title
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    if (full.length <= cfg.fileSlugMax) {
        return full;
    }
    const cut = full.slice(0, cfg.fileSlugMax + 1);
    const lastWord = cut.lastIndexOf("-");
    return (lastWord > 0 ? cut.slice(0, lastWord) : cut.slice(0, cfg.fileSlugMax)).replace(/-+$/, "");
}
export function makeId(rel, createdMs, taken, cfg) {
    const dated = /^(\d{4})-(\d{2})-(\d{2})-(.+)$/.exec(baseOf(rel));
    const date = dated
        ? `${dated[1] ?? ""}${dated[2] ?? ""}${dated[3] ?? ""}`
        : stampOf(createdMs).slice(0, 10).replace(/-/g, "");
    const slug = fileSlug(dated ? (dated[4] ?? "") : baseOf(rel), cfg) ||
        randomId(cfg.fileIdLength);
    let id = `q-${date}-${slug}`;
    for (let i = 2; taken.has(id); i++) {
        id = `q-${date}-${slug}-${String(i)}`;
    }
    return id;
}
export function freePath(rel, taken) {
    const extension = path.posix.extname(rel);
    const stem = rel.slice(0, -extension.length);
    let out = rel;
    for (let i = 2; taken(out); i++) {
        out = `${stem}-${String(i)}${extension}`;
    }
    return out;
}
