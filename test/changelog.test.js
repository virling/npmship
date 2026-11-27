import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { localDate, releaseChangelog } from "../src/changelog.js";

const fixture = (name) => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const opts = { date: "2026-03-04", repoUrl: "https://github.com/acme/widget" };

test("moves Unreleased entries under the new version and updates links", () => {
  const { text, body } = releaseChangelog(fixture("released.md"), { ...opts, version: "1.2.0", prev: "1.1.0" });
  assert.equal(text, fixture("released.expected.md"));
  assert.match(body, /^### Added/);
});
test("uses the existing Unreleased link as the base, not the remote", () => {
  const { text } = releaseChangelog(fixture("released.md"), { ...opts, repoUrl: "https://example.com/other", version: "1.2.0", prev: "1.1.0" });
  assert.equal(text, fixture("released.expected.md"));
});
test("refuses an empty Unreleased section", () => {
  assert.throws(() => releaseChangelog(fixture("empty.md"), { ...opts, version: "1.1.1", prev: "1.1.0" }), /empty.*--allow-empty-changelog/);
});
test("allows an empty Unreleased section when asked", () => {
  const { text } = releaseChangelog(fixture("empty.md"), { ...opts, version: "1.1.1", prev: "1.1.0", allowEmpty: true });
  assert.match(text, /## \[Unreleased\]\n\n## \[1\.1\.1\] - 2026-03-04\n\n## \[1\.1\.0\]/);
  assert.match(text, /\[Unreleased\]: https:\/\/github.com\/acme\/widget\/compare\/v1\.1\.1\.\.\.HEAD\n\[1\.1\.1\]: https:\/\/github.com\/acme\/widget\/compare\/v1\.1\.0\.\.\.v1\.1\.1\n\[1\.1\.0\]/);
});
test("adds a links section when there is none, keeping reference links in entries", () => {
  const { text } = releaseChangelog(fixture("no-links.md"), { ...opts, version: "0.2.0", prev: "0.1.0" });
  assert.equal(text, fixture("no-links.expected.md"));
});
test("fails without links and without a remote", () => {
  assert.throws(() => releaseChangelog(fixture("no-links.md"), { ...opts, repoUrl: "", version: "0.2.0", prev: "0.1.0" }), /no \[Unreleased\] compare link/);
});
test("first release links to the tag", () => {
  const { text } = releaseChangelog(fixture("first.md"), { ...opts, version: "1.0.0", prev: null });
  assert.equal(text, fixture("first.expected.md"));
});
test("first release with a commits link", () => {
  const input = "# Changelog\n\n## [Unreleased]\n\n- One.\n\n[Unreleased]: https://github.com/acme/widget/commits/main\n";
  const { text } = releaseChangelog(input, { ...opts, repoUrl: "", version: "1.0.0", prev: null });
  assert.equal(text, fixture("first.expected.md").replace("Initial release", "One"));
});
test("refuses a missing Unreleased heading or an existing version", () => {
  assert.throws(() => releaseChangelog("# Changelog\n\n## [1.0.0]\n", { ...opts, version: "1.0.1", prev: "1.0.0" }), /no ## \[Unreleased\]/);
  assert.throws(() => releaseChangelog(fixture("released.md"), { ...opts, version: "1.1.0", prev: "1.0.0" }), /already has a 1\.1\.0/);
});
test("handles CRLF line endings", () => {
  const { text } = releaseChangelog(fixture("released.md").replace(/\n/g, "\r\n"), { ...opts, version: "1.2.0", prev: "1.1.0" });
  assert.equal(text, fixture("released.expected.md"));
});
test("localDate uses the local calendar day", () => {
  assert.equal(localDate(new Date(2026, 0, 5, 23, 59).getTime()), "2026-01-05");
});
