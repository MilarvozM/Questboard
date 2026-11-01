import { all, closest } from "./dom.js";
export function dragSort(box, itemSelector, handleSelector, done) {
    box.addEventListener("pointerdown", (event) => {
        const handle = closest(event.target, handleSelector);
        const item = handle?.closest(itemSelector);
        if (!(item instanceof HTMLElement) || !box.contains(item)) {
            return;
        }
        event.preventDefault();
        const group = all(itemSelector, box).filter((other) => other.dataset["drag"] === item.dataset["drag"]);
        const others = group.filter((other) => other !== item);
        const from = group.indexOf(item);
        const startY = event.clientY;
        let to = from;
        item.classList.add("dragging");
        const clear = () => {
            for (const other of others) {
                other.classList.remove("drop-before", "drop-after");
            }
        };
        const move = (moved) => {
            item.style.transform = `translateY(${String(moved.clientY - startY)}px)`;
            to = others.filter((other) => {
                const bounds = other.getBoundingClientRect();
                return moved.clientY > bounds.top + bounds.height / 2;
            }).length;
            clear();
            if (to !== from && others.length > 0) {
                if (to < others.length) {
                    others[to]?.classList.add("drop-before");
                }
                else {
                    others.at(-1)?.classList.add("drop-after");
                }
            }
        };
        const up = () => {
            removeEventListener("pointermove", move);
            removeEventListener("pointerup", up);
            item.classList.remove("dragging");
            item.style.transform = "";
            clear();
            if (to !== from) {
                done(from, to, item.dataset["drag"] ?? "");
            }
        };
        addEventListener("pointermove", move);
        addEventListener("pointerup", up);
    });
}
