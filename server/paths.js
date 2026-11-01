import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const builtAppDir = path.join(serverDir, "..");
const runsFromBuild = fs.existsSync(path.join(builtAppDir, "config.default.jsonc"));
export const APP_DIR = runsFromBuild
    ? builtAppDir
    : path.join(serverDir, "..", "..", "assets");
export const CONFIG_FILE = path.join(APP_DIR, "config.jsonc");
export const START_COMMAND = `node "${runsFromBuild
    ? path.join(builtAppDir, "questboard.js")
    : path.join(serverDir, "..", "questboard.ts")}"`;
