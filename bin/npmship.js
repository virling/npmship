#!/usr/bin/env node
import { defaults } from "../src/deps.js";
import { draft, formatDraft } from "../src/draft.js";
import { init } from "../src/init.js";
import { checkPreflight, execute, plan, pushRelease } from "../src/release.js";
import { formatChecks, verify } from "../src/verify.js";

const HELP = `npmship: release an npm package from git and verify it landed

  npmship <patch|minor|major|X.Y.Z>   print the release plan, change nothing
    --yes                             run it: preflight, CHANGELOG, npm version, commit, tag
    --push                            also push the branch and tag, then verify --wait
    --allow-empty-changelog           release even if [Unreleased] is empty
  npmship verify [X.Y.Z] [--wait]     check CI, npm registry, provenance, GitHub release, files
    --timeout <seconds>               how long --wait polls (default 1800)
  npmship draft [--write]             draft [Unreleased] from commits since the last vX.Y.Z tag
    --write                           add the entries to CHANGELOG.md
  npmship init [--write]              print the CI and release setup for a new package
    --write                           create test.yml, release.yml and CHANGELOG.md (existing files are kept)
  --json                              machine-readable output
  --help`;

const BOOLEAN_FLAGS = ["yes", "write", "push", "allow-empty-changelog", "wait", "json", "help"];

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) positional.push(argv[i]);
    else if (BOOLEAN_FLAGS.includes(argv[i].slice(2))) flags[argv[i].slice(2)] = true;
    else flags[argv[i].slice(2)] = argv[++i];
  }
  return { positional, flags };
}

async function runVerify(version, flags, deps) {
  const timeout = flags.timeout ? Number(flags.timeout) * 1000 : undefined;
  const result = await verify({ cwd: process.cwd(), version, wait: flags.wait, timeout }, deps);
  deps.log(flags.json ? JSON.stringify(result, null, 2) : `${result.name}@${result.version}\n${formatChecks(result.checks)}`);
  return result.ok ? 0 : 1;
}

function runDraft(flags, deps) {
  const d = draft({ cwd: process.cwd(), write: flags.write }, deps);
  const since = d.tag || "the first commit";
  if (flags.json) deps.log(JSON.stringify(d, null, 2));
  else if (!d.count) deps.log(`No commits to draft since ${since} (${d.skipped.length} skipped)`);
  else {
    deps.log(`${d.count} commit${d.count === 1 ? "" : "s"} since ${since} (${d.skipped.length} skipped)\n\n## [Unreleased]\n\n${formatDraft(d.groups)}`);
    if (flags.write) deps.log(d.added ? `\nAdded ${d.added} ${d.added === 1 ? "entry" : "entries"} to CHANGELOG.md` : "\nCHANGELOG.md already has all of them");
    else deps.log("\nNothing changed. Re-run with --write to add these to CHANGELOG.md.");
  }
  return 0;
}

function runInit(flags, deps) {
  const r = init({ cwd: process.cwd(), write: flags.write }, deps);
  if (flags.json) {
    deps.log(JSON.stringify(r, null, 2));
    return 0;
  }
  const created = r.files.filter((f) => !f.exists);
  deps.log(r.files.map((f) => `${f.exists ? "exists " : flags.write ? "created" : "create "} ${f.file}`).join("\n"));
  if (r.action) deps.log("\naction.yml found: release.yml also moves the major tag (v1, v2) used by the GitHub Action.");
  if (created.length && !flags.write) deps.log("\nNothing changed. Re-run with --write to create them.");
  deps.log(`\nThen enable npm trusted publishing so CI publishes with provenance. The package must already be on npm, so publish the first version yourself (npm publish --access public), then run:\n  ${r.trust}`);
  return 0;
}

async function main(deps = defaults) {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [command, arg] = positional;
  if (flags.help || !command) return deps.log(HELP);
  if (flags.timeout !== undefined && !(Number(flags.timeout) > 0 && Number(flags.timeout) < Infinity)) throw new Error(`--timeout expects a positive number of seconds, got ${flags.timeout}`);
  if (command === "verify") return runVerify(arg, flags, deps);
  if (command === "draft") return runDraft(flags, deps);
  if (command === "init") return runInit(flags, deps);
  const cwd = process.cwd();
  const p = plan(command, { cwd, allowEmpty: flags["allow-empty-changelog"] }, deps);
  if (!flags.yes) {
    const preflight = checkPreflight(p, { cwd }, deps);
    const problems = [...p.problems, ...(preflight ? [`preflight: ${preflight}`] : [])];
    if (flags.json) deps.log(JSON.stringify({ name: p.name, from: p.from, version: p.version, tag: p.tag, steps: p.steps, problems, hint: p.hint, dryRun: true }, null, 2));
    else {
      deps.log(`Release ${p.name} ${p.from} -> ${p.version} (tag ${p.tag}${p.sign ? ", signed" : ""})\n`);
      p.steps.forEach((s, i) => deps.log(`  ${i + 1}. ${s}`));
      if (p.changelog?.body) deps.log(`\nNew CHANGELOG section:\n\n## [${p.version}]\n${p.changelog.body}`);
      if (p.hint) deps.log(`\nHint: [Unreleased] is empty; ${p.hint}`);
      deps.log(problems.length ? `\nProblems:\n${problems.map((x) => `  - ${x}`).join("\n")}` : "\nPreflight (without fetch and npm test): ok");
      deps.log("\nDry run: nothing changed. Re-run with --yes to release.");
    }
    return problems.length ? 1 : 0;
  }
  execute(p, { cwd }, deps);
  if (!flags.json) deps.log(`Committed "Release ${p.version}" and tagged ${p.tag}`);
  if (!flags.push) {
    deps.log(flags.json ? JSON.stringify({ version: p.version, tag: p.tag, pushed: false, push: p.push.map((c) => c.join(" ")) }, null, 2) : `Push with:\n${p.push.map((c) => `  ${c.join(" ")}`).join("\n")}`);
    return 0;
  }
  pushRelease(p, { cwd }, deps);
  if (!flags.json) deps.log(`Pushed ${p.branch} and ${p.tag}, verifying`);
  return runVerify(p.version, { ...flags, wait: true }, deps);
}

main().then(
  (code) => (process.exitCode = code || 0),
  (e) => {
    console.error(`npmship: ${e.message}`);
    process.exitCode = 1;
  },
);
