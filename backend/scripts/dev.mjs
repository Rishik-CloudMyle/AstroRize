// `npm run dev` for the API: runs src/server.ts and restarts it when a file in src/
// changes. Only src/ is watched — node's own --watch also follows node_modules, which
// cloud-sync folders (OneDrive) touch constantly, causing restart loops.

import { spawn } from "node:child_process";
import { watch } from "node:fs";

const args = ["--env-file=.env", "src/server.ts"];
let child = null;
let restarting = false;
let timer = null;

function start() {
  child = spawn(process.execPath, args, { stdio: "inherit" });
  child.on("exit", (code) => {
    if (restarting) {
      restarting = false;
      start();
    } else if (code !== null && code !== 0) {
      console.log(`API stopped (exit ${code}). Fix the error and save a file in src/ to restart.`);
    }
  });
}

watch("src", { recursive: true }, (_event, file) => {
  if (!file || file.startsWith("generated")) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    console.log(`Change in src/${file.replaceAll("\\", "/")}, restarting the API...`);
    if (child && child.exitCode === null) {
      restarting = true;
      child.kill();
    } else {
      start();
    }
  }, 200);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child?.kill(signal);
    process.exit(0);
  });
}

start();
