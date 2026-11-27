import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { insertDraft } from "../src/changelog.js";
import { draft, section } from "../src/draft.js";
import { fakeDeps, git, repo } from "./helpers.js";

const bin = new URL("../bin/npmship.js", import.meta.url).pathname;
const read = (dir) => fs.readFileSync(path.join(dir, "CHANGELOG.md"), "utf8");
const commit = (dir, subject, file = `src/${subject.replace(/\W+/g, "-")}.js`) => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.appendFileSync(path.join(dir, file), `${subject}\n`);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", subject);
};
const subjects = (groups) => Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.map((c) => c.subject)]));

test("groups by the first word of the subject", () => {
  assert.equal(section("Add a flag"), "Added");
  assert.equal(section("Support Node 24"), "Added");
  assert.equal(section("Fix the parser"), "Fixed");
  assert.equal(section("Handle CRLF"), "Fixed");
  assert.equal(section("Drop Node 18"), "Removed");
  assert.equal(section("Rename the option"), "Changed");
  assert.equal(section("Adding things"), "Changed");
});
test("drafts commits since the highest release tag, skipping releases, tests, CI and docs", () => {
  const { dir } = repo();
  commit(dir, "Fix the parser");
  git(dir, "tag", "v1.0.10");
  git(dir, "tag", "v1.0.9");
  git(dir, "tag", "v2.0.0-rc.1");
  commit(dir, "Add a flag");
  commit(dir, "Release 1.1.0", "package.json");
  commit(dir, "Cover the flag", "test/flag.test.js");
  commit(dir, "Run CI on Node 24", ".github/workflows/ci.yml");
  commit(dir, "Document the flag", "docs/flag.md");
  commit(dir, "Drop the old flag");
  commit(dir, "Rename the option");
  commit(dir, "Fix the flag", "src/flag.js");
  fs.writeFileSync(path.join(dir, "README.md"), "x\n");
  commit(dir, "Support Windows", "src/win.js");
  git(dir, "checkout", "-q", "-b", "side");
  commit(dir, "Tweak on side");
  git(dir, "checkout", "-q", "main");
  git(dir, "merge", "-q", "--no-ff", "-m", "Merge side", "side");
  const d = draft({ cwd: dir }, fakeDeps());
  assert.equal(d.tag, "v1.0.10");
  assert.deepEqual(subjects(d.groups), {
    Added: ["Add a flag", "Support Windows"],
    Changed: ["Rename the option", "Tweak on side"],
    Removed: ["Drop the old flag"],
    Fixed: ["Fix the flag"],
  });
  assert.equal(d.count, 6);
  assert.deepEqual(d.skipped.map((c) => c.subject), ["Release 1.1.0", "Cover the flag", "Run CI on Node 24", "Document the flag"]);
});
test("drafts every commit when there is no release tag yet", () => {
  const { dir } = repo({ tag: false });
  commit(dir, "Add a flag");
  const d = draft({ cwd: dir }, fakeDeps());
  assert.equal(d.tag, null);
  assert.deepEqual(subjects(d.groups), { Changed: ["Initial"], Added: ["Add a flag"] });
});
test("without --write prints the draft and changes nothing", () => {
  const { dir } = repo();
  commit(dir, "Add a flag");
  const before = read(dir);
  const out = execFileSync("node", [bin, "draft"], { cwd: dir, encoding: "utf8" });
  assert.match(out, /1 commit since v1\.0\.0 \(0 skipped\)\n\n## \[Unreleased\]\n\n### Added\n\n- Add a flag\n/);
  assert.equal(read(dir), before);
  assert.equal(git(dir, "status", "--porcelain"), "");
  const json = JSON.parse(execFileSync("node", [bin, "draft", "--json"], { cwd: dir, encoding: "utf8" }));
  assert.deepEqual(subjects(json.groups), { Added: ["Add a flag"] });
});
test("--write merges into existing subsections without duplicating bullets", () => {
  const changelog = "# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Add a flag\n- Hand-written entry.\n\n### Fixed\n\n## [1.0.0] - 2026-01-01\n\n- First.\n\n[Unreleased]: https://github.com/acme/widget/compare/v1.0.0...HEAD\n";
  const { dir } = repo({ files: { "CHANGELOG.md": changelog } });
  commit(dir, "Add a flag");
  commit(dir, "Support Windows");
  commit(dir, "Fix the flag");
  commit(dir, "Rename the option");
  execFileSync("node", [bin, "draft", "--write"], { cwd: dir, encoding: "utf8" });
  const expected = "# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Add a flag\n- Hand-written entry.\n- Support Windows\n\n### Fixed\n\n- Fix the flag\n\n### Changed\n\n- Rename the option\n\n## [1.0.0] - 2026-01-01\n\n- First.\n\n[Unreleased]: https://github.com/acme/widget/compare/v1.0.0...HEAD\n";
  assert.equal(read(dir), expected);
  const out = execFileSync("node", [bin, "draft", "--write"], { cwd: dir, encoding: "utf8" });
  assert.match(out, /already has all of them/);
  assert.equal(read(dir), expected);
});
test("insertDraft adds subsections to an empty Unreleased section", () => {
  const { text, added } = insertDraft("# Changelog\n\n## [Unreleased]\n\n[Unreleased]: https://x/compare/v1.0.0...HEAD\n", { Added: ["Add a", "Add a"], Fixed: ["Fix b"] });
  assert.equal(added, 2);
  assert.equal(text, "# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Add a\n\n### Fixed\n\n- Fix b\n\n[Unreleased]: https://x/compare/v1.0.0...HEAD\n");
});
test("--write refuses a CHANGELOG without an Unreleased heading", () => {
  const { dir } = repo({ files: { "CHANGELOG.md": "# Changelog\n\n## [1.0.0] - 2026-01-01\n\n- First.\n" } });
  commit(dir, "Add a flag");
  const before = read(dir);
  const res = spawnSync("node", [bin, "draft", "--write"], { cwd: dir, encoding: "utf8" });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /CHANGELOG\.md has no ## \[Unreleased\] heading/);
  assert.equal(read(dir), before);
});
test("release dry run hints at draft when Unreleased is empty", () => {
  const { dir } = repo({ files: { "CHANGELOG.md": "# Changelog\n\n## [Unreleased]\n" } });
  commit(dir, "Add a flag");
  commit(dir, "Cover it", "test/a.test.js");
  const res = spawnSync("node", [bin, "patch"], { cwd: dir, encoding: "utf8" });
  assert.equal(res.status, 1);
  assert.match(res.stdout, /run `npmship draft --write` to draft it from 1 commit since v1\.0\.0/);
});
