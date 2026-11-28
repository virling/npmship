import fs from "node:fs";
import path from "node:path";
import { insertDraft } from "./changelog.js";

const SECTIONS = ["Added", "Changed", "Removed", "Fixed"];
const WORDS = {
  Added: ["add", "ship", "support", "introduce", "allow"],
  Fixed: ["fix", "close", "stop", "handle", "prevent"],
  Removed: ["remove", "drop", "delete"],
};
const isChore = (files) => files.length > 0 && files.every((f) => /^(test|\.github)\//.test(f) || f.endsWith(".md"));

export function section(subject) {
  const word = subject.split(/\s/)[0].toLowerCase();
  return Object.keys(WORDS).find((k) => WORDS[k].includes(word)) || "Changed";
}

function lastTag(git) {
  const v = (t) => t.slice(1).split(".").map(Number);
  const tags = git("tag", "--merged", "HEAD", "--list", "v*").split("\n").filter((t) => /^v\d+\.\d+\.\d+$/.test(t));
  return tags.sort((a, b) => v(a).reduce((d, x, i) => d || x - v(b)[i], 0)).at(-1) || null;
}

export function collect(git) {
  const tag = lastTag(git);
  const log = git("log", "--reverse", "--no-merges", "--name-only", "--format=%x1e%h%x1f%s%x1f", tag ? `${tag}..HEAD` : "HEAD");
  const groups = {};
  const skipped = [];
  for (const chunk of log.split("\x1e").slice(1)) {
    const [hash, subject, files] = chunk.split("\x1f");
    if (/^Release \d/.test(subject) || isChore(files.split("\n").filter(Boolean))) skipped.push({ hash, subject });
    else (groups[section(subject)] ||= []).push({ hash, subject });
  }
  const ordered = Object.fromEntries(SECTIONS.filter((s) => groups[s]).map((s) => [s, groups[s]]));
  return { tag, count: Object.values(groups).flat().length, groups: ordered, skipped };
}

export const formatDraft = (groups) => Object.entries(groups).map(([name, commits]) => `### ${name}\n\n${commits.map((c) => `- ${c.subject}`).join("\n")}`).join("\n\n");

export function draft({ cwd, write }, deps) {
  const result = collect((...args) => deps.run("git", args, cwd));
  if (!write) return result;
  const file = path.join(cwd, "CHANGELOG.md");
  if (!fs.existsSync(file)) throw new Error("no CHANGELOG.md");
  const subjects = Object.fromEntries(Object.entries(result.groups).map(([name, commits]) => [name, commits.map((c) => c.subject)]));
  const { text, added } = insertDraft(fs.readFileSync(file, "utf8"), subjects);
  if (added) fs.writeFileSync(file, text);
  return { ...result, added };
}
