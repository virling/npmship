import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

export const REGISTRY = "https://registry.npmjs.org";

export function untar(buf) {
  const files = [];
  let paxPath;
  for (let off = 0; off + 512 <= buf.length && buf[off]; ) {
    const field = (a, b) => buf.toString("utf8", off + a, off + b).replace(/\0[\s\S]*$/, "");
    const size = parseInt(field(124, 136).trim() || "0", 8);
    const type = field(156, 157);
    const data = buf.subarray(off + 512, off + 512 + size);
    const prefix = field(345, 500);
    if (type === "x") paxPath = data.toString().match(/\d+ path=(.*)\n/)?.[1];
    else if (type === "0" || type === "") {
      files.push({ name: paxPath || (prefix ? `${prefix}/` : "") + field(0, 100), data });
      paxPath = undefined;
    }
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

function packedFiles(tag, cwd, deps) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "npmship-"));
  deps.run("git", ["archive", "--format=tar", "-o", path.join(dir, "src.tar"), tag], cwd);
  for (const file of untar(fs.readFileSync(path.join(dir, "src.tar")))) {
    fs.mkdirSync(path.join(dir, "src", path.dirname(file.name)), { recursive: true });
    fs.writeFileSync(path.join(dir, "src", file.name), file.data);
  }
  const [pack] = JSON.parse(deps.run("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], path.join(dir, "src")));
  fs.rmSync(dir, { recursive: true, force: true });
  return pack.files.map((f) => f.path);
}

async function poll(check, { wait, timeout, interval }, deps) {
  const deadline = deps.now() + timeout;
  let last;
  for (;;) {
    const result = await check();
    if (result.status !== "pending") return result;
    if (!wait) return { ...result, status: "fail" };
    if (deps.now() >= deadline) return { status: "fail", detail: `timed out: ${result.detail}` };
    if (result.detail !== last) deps.progress(`waiting: ${result.detail}`);
    last = result.detail;
    await deps.sleep(interval);
  }
}

const guard = async (name, fn) => {
  try {
    return { name, ...(await fn()) };
  } catch (e) {
    return { name, status: "fail", detail: String(e.stderr || e.message).trim().split("\n")[0] };
  }
};

export async function verify({ cwd, version, wait = false, timeout = 30 * 60e3, interval = 15e3 }, deps) {
  const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
  version ||= pkg.version;
  const tag = `v${version}`;
  const opts = { wait, timeout, interval };
  const checks = [];

  checks.push(await guard("ci", () => poll(async () => {
    const runs = JSON.parse(deps.run("gh", ["run", "list", "--branch", tag, "--json", "status,conclusion,workflowName,url"], cwd));
    if (!runs.length) return { status: "pending", detail: `no GitHub Actions run for ${tag} yet` };
    const open = runs.find((r) => r.status !== "completed");
    if (open) return { status: "pending", detail: `${open.workflowName} is ${open.status}: ${open.url}` };
    const bad = runs.find((r) => r.conclusion !== "success");
    if (bad) return { status: "fail", detail: `${bad.workflowName} ${bad.conclusion}: ${bad.url}` };
    return { status: "ok", detail: runs.map((r) => `${r.workflowName} succeeded: ${r.url}`).join(", ") };
  }, opts, deps)));

  let doc;
  const ciFailed = checks[0].status === "fail";
  checks.push(await guard("npm", () => poll(async () => {
    const res = await deps.fetch(`${REGISTRY}/${pkg.name.replace("/", "%2f")}`);
    if (res.status === 404) return { status: "pending", detail: `${pkg.name} is not on the registry` };
    if (!res.ok) return { status: "pending", detail: `registry returned ${res.status}` };
    doc = await res.json();
    if (!doc.versions?.[version]) return { status: "pending", detail: `${pkg.name}@${version} is not on the registry yet` };
    return { status: "ok", detail: `${pkg.name}@${version} is on ${REGISTRY}` };
  }, { ...opts, wait: wait && !ciFailed }, deps)));

  const published = doc?.versions?.[version];
  const skip = (name) => ({ name, status: "skip", detail: "version is not published" });

  if (!published) checks.push(skip("latest"));
  else if (doc["dist-tags"]?.latest === version) checks.push({ name: "latest", status: "ok", detail: `dist-tags.latest is ${version}` });
  else checks.push({ name: "latest", status: "warn", detail: `dist-tags.latest is ${doc["dist-tags"]?.latest}${version.includes("-") ? " (prerelease)" : ""}` });

  if (!published) checks.push(skip("provenance"));
  else if (published.dist?.attestations) checks.push({ name: "provenance", status: "ok", detail: published.dist.attestations.provenance?.predicateType || "attestations present" });
  else {
    const before = Object.entries(doc.versions).filter(([v, d]) => v !== version && d.dist?.attestations).map(([v]) => v);
    checks.push(before.length
      ? { name: "provenance", status: "fail", detail: `no provenance, but ${before.at(-1)} had it` }
      : { name: "provenance", status: "warn", detail: "no provenance (never published with it)" });
  }

  checks.push(await guard("github-release", async () => {
    const { url } = JSON.parse(deps.run("gh", ["release", "view", tag, "--json", "url"], cwd));
    return { status: "ok", detail: url };
  }));

  checks.push(published ? await guard("files", async () => {
    const expected = packedFiles(tag, cwd, deps);
    const res = await deps.fetch(published.dist.tarball);
    if (!res.ok) return { status: "fail", detail: `tarball download returned ${res.status}` };
    const actual = untar(zlib.gunzipSync(Buffer.from(await res.arrayBuffer()))).map((f) => f.name.replace(/^[^/]+\//, ""));
    const missing = expected.filter((f) => !actual.includes(f));
    const extra = actual.filter((f) => !expected.includes(f));
    if (missing.length) return { status: "fail", detail: `missing from tarball: ${missing.join(", ")}` };
    return { status: "ok", detail: `${actual.length} files match ${tag}${extra.length ? `, extra: ${extra.join(", ")}` : ""}` };
  }) : skip("files"));

  return { name: pkg.name, version, tag, ok: !checks.some((c) => c.status === "fail"), checks };
}

export const formatChecks = (checks) => checks.map((c) => `${c.status.padEnd(5)} ${c.name.padEnd(15)} ${c.detail}`).join("\n");
