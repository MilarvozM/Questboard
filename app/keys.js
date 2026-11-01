const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
export function keyMatch(event, binding) {
    if (!binding) {
        return false;
    }
    const withMod = binding.startsWith("Mod+");
    const key = withMod ? binding.slice(4) : binding;
    return ((event.ctrlKey || event.metaKey) === withMod &&
        !event.altKey &&
        (withMod
            ? event.key.toLowerCase() === key.toLowerCase()
            : event.key === key));
}
function keyName(key) {
    if (key === "Escape") {
        return "Esc";
    }
    return key.length === 1 && key !== key.toLowerCase()
        ? `⇧${key}`
        : key.toUpperCase();
}
export function keyLabel(binding) {
    if (!binding) {
        return "";
    }
    const withMod = binding.startsWith("Mod+");
    const name = keyName(withMod ? binding.slice(4) : binding);
    if (!withMod) {
        return name;
    }
    return (MAC ? "⌘" : "Ctrl+") + name;
}
