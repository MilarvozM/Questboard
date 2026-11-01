export function withoutBom(text) {
    return text.replace(/^\uFEFF/, "");
}
export function textLines(text) {
    return text ? text.split("\n") : [];
}
function isBlank(line) {
    return (line ?? "").trim() === "";
}
export function trimBlank(lines) {
    let start = 0;
    let end = lines.length;
    while (start < end && isBlank(lines[start])) {
        start++;
    }
    while (end > start && isBlank(lines[end - 1])) {
        end--;
    }
    return lines.slice(start, end);
}
export function trimText(lines) {
    return trimBlank(lines).join("\n");
}
