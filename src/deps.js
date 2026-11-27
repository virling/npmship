import { execFileSync } from "node:child_process";

export const defaults = {
  run: (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64e6 }).trim(),
  fetch: (url) => fetch(url),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  log: (line) => console.log(line),
  progress: (line) => console.error(line),
};
