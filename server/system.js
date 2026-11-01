import { spawn, spawnSync } from "node:child_process";
function runOrThrow(command, args, env = {}) {
    const result = spawnSync(command, args, {
        stdio: "ignore",
        env: { ...process.env, ...env },
    });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`${command} exited with ${String(result.status)}`);
    }
}
export function toTrash(file) {
    if (process.platform === "win32") {
        runOrThrow("powershell", [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($env:QB_FILE, 'OnlyErrorDialogs', 'SendToRecycleBin')",
        ], { QB_FILE: file });
    }
    else if (process.platform === "darwin") {
        runOrThrow("osascript", [
            "-e",
            "on run argv",
            "-e",
            'tell application "Finder" to delete (POSIX file (item 1 of argv))',
            "-e",
            "end run",
            file,
        ]);
    }
    else {
        runOrThrow("gio", ["trash", file]);
    }
}
export function openInOs(target) {
    const [command, args] = process.platform === "win32"
        ? ["cmd", ["/c", "start", '""', `"${target}"`]]
        : [process.platform === "darwin" ? "open" : "xdg-open", [target]];
    spawn(command, args, {
        detached: true,
        stdio: "ignore",
        windowsVerbatimArguments: true,
    })
        .on("error", () => undefined)
        .unref();
}
