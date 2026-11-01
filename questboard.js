#!/usr/bin/env node
const major = Number(process.versions.node.split(".")[0]);
if (major < 18) {
    console.error(`Questboard needs Node.js 18 or newer; this is ${process.versions.node}. Install the LTS version from nodejs.org.`);
    process.exit(1);
}
const { main } = await import("./server/cli.js");
main(process.argv.slice(2));
export {};
