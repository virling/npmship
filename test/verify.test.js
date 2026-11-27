import assert from "node:assert/strict";
import zlib from "node:zlib";
import { test } from "node:test";
import { REGISTRY, untar, verify } from "../src/verify.js";
import { fakeDeps, repo, tgz } from "./helpers.js";

const DOC_URL = `${REGISTRY}/@acme%2fwidget`;
const TARBALL = `${REGISTRY}/@acme/widget/-/widget-1.0.0.tgz`;
const run = { workflowName: "release", status: "completed", conclusion: "success", url: "https://github.com/acme/widget/actions/runs/1" };
const doc = (extra = {}) => ({
  "dist-tags": { latest: "1.0.0" },
  versions: { "1.0.0": { dist: { tarball: TARBALL, attestations: { provenance: { predicateType: "https://slsa.dev/provenance/v1" } } } } },
  ...extra,
});
const good = () => ({
  gh: { "run list": [run], "release view": { url: "https://github.com/acme/widget/releases/tag/v1.0.0" } },
  http: { [DOC_URL]: doc(), [TARBALL]: tgz({ "package/package.json": "{}", "package/index.js": "" }) },
});
const status = (result) => Object.fromEntries(result.checks.map((c) => [c.name, c.status]));

test("untar reads names and data", () => {
  const files = untar(zlib.gunzipSync(tgz({ "package/a.txt": "hello", "package/dir/b.txt": "x".repeat(600) })));
  assert.deepEqual(files.map((f) => f.name), ["package/a.txt", "package/dir/b.txt"]);
  assert.equal(files[0].data.toString(), "hello");
  assert.equal(files[1].data.length, 600);
});
test("all checks pass for a good release", async () => {
  const { dir } = repo();
  const result = await verify({ cwd: dir }, fakeDeps(good()));
  assert.ok(result.ok);
  assert.deepEqual(status(result), { ci: "ok", npm: "ok", latest: "ok", provenance: "ok", "github-release": "ok", files: "ok" });
  assert.match(result.checks.at(-1).detail, /2 files match v1\.0\.0/);
});
test("reports files missing from the tarball", async () => {
  const { dir } = repo();
  const deps = good();
  deps.http[TARBALL] = tgz({ "package/package.json": "{}" });
  const result = await verify({ cwd: dir }, fakeDeps(deps));
  assert.equal(result.ok, false);
  assert.equal(result.checks.at(-1).detail, "missing from tarball: index.js");
});
test("failed CI fails and does not wait for npm", async () => {
  const { dir } = repo();
  const deps = good();
  deps.gh["run list"] = [{ ...run, conclusion: "failure" }];
  delete deps.http[DOC_URL];
  const fake = fakeDeps(deps);
  const result = await verify({ cwd: dir, wait: true }, fake);
  assert.equal(result.ok, false);
  assert.deepEqual(status(result), { ci: "fail", npm: "fail", latest: "skip", provenance: "skip", "github-release": "ok", files: "skip" });
  assert.match(result.checks[0].detail, /release failure: https/);
  assert.equal(fake.logs.length, 0);
});
test("--wait polls CI and the registry until the release lands", async () => {
  const { dir } = repo();
  const deps = good();
  const ci = [[], [{ ...run, status: "in_progress" }], [run]];
  deps.gh["run list"] = () => ci.shift() || [run];
  const registry = [{ "dist-tags": {}, versions: {} }];
  deps.http[DOC_URL] = () => registry.shift() || doc();
  const fake = fakeDeps(deps);
  const result = await verify({ cwd: dir, wait: true, interval: 1000 }, fake);
  assert.ok(result.ok, JSON.stringify(result.checks));
  assert.deepEqual(fake.logs, ["waiting: no GitHub Actions run for v1.0.0 yet", "waiting: release is in_progress: https://github.com/acme/widget/actions/runs/1", "waiting: @acme/widget@1.0.0 is not on the registry yet"]);
});
test("--wait times out", async () => {
  const { dir } = repo();
  const deps = good();
  deps.gh["run list"] = [{ ...run, status: "queued" }];
  const result = await verify({ cwd: dir, wait: true, timeout: 5000, interval: 1000 }, fakeDeps(deps));
  assert.equal(result.checks[0].status, "fail");
  assert.match(result.checks[0].detail, /^timed out: release is queued/);
});
test("without --wait a missing run or version fails", async () => {
  const { dir } = repo();
  const result = await verify({ cwd: dir }, fakeDeps({ gh: { "run list": [], "release view": new Error("release not found") } }));
  assert.deepEqual(status(result), { ci: "fail", npm: "fail", latest: "skip", provenance: "skip", "github-release": "fail", files: "skip" });
  assert.equal(result.checks[4].detail, "release not found");
});
test("missing provenance fails only when earlier versions had it", async () => {
  const { dir } = repo();
  const deps = good();
  deps.http[DOC_URL] = doc({ versions: { "0.9.0": { dist: { attestations: {} } }, "1.0.0": { dist: { tarball: TARBALL } } } });
  let result = await verify({ cwd: dir }, fakeDeps(deps));
  assert.equal(result.checks[3].status, "fail");
  assert.match(result.checks[3].detail, /0\.9\.0 had it/);
  deps.http[DOC_URL] = doc({ versions: { "1.0.0": { dist: { tarball: TARBALL } } } });
  result = await verify({ cwd: dir }, fakeDeps(deps));
  assert.equal(result.checks[3].status, "warn");
  assert.ok(result.ok);
});
test("a version that is not latest warns", async () => {
  const { dir } = repo();
  const deps = good();
  deps.http[DOC_URL] = doc({ "dist-tags": { latest: "2.0.0" } });
  const result = await verify({ cwd: dir }, fakeDeps(deps));
  assert.equal(result.checks[2].status, "warn");
  assert.ok(result.ok);
});
