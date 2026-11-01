import { createServer } from "./api.js";
import { loadConfig, messageOf } from "./config.js";
import { demoConfig } from "./examples.js";
import { START_COMMAND } from "./paths.js";
import { createStore } from "./store.js";
import { openInOs } from "./system.js";
export function parseArgs(args) {
    const unknown = args.find((arg) => arg !== "--demo");
    if (unknown !== undefined) {
        throw new Error(`Unknown option ${unknown}. The only option is --demo, which runs Questboard on a fresh copy of the examples.`);
    }
    return { demo: args.includes("--demo") };
}
function startDemo(cfg) {
    const demo = demoConfig(cfg);
    process.on("exit", demo.removeCopy);
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
        process.on(signal, () => {
            process.exit(0);
        });
    }
    return demo.cfg;
}
function portMessage(error, port) {
    return Reflect.get(error, "code") === "EADDRINUSE"
        ? `Port ${String(port)} is already in use. Is Questboard already running? To use another port, set "port" in config.jsonc.`
        : error.message;
}
export function main(args) {
    let options;
    try {
        options = parseArgs(args);
    }
    catch (error) {
        console.error(messageOf(error));
        process.exit(1);
    }
    const cfg = options.demo ? startDemo(loadConfig()) : loadConfig();
    const store = createStore(cfg);
    store.sync();
    store.watch();
    const server = createServer(cfg, store);
    server.on("error", (error) => {
        console.error(portMessage(error, cfg.port));
        process.exit(1);
    });
    server.listen(cfg.port, "127.0.0.1", () => {
        const url = `http://localhost:${String(cfg.port)}`;
        console.log(`Questboard is running at ${url}\nData folder: ${store.dir}\nStart command: ${START_COMMAND}\nPress Ctrl+C to stop.`);
        if (options.demo) {
            console.log("This is a fresh copy of the examples. It is deleted when Questboard stops.");
        }
        if (cfg.openBrowser) {
            openInOs(url);
        }
    });
}
