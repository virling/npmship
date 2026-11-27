import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { defaults } from "../src/deps.js";

export const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "npmship-test-"));
export const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

export function repo({ files = {}, scripts = { test: "node -e 0" }, version = "1.0.0", tag = true } = {}) {
  const root = tmp();
  const remote = path.join(root, "remote.git");
  const dir = path.join(root, "work");
  git(root, "init", "-q", "--bare", "-b", "main", remote);
  git(root, "init", "-q", "-b", "main", dir);
  for (const [key, value] of [["user.name", "Test"], ["user.email", "test@example.com"], ["commit.gpgsign", "false"], ["tag.gpgSign", "false"], ["core.hooksPath", path.join(root, "hooks")]]) git(dir, "config", key, value);
  const pkg = { name: "@acme/widget", version, scripts, files: ["index.js"] };
  const all = {
    "package.json": JSON.stringify(pkg, null, 2) + "\n",
    "index.js": "export default 1;\n",
    "CHANGELOG.md": "# Changelog\n\n## [Unreleased]\n\n- New thing.\n\n## [1.0.0] - 2026-01-01\n\n- First.\n\n[Unreleased]: https://github.com/acme/widget/compare/v1.0.0...HEAD\n[1.0.0]: https://github.com/acme/widget/releases/tag/v1.0.0\n",
    ".gitignore": "node_modules/\n",
    ...files,
  };
  for (const [name, content] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "Initial");
  if (tag) git(dir, "tag", "-a", `v${version}`, "-m", `v${version}`);
  git(dir, "remote", "add", "origin", remote);
  git(dir, "push", "-q", "-u", "origin", "main");
  git(dir, "remote", "set-head", "origin", "main");
  return { dir, remote };
}

export function tgz(files) {
  const blocks = [];
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content);
    const header = Buffer.alloc(512);
    header.write(name, 0);
    header.write("0000644\0", 100);
    header.write(data.length.toString(8).padStart(11, "0") + "\0", 124);
    header.write("0", 156);
    header.write("ustar\0", 257);
    blocks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  return zlib.gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
}

export function fakeDeps({ gh = {}, http = {}, run } = {}) {
  const calls = [];
  const logs = [];
  let clock = new Date(2026, 2, 4, 12).getTime();
  return {
    calls,
    logs,
    run: (cmd, args, cwd) => {
      calls.push([cmd, ...args].join(" "));
      if (run) {
        const out = run(cmd, args, cwd);
        if (out !== undefined) return out;
      }
      if (cmd !== "gh") return defaults.run(cmd, args, cwd);
      const key = args.slice(0, 2).join(" ");
      const reply = typeof gh[key] === "function" ? gh[key]() : gh[key];
      if (reply instanceof Error) throw reply;
      if (reply === undefined) throw new Error(`unexpected gh ${key}`);
      return JSON.stringify(reply);
    },
    fetch: async (url) => {
      const reply = typeof http[url] === "function" ? http[url]() : http[url];
      if (!reply) return new Response("not found", { status: 404 });
      return new Response(Buffer.isBuffer(reply) ? reply : JSON.stringify(reply), { status: 200 });
    },
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
    log: (line) => logs.push(line),
    progress: (line) => logs.push(line),
  };
}
