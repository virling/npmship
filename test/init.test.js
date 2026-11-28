import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { CHANGELOG, nodeVersions } from "../src/init.js";
import { git, tmp } from "./helpers.js";

const bin = new URL("../bin/npmship.js", import.meta.url).pathname;
const run = (cwd, ...args) => execFileSync("node", [bin, "init", ...args], { cwd, encoding: "utf8" });

function pkgDir(pkg) {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg));
  git(dir, "init", "-q");
  git(dir, "remote", "add", "origin", "git@github.com:acme/widget.git");
  return dir;
}

test("nodeVersions follows engines.node", () => {
  assert.deepEqual(nodeVersions(">=20"), [20, 22, 24]);
  assert.deepEqual(nodeVersions("^22.3.0"), [22, 24]);
  assert.deepEqual(nodeVersions(undefined), [20, 22, 24]);
  assert.deepEqual(nodeVersions(">=30"), [24]);
});

test("init prints the plan and the trust command, and changes nothing without --write", () => {
  const dir = pkgDir({ name: "@acme/widget", engines: { node: ">=22" } });
  const out = run(dir);
  assert.match(out, /create  \.github\/workflows\/test\.yml/);
  assert.match(out, /Re-run with --write/);
  assert.match(out, /npm trust github @acme\/widget --file release\.yml --repo acme\/widget --allow-publish --yes/);
  assert.deepEqual(fs.readdirSync(dir).sort(), [".git", "package.json"]);
});

test("init --write creates missing files, keeps existing ones, and adds the major tag step for actions", () => {
  const dir = pkgDir({ name: "widget", engines: { node: ">=22" } });
  fs.writeFileSync(path.join(dir, "CHANGELOG.md"), "# Mine\n");
  fs.writeFileSync(path.join(dir, "action.yml"), "name: x\n");
  const out = run(dir, "--write");
  assert.match(out, /created \.github\/workflows\/release\.yml/);
  assert.match(out, /exists  CHANGELOG\.md/);
  assert.equal(fs.readFileSync(path.join(dir, "CHANGELOG.md"), "utf8"), "# Mine\n");
  assert.match(fs.readFileSync(path.join(dir, ".github/workflows/test.yml"), "utf8"), /node: \[22, 24\]/);
  assert.match(fs.readFileSync(path.join(dir, ".github/workflows/release.yml"), "utf8"), /Move the major tag/);
  assert.doesNotMatch(run(dir), /Re-run with --write/);
});

test("init without a remote or action leaves placeholders and skips the major tag step", () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "solo" }));
  git(dir, "init", "-q");
  const out = run(dir, "--write");
  assert.match(out, /--repo <owner>\/<repo>/);
  assert.equal(fs.readFileSync(path.join(dir, "CHANGELOG.md"), "utf8"), CHANGELOG);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, ".github/workflows/release.yml"), "utf8"), /major tag/);
});

test("init writes the same test.yml and release.yml this repo uses", () => {
  const dir = pkgDir({ name: "widget", engines: { node: ">=20" } });
  run(dir, "--write");
  const workflow = fs.readFileSync(path.join(dir, ".github/workflows/test.yml"), "utf8");
  assert.match(workflow, /\n\npermissions:\n  contents: read\n\njobs:\n/);
  assert.equal(workflow, fs.readFileSync(new URL("../.github/workflows/test.yml", import.meta.url), "utf8"));
  const release = fs.readFileSync(path.join(dir, ".github/workflows/release.yml"), "utf8");
  assert.match(release, /elif \[\[ "\$TAG" == \*-\* \]\]; then\n\s+npm publish --provenance --access public --tag next/);
  assert.equal(release, fs.readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8"));
});
