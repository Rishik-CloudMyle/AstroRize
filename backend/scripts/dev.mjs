// `npm run dev` for the API: runs src/server.ts and restarts it when a file in src/ changes.
// Only src/ is watched — node's own --watch also follows node_modules, which cloud-sync
// folders (OneDrive) touch constantly. OneDrive also "touches" src files while syncing
// without changing them, so a restart happens only when a file's contents really changed.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, watch } from "node:fs";
import path from "node:path";

const SRC = "src";
const args = ["--env-file=.env", "src/server.ts"];
let child = null;
let restarting = false;
let timer = null;
const pending = new Set();

const ignored = (rel) => rel.startsWith("generated");

/** Content fingerprint of a file, or null when it no longer exists / isn't a file. */
function fingerprint(file) {
  try {
    if (!statSync(file).isFile()) return null;
    return createHash("sha1").update(readFileSync(file)).digest("hex");
  } catch {
    return null;
  }
}

// What every source file looks like right now, so later events can be compared against it.
const known = new Map();
for (const rel of readdirSync(SRC, { recursive: true })) {
  if (ignored(rel)) continue;
  const print = fingerprint(path.join(SRC, rel));
  if (print) known.set(rel, print);
}

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

/** Files whose contents changed (or that were added or removed) since we last looked. */
function reallyChanged() {
  const changed = [];
  for (const rel of pending) {
    const print = fingerprint(path.join(SRC, rel));
    const before = known.get(rel);
    if (print === null) {
      // Deleted file: a change. A directory event (never fingerprinted): not one.
      if (before !== undefined) {
        known.delete(rel);
        changed.push(rel);
      }
    } else if (print !== before) {
      known.set(rel, print);
      changed.push(rel);
    }
  }
  pending.clear();
  return changed;
}

watch(SRC, { recursive: true }, (_event, file) => {
  if (!file || ignored(file)) return;
  pending.add(file);
  clearTimeout(timer);
  timer = setTimeout(() => {
    const changed = reallyChanged();
    if (!changed.length) return;
    console.log(`Change in src/${changed[0].replaceAll("\\", "/")}${changed.length > 1 ? ` (+${changed.length - 1} more)` : ""}, restarting the API...`);
    if (child && child.exitCode === null) {
      restarting = true;
      child.kill();
    } else {
      start();
    }
  }, 250);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child?.kill(signal);
    process.exit(0);
  });
}

start();
