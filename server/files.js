import fs from "node:fs";
import path from "node:path";
const RENAME_REFUSALS = new Set(["EPERM", "EBUSY", "EACCES"]);
function codeOf(error) {
    return error instanceof Error ? Reflect.get(error, "code") : undefined;
}
function pause(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
export function writeAtomic(file, text, { renameTries, renameRetryMs }) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${String(process.pid)}.tmp`);
    fs.writeFileSync(temporary, text);
    for (let attempt = 1;; attempt++) {
        try {
            fs.renameSync(temporary, file);
            return;
        }
        catch (error) {
            const code = codeOf(error);
            if (attempt >= renameTries ||
                typeof code !== "string" ||
                !RENAME_REFUSALS.has(code)) {
                fs.rmSync(temporary, { force: true });
                throw error;
            }
            pause(renameRetryMs);
        }
    }
}
export function markdownFiles(dir, rel, skipPrefixes) {
    let entries;
    try {
        entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true });
    }
    catch {
        return [];
    }
    return entries.flatMap((entry) => {
        const child = `${rel}/${entry.name}`;
        if (entry.isDirectory()) {
            return skipPrefixes.some((prefix) => entry.name.startsWith(prefix))
                ? []
                : markdownFiles(dir, child, skipPrefixes);
        }
        return entry.isFile() && entry.name.toLowerCase().endsWith(".md")
            ? [child]
            : [];
    });
}
