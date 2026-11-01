import fs from "node:fs";
import path from "node:path";
import { APP_DIR } from "./paths.js";
const FOLDERS = [
    ["/styles/", "styles"],
    ["/locales/", "locales"],
    ["/prompts/", "prompts"],
    ["/shared/", "shared"],
    ["/", "app"],
];
const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
};
export function send(res, status, body = "", type = "text/plain; charset=utf-8", headers = {}) {
    res.writeHead(status, {
        "Content-Type": type,
        "Cache-Control": "no-store",
        ...headers,
    });
    res.end(body);
}
export function serveStatic(req, res) {
    if (req.method !== "GET" && req.method !== "HEAD") {
        send(res, 405, "Method not allowed");
        return;
    }
    let url;
    try {
        url = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    }
    catch {
        send(res, 400, "Bad request");
        return;
    }
    const [prefix, folder] = FOLDERS.find(([start]) => url.startsWith(start)) ?? [
        "/",
        "app",
    ];
    const base = path.join(APP_DIR, folder);
    const file = path.join(base, url.slice(prefix.length) || "index.html");
    if (!file.startsWith(base + path.sep)) {
        send(res, 404, "Not found");
        return;
    }
    fs.readFile(file, (error, buffer) => {
        if (error) {
            send(res, 404, "Not found");
            return;
        }
        send(res, 200, req.method === "HEAD" ? "" : buffer, MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream");
    });
}
