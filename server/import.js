import { parseQuest } from "./questfile.js";
import { withoutBom } from "./text.js";
function splitImport(text) {
    const lines = withoutBom(text)
        .split(/\r?\n/)
        .filter((line) => !/^\s*(```|~~~)/.test(line));
    const chunks = [];
    let current = null;
    let inFrontmatter = false;
    lines.forEach((line, i) => {
        if (line.trim() === "---") {
            if (inFrontmatter && current) {
                inFrontmatter = false;
                current.push(line);
                return;
            }
            if (/^[A-Za-z_][\w-]*\s*:/.test(lines[i + 1] ?? "")) {
                current = [line];
                chunks.push(current);
                inFrontmatter = true;
                return;
            }
        }
        current?.push(line);
    });
    return chunks.map((chunk) => chunk.join("\n"));
}
export function parseImport(text) {
    return splitImport(text)
        .map(parseQuest)
        .filter((quest) => quest !== null);
}
