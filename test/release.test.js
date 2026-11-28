import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { bump, compare, execute, plan, pushRelease, webUrl } from "../src/release.js";
import { fakeDeps, git, repo } from "./helpers.js";

const bin = new URL("../bin/npmship.js", import.meta.url).pathname;
const read = (dir, file) => fs.readFileSync(path.join(dir, file), "utf8");

test("bump", () => {
  assert.equal(bump("1.2.3", "patch"), "1.2.4");
  assert.equal(bump("1.2.3", "minor"), "1.3.0");
  assert.equal(bump("1.2.3", "major"), "2.0.0");
  assert.equal(bump("1.2.3", "4.0.0-rc.1"), "4.0.0-rc.1");
  assert.equal(bump("2.0.0-rc.1", "major"), "2.0.0");
  assert.equal(bump("1.3.0-rc.1", "minor"), "1.3.0");
  assert.equal(bump("1.3.1-rc.1", "patch"), "1.3.1");
  assert.throws(() => bump("1.2.3", "huge"), /expected patch/);
});
test("compare orders versions by semver precedence", () => {
  const order = ["1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0", "1.0.1", "1.2.0", "1.10.0", "2.0.0"];
  for (let i = 1; i < order.length; i++) {
    assert.ok(compare(order[i - 1], order[i]) < 0, `${order[i - 1]} < ${order[i]}`);
    assert.ok(compare(order[i], order[i - 1]) > 0, `${order[i]} > ${order[i - 1]}`);
  }
  assert.equal(compare("1.0.0-rc.1", "1.0.0-rc.1"), 0);
});
test("webUrl normalizes git remotes", () => {
  assert.equal(webUrl("git@github.com:acme/widget.git"), "https://github.com/acme/widget");
  assert.equal(webUrl("git+https://github.com/acme/widget.git"), "https://github.com/acme/widget");
  assert.equal(webUrl("ssh://git@github.com/acme/widget.git"), "https://github.com/acme/widget");
});
test("dry run prints the plan and changes nothing", () => {
  const { dir } = repo();
  const before = git(dir, "status", "--porcelain") + read(dir, "CHANGELOG.md") + read(dir, "package.json");
  const out = execFileSync("node", [bin, "minor"], { cwd: dir, encoding: "utf8" });
  assert.match(out, /Release @acme\/widget 1\.0\.0 -> 1\.1\.0 \(tag v1\.1\.0\)/);
  assert.match(out, /git tag -a v1\.1\.0 -m v1\.1\.0/);
  assert.match(out, /- New thing\./);
  assert.match(out, /Preflight \(without fetch and npm test\): ok/);
  assert.equal(git(dir, "status", "--porcelain") + read(dir, "CHANGELOG.md") + read(dir, "package.json"), before);
  assert.equal(git(dir, "tag", "-l", "v1.1.0"), "");
});
test("dry run asks the remote when origin/HEAD is not set", () => {
  const { dir } = repo();
  git(dir, "remote", "set-head", "origin", "-d");
  const out = execFileSync("node", [bin, "patch"], { cwd: dir, encoding: "utf8" });
  assert.match(out, /Preflight \(without fetch and npm test\): ok/);
});
test("dry run reports problems and exits 1", () => {
  const { dir } = repo();
  fs.writeFileSync(path.join(dir, "dirty.txt"), "x");
  const res = spawnSync("node", [bin, "patch", "--json"], { cwd: dir, encoding: "utf8" });
  assert.equal(res.status, 1);
  assert.deepEqual(JSON.parse(res.stdout).problems, ["preflight: working tree is not clean"]);
});
test("--yes updates CHANGELOG, runs the version script, commits and tags, but does not push", () => {
  const version = `node -e "require('fs').writeFileSync('manifest.json', process.env.npm_package_version)" && git add manifest.json`;
  const lock = { name: "@acme/widget", version: "1.0.0", lockfileVersion: 3, requires: true, packages: { "": { name: "@acme/widget", version: "1.0.0" } } };
  const { dir, remote } = repo({ scripts: { test: "node -e 0", version }, files: { "package-lock.json": JSON.stringify(lock, null, 2) + "\n" } });
  const deps = fakeDeps();
  const p = plan("minor", { cwd: dir }, deps);
  assert.deepEqual(p.problems, []);
  execute(p, { cwd: dir }, deps);
  assert.ok(deps.calls.includes("git fetch --quiet"));
  assert.ok(deps.calls.includes("npm test"));
  assert.equal(git(dir, "log", "-1", "--format=%B"), "Release 1.1.0");
  assert.equal(git(dir, "cat-file", "-t", "v1.1.0"), "tag");
  assert.equal(git(dir, "rev-parse", "v1.1.0^{commit}"), git(dir, "rev-parse", "HEAD"));
  assert.equal(git(dir, "status", "--porcelain"), "");
  assert.deepEqual(git(dir, "show", "--name-only", "--format=", "HEAD").split("\n").sort(), ["CHANGELOG.md", "manifest.json", "package-lock.json", "package.json"]);
  assert.equal(git(dir, "show", "HEAD:manifest.json"), "1.1.0");
  assert.equal(JSON.parse(git(dir, "show", "HEAD:package-lock.json")).version, "1.1.0");
  assert.match(read(dir, "CHANGELOG.md"), /## \[Unreleased\]\n\n## \[1\.1\.0\] - 2026-03-04\n\n- New thing\./);
  assert.match(read(dir, "CHANGELOG.md"), /\[1\.1\.0\]: https:\/\/github.com\/acme\/widget\/compare\/v1\.0\.0\.\.\.v1\.1\.0/);
  assert.equal(git(remote, "tag", "-l", "v1.1.0"), "");
  pushRelease(p, { cwd: dir }, deps);
  assert.equal(git(remote, "tag", "-l", "v1.1.0"), "v1.1.0");
  assert.equal(git(remote, "log", "-1", "--format=%s", "main"), "Release 1.1.0");
});
test("signs the tag when git config asks for signing", () => {
  const { dir } = repo();
  const deps = fakeDeps({ run: (cmd, args) => (args.at(-1) === "commit.gpgsign" ? "true" : undefined) });
  const p = plan("patch", { cwd: dir }, deps);
  assert.ok(p.sign);
  assert.deepEqual(p.tagArgs, ["tag", "-a", "-s", "v1.0.1", "-m", "v1.0.1"]);
});
test("first release links the version to its tag", () => {
  const { dir } = repo({ tag: false, files: { "CHANGELOG.md": "# Changelog\n\n## [Unreleased]\n\n- First.\n" } });
  const p = plan("1.0.0", { cwd: dir }, fakeDeps());
  assert.match(p.changelog.text, /\[1\.0\.0\]: .*\/releases\/tag\/v1\.0\.0/);
});
const refuses = (name, setup, pattern, kind = "patch") =>
  test(`refuses: ${name}`, () => {
    const r = repo(setup.repo);
    setup.before?.(r.dir);
    const head = git(r.dir, "rev-parse", "HEAD");
    const changelog = read(r.dir, "CHANGELOG.md");
    const deps = fakeDeps();
    assert.throws(() => execute(plan(kind, { cwd: r.dir, allowEmpty: setup.allowEmpty }, deps), { cwd: r.dir }, deps), pattern);
    assert.equal(git(r.dir, "rev-parse", "HEAD"), head);
    assert.equal(read(r.dir, "CHANGELOG.md"), changelog);
  });
refuses("dirty tree", { before: (dir) => fs.writeFileSync(path.join(dir, "x.txt"), "x") }, /working tree is not clean/);
refuses("not on the default branch", { before: (dir) => git(dir, "checkout", "-q", "-b", "feature") }, /on feature, not on the default branch main/);
refuses("behind upstream", { before: (dir) => {
  git(dir, "commit", "-q", "--allow-empty", "-m", "later");
  git(dir, "push", "-q");
  git(dir, "reset", "-q", "--hard", "HEAD~1");
} }, /main is 1 commit\(s\) behind origin\/main/);
refuses("failing tests", { repo: { scripts: { test: "node -e \"console.log('boom'); process.exit(1)\"" } } }, /npm test failed\n[\s\S]*boom/);
refuses("empty Unreleased", { repo: { files: { "CHANGELOG.md": "# Changelog\n\n## [Unreleased]\n" } } }, /empty/);
refuses("equal version", {}, /1\.0\.0 is not greater than the current version 1\.0\.0/, "1.0.0");
refuses("lower version", {}, /0\.9\.0 is not greater than the current version 1\.0\.0/, "0.9.0");
refuses("lower prerelease", { repo: { version: "2.0.0-rc.2" } }, /2\.0\.0-rc\.1 is not greater/, "2.0.0-rc.1");
test("first release of the next version from an untagged package.json", () => {
  const { dir } = repo({ tag: false, version: "0.1.0", files: { "CHANGELOG.md": "# Changelog\n\n## [Unreleased]\n\n- First.\n" } });
  assert.deepEqual(plan("1.0.0", { cwd: dir }, fakeDeps()).problems, []);
});
refuses("existing tag", { before: (dir) => git(dir, "tag", "v1.0.1") }, /tag v1\.0\.1 already exists/);
test("--allow-empty-changelog releases with an empty section", () => {
  const { dir } = repo({ files: { "CHANGELOG.md": "# Changelog\n\n## [Unreleased]\n\n[Unreleased]: https://github.com/acme/widget/compare/v1.0.0...HEAD\n" } });
  const deps = fakeDeps();
  execute(plan("patch", { cwd: dir, allowEmpty: true }, deps), { cwd: dir }, deps);
  assert.equal(git(dir, "describe", "--tags"), "v1.0.1");
  assert.match(read(dir, "CHANGELOG.md"), /## \[1\.0\.1\] - 2026-03-04\n\n\[Unreleased\]/);
});
test("a failure mid-release names the undo command", () => {
  const { dir } = repo();
  const hooks = path.join(dir, "..", "hooks");
  fs.mkdirSync(hooks);
  fs.writeFileSync(path.join(hooks, "pre-commit"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  const head = git(dir, "rev-parse", "HEAD");
  const deps = fakeDeps();
  assert.throws(() => execute(plan("patch", { cwd: dir }, deps), { cwd: dir }, deps), new RegExp(`git commit[\\s\\S]*\\nUndo with: git reset --hard ${head}$`));
  assert.notEqual(git(dir, "status", "--porcelain"), "");
  git(dir, "reset", "-q", "--hard", head);
  assert.equal(git(dir, "status", "--porcelain"), "");
});
test("a gitignored package-lock.json is not staged", () => {
  const { dir } = repo({ files: { ".gitignore": "node_modules/\npackage-lock.json\n", "package-lock.json": "{}\n" } });
  const deps = fakeDeps();
  const p = plan("patch", { cwd: dir }, deps);
  assert.deepEqual(p.stage, ["package.json", "CHANGELOG.md"]);
  execute(p, { cwd: dir }, deps);
  assert.equal(git(dir, "describe", "--tags"), "v1.0.1");
});
