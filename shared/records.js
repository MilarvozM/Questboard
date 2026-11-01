export function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function isStringArray(value) {
    return (Array.isArray(value) && value.every((item) => typeof item === "string"));
}
export function same(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}
export function copyOf(value) {
    return structuredClone(value);
}
export function filled(text) {
    return text !== undefined && text !== null && text !== "";
}
