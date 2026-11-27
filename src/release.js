import fs from "node:fs";
import path from "node:path";
import { localDate, releaseChangelog } from "./changelog.js";
import { collect } from "./draft.js";

export function bump(current, kind) {
  if (/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(kind)) return kind;
  const m = current.match(/^(\d+)\.(\d+)\.(\d+)(-.+)?$/);
  if (!m) throw new Error(`package.json version ${current} is not semver`);
  const [major, minor, patch] = m.slice(1, 4).map(Number);
  const pre = Boolean(m[4]);
  if (kind === "major") return pre && !minor && !patch ? `${major}.0.0` : `${major + 1}.0.0`;
  if (kind === "minor") return pre && !patch ? `${major}.${minor}.0` : `${major}.${minor + 1}.0`;
  if (kind === "patch") return pre ? `${major}.${minor}.${patch}` : `${major}.${minor}.${patch + 1}`;
  throw new Error(`expected patch, minor, major or X.Y.Z, got ${kind}`);
}

export const webUrl = (url) => url.replace(/^git\+/, "").replace(/^git@([^:]+):/, "https://$1/").replace(/^ssh:\/\/git@/, "https://").replace(/\.git$/, "");

const attempt = (fn) => {
  try {
    fn();
    return null;
  } catch (e) {
    return e.message;
  }
};

function preflight(git, { fetch, test, branch }, deps, cwd) {
  if (fetch) git("fetch", "--quiet");
  if (git("status", "--porcelain")) throw new Error("working tree is not clean");
  const head = git("for-each-ref", "--format=%(symref:short)", "refs/remotes/origin/HEAD").replace(/^origin\//, "");
  if (!head) throw new Error("cannot tell the default branch (run: git remote set-head origin --auto)");
  if (branch !== head) throw new Error(`on ${branch}, not on the default branch ${head}`);
  const upstream = git("for-each-ref", "--format=%(upstream:short)", `refs/heads/${branch}`);
  if (!upstream) throw new Error(`${branch} has no upstream`);
  const behind = Number(git("rev-list", "--count", `HEAD..${upstream}`));
  if (behind) throw new Error(`${branch} is ${behind} commit(s) behind ${upstream}`);
  if (test) {
    try {
      deps.run("npm", ["test"], cwd);
    } catch (e) {
      throw new Error(`npm test failed\n${String(e.stdout || "").trim().split("\n").slice(-20).join("\n")}`);
    }
  }
}

export function plan(kind, { cwd, allowEmpty }, deps) {
  const git = (...args) => deps.run("git", args, cwd);
  const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
  const version = bump(pkg.version, kind);
  const tag = `v${version}`;
  const prev = git("tag", "-l", `v${pkg.version}`) ? pkg.version : null;
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  const remote = git("config", "--get", "--default=", "remote.origin.url");
  const bool = (key) => git("config", "--get", "--type=bool", "--default=false", key) === "true";
  const sign = bool("tag.gpgSign") || bool("commit.gpgsign");
  const changelogPath = path.join(cwd, "CHANGELOG.md");
  let changelog;
  const problems = [];
  if (git("tag", "-l", tag)) problems.push(`tag ${tag} already exists`);
  if (!fs.existsSync(changelogPath)) problems.push("no CHANGELOG.md");
  else {
    const error = attempt(() => {
      changelog = releaseChangelog(fs.readFileSync(changelogPath, "utf8"), { version, prev, date: localDate(deps.now()), repoUrl: remote && webUrl(remote), allowEmpty });
    });
    if (error) problems.push(error);
  }
  const empty = changelog ? !changelog.body : problems.some((x) => x.startsWith("## [Unreleased] in CHANGELOG.md is empty"));
  const drafted = empty && collect(git);
  const hint = drafted?.count ? `run \`npmship draft --write\` to draft it from ${drafted.count} commit${drafted.count === 1 ? "" : "s"} since ${drafted.tag || "the first commit"}` : null;
  const entries = changelog?.body ? changelog.body.split("\n").filter((l) => l.startsWith("- ")).length : 0;
  const lock = fs.existsSync(path.join(cwd, "package-lock.json"));
  const stage = ["package.json", ...(lock ? ["package-lock.json"] : []), "CHANGELOG.md"];
  const push = [["git", "push", "origin", branch], ["git", "push", "origin", tag]];
  const tagArgs = ["tag", "-a", ...(sign ? ["-s"] : []), tag, "-m", tag];
  const steps = [
    `preflight: git fetch, clean tree, on the default branch, not behind upstream, npm test`,
    `CHANGELOG.md: move [Unreleased] (${changelog?.body ? `${entries} ${entries === 1 ? "entry" : "entries"}` : "empty"}) to [${version}] - ${localDate(deps.now())}, update compare links`,
    `npm version ${version} --no-git-tag-version, then git add ${stage.join(" ")} (plus anything the version script stages)`,
    `git commit -m "Release ${version}"`,
    `git ${tagArgs.join(" ")}`,
    `push (only with --push): ${push.map((c) => c.join(" ")).join(" && ")}`,
    `verify ${version} --wait (only with --push)`,
  ];
  return { name: pkg.name, from: pkg.version, version, tag, branch, sign, changelog, changelogPath, stage, push, tagArgs, steps, problems, hint };
}

export function execute(p, { cwd }, deps) {
  const git = (...args) => deps.run("git", args, cwd);
  if (p.problems.length) throw new Error(p.problems.join("\n"));
  preflight(git, { fetch: true, test: true, branch: p.branch }, deps, cwd);
  fs.writeFileSync(p.changelogPath, p.changelog.text);
  deps.run("npm", ["version", p.version, "--no-git-tag-version"], cwd);
  git("add", ...p.stage);
  git("commit", "-m", `Release ${p.version}`);
  git(...p.tagArgs);
}

export function checkPreflight(p, { cwd }, deps) {
  return attempt(() => preflight((...args) => deps.run("git", args, cwd), { fetch: false, test: false, branch: p.branch }, deps, cwd));
}

export function pushRelease(p, { cwd }, deps) {
  for (const [cmd, ...args] of p.push) deps.run(cmd, args, cwd);
}
