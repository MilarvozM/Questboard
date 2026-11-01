import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { isSettings } from "../shared/config.js";
import { stampOf } from "../shared/dates.js";
import { filled, isRecord } from "../shared/records.js";
import { mergeConfig, warnOnConsole } from "./config.js";
import { HttpError } from "./http-error.js";
import { parseImport } from "./import.js";
import { locales } from "./locales.js";
import { APP_DIR, CONFIG_FILE, START_COMMAND } from "./paths.js";
import { checkQuest } from "./quest-input.js";
import { send, serveStatic } from "./static-files.js";
import { openInOs } from "./system.js";
function sendJson(res, status, data, headers) {
    send(res, status, JSON.stringify(data), "application/json; charset=utf-8", headers);
}
function download(name) {
    return { "Content-Disposition": `attachment; filename="${name}"` };
}
function plainQuest(quest) {
    return JSON.parse(JSON.stringify(quest, (key, value) => key === "doc" || key === "problems" || key.startsWith("_")
        ? undefined
        : value));
}
function asNewQuest(quest) {
    const { id, parent, tracked, favorite, completed, grade, awarded, created, ...kept } = quest;
    return { ...kept, status: "active" };
}
function fieldOf(body, key) {
    return isRecord(body) ? body[key] : undefined;
}
function textOf(body, key) {
    const value = fieldOf(body, key);
    return typeof value === "string" ? value : undefined;
}
function relOf(body) {
    return textOf(body, "rel") ?? "";
}
function versionOf(body) {
    const value = fieldOf(body, "version");
    return typeof value === "number" ? value : undefined;
}
function positionOf(body) {
    const at = fieldOf(body, "at");
    return Array.isArray(at) && at.every((n) => typeof n === "number") ? at : [];
}
async function readBody(req, limit) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on("data", (chunk) => {
            size += chunk.length;
            if (size <= limit) {
                chunks.push(chunk);
            }
        });
        req.on("end", () => {
            if (size > limit) {
                reject(new HttpError(413, "Request too large; see maxRequestMB in config.default.jsonc"));
                return;
            }
            try {
                const text = Buffer.concat(chunks).toString("utf8");
                resolve(JSON.parse(text || "{}"));
            }
            catch {
                reject(new HttpError(400, "Body is not JSON"));
            }
        });
        req.on("error", reject);
    });
}
export function createServer(cfg, store) {
    const clients = new Set();
    store.onChange(() => {
        for (const res of clients) {
            res.write("event: change\ndata: {}\n\n");
        }
    });
    const stylesDir = path.join(APP_DIR, "styles");
    const styles = () => (fs.existsSync(stylesDir) ? fs.readdirSync(stylesDir) : [])
        .filter((file) => file.endsWith(".css"))
        .map((file) => file.slice(0, -4))
        .sort((a, b) => Number(b === cfg.defaults.style) - Number(a === cfg.defaults.style));
    const settings = (warn = warnOnConsole) => {
        const merged = mergeConfig({ defaults: cfg.defaults }, { defaults: store.settings() }, "settings.json", warn)["defaults"];
        return isSettings(merged) ? merged : cfg.defaults;
    };
    function parse(text) {
        const ids = new Set(store.guilds().map((guild) => guild.id));
        return parseImport(text).map((quest) => {
            if (filled(quest.guild) && !ids.has(quest.guild)) {
                quest.problems.push({
                    code: "w_guild",
                    key: "guild",
                    value: quest.guild,
                });
                delete quest.guild;
            }
            return { quest, problems: quest.problems, ok: filled(quest.title) };
        });
    }
    const entries = () => store.quests().map(({ rel, version, clash, by, q }) => ({
        rel,
        version,
        clash,
        by,
        quest: q,
    }));
    const routes = new Map([
        [
            "GET /api/state",
            () => ({
                data: {
                    config: cfg,
                    settings: settings(),
                    guilds: store.guilds(),
                    player: store.player(),
                    languages: [...locales().keys()],
                    styles: styles(),
                    paths: {
                        dataDir: store.dir,
                        config: CONFIG_FILE,
                        start: START_COMMAND,
                    },
                    quests: entries(),
                },
            }),
        ],
        [
            "GET /api/file",
            ({ url }) => ({
                data: { text: store.text(url.searchParams.get("rel") ?? "") },
            }),
        ],
        [
            "POST /api/save",
            ({ body }) => {
                const rel = store.save(checkQuest(fieldOf(body, "quest")), textOf(body, "rel"), versionOf(body), fieldOf(body, "undo") === true, fieldOf(body, "name"));
                const saved = store.quests().find((entry) => entry.rel === rel);
                if (!saved) {
                    throw new Error(`${rel} was saved but could not be read back`);
                }
                return { data: { rel, version: saved.version, quest: saved.q } };
            },
        ],
        [
            "POST /api/split",
            ({ body }) => ({
                data: store.split(relOf(body), positionOf(body), versionOf(body)),
            }),
        ],
        [
            "POST /api/remove",
            ({ body }) => {
                store.remove(relOf(body), versionOf(body));
                return { data: {} };
            },
        ],
        [
            "POST /api/delete",
            ({ body }) => {
                store.trashQuest(relOf(body), versionOf(body));
                return { data: {} };
            },
        ],
        [
            "POST /api/parse",
            ({ body }) => ({
                data: { quests: parse(textOf(body, "text") ?? "") },
            }),
        ],
        [
            "POST /api/import",
            ({ body }) => {
                const found = parse(textOf(body, "text") ?? "");
                const rels = [];
                for (const { quest, ok } of found) {
                    if (!ok) {
                        continue;
                    }
                    rels.push(store.save(asNewQuest(quest)));
                }
                return { data: { rels, skipped: found.length - rels.length } };
            },
        ],
        [
            "PUT /api/guilds",
            ({ body }) => {
                store.saveGuilds(fieldOf(body, "guilds"));
                return { data: { guilds: store.guilds() } };
            },
        ],
        [
            "PUT /api/settings",
            ({ body }) => {
                const errors = [];
                const values = mergeConfig({ defaults: cfg.defaults }, { defaults: isRecord(body) ? body : null }, "settings", (error) => errors.push(error))["defaults"];
                if (errors.length > 0 || !isRecord(body) || !isRecord(values)) {
                    throw new HttpError(400, errors.join(" "));
                }
                store.saveSettings(Object.fromEntries(Object.keys(body).map((key) => [key, values[key]])));
                return { data: { settings: settings() } };
            },
        ],
        [
            "GET /api/player",
            () => ({
                data: store.player(),
                headers: download("player.json"),
            }),
        ],
        [
            "POST /api/player",
            ({ body }) => {
                store.importPlayer(fieldOf(body, "player"), fieldOf(body, "mode"));
                return { data: { player: store.player() } };
            },
        ],
        [
            "GET /api/export",
            () => {
                const now = stampOf(Date.now());
                return {
                    data: {
                        questboard: 1,
                        exported: now.replace(" ", "T"),
                        guilds: store.guilds(),
                        quests: store.quests().map(({ rel, q }) => ({
                            file: rel,
                            quest: plainQuest(q),
                            markdown: store.text(rel),
                        })),
                    },
                    headers: download(`questboard-export-${now.slice(0, 10)}.json`),
                };
            },
        ],
        [
            "POST /api/open",
            ({ body }) => {
                openInOs(store.path(relOf(body)));
                return { data: {} };
            },
        ],
    ]);
    function refused(req, writes) {
        const port = String(req.socket.localPort);
        const hosts = [`localhost:${port}`, `127.0.0.1:${port}`];
        const origin = req.headers.origin;
        return (!hosts.includes(req.headers.host ?? "") ||
            (filled(origin) && !hosts.some((host) => origin === `http://${host}`)) ||
            (writes &&
                !/^application\/json\b/.test(req.headers["content-type"] ?? "")));
    }
    async function api(req, res, url) {
        const writes = req.method !== "GET";
        if (refused(req, writes)) {
            sendJson(res, 403, { error: "Forbidden" });
            return;
        }
        if (req.method === "GET" && url.pathname === "/api/events") {
            res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-store",
                Connection: "keep-alive",
            });
            res.write(": connected\n\n");
            clients.add(res);
            req.on("close", () => clients.delete(res));
            return;
        }
        const route = routes.get(`${req.method ?? ""} ${url.pathname}`);
        if (!route) {
            sendJson(res, 404, { error: "Not found" });
            return;
        }
        try {
            const body = writes
                ? await readBody(req, cfg.maxRequestMB * 1024 * 1024)
                : null;
            const { data, headers } = route({ body, url });
            sendJson(res, 200, data, headers);
        }
        catch (error) {
            if (!(error instanceof HttpError)) {
                console.error(error);
            }
            sendJson(res, error instanceof HttpError ? error.status : 500, {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    return http.createServer((req, res) => {
        let url;
        try {
            url = new URL(req.url ?? "/", "http://localhost");
        }
        catch {
            send(res, 400, "Bad request");
            return;
        }
        if (url.pathname.startsWith("/api/")) {
            void api(req, res, url);
            return;
        }
        serveStatic(req, res);
    });
}
