export function insertInOrder(list, item, name, order, nameOf) {
    const position = order.indexOf(name);
    const names = list.map(nameOf);
    const before = Math.max(-1, ...order.slice(0, position).map((n) => names.lastIndexOf(n)));
    if (before >= 0) {
        list.splice(before + 1, 0, item);
        return;
    }
    const after = names.findIndex((n) => n !== undefined && order.indexOf(n) > position);
    list.splice(after >= 0 ? after : list.length, 0, item);
}
