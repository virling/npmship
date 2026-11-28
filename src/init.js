import fs from "node:fs";
import path from "node:path";
import { webUrl } from "./release.js";

const NODE_VERSIONS = [20, 22, 24];

export const testWorkflow = (nodes) => `name: test

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  test:
    runs-on: \${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest]
        node: [${nodes.join(", ")}]
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: \${{ matrix.node }}
      - run: npm test
`;

const MAJOR_TAG = `      - name: Move the major tag used by the GitHub Action
        run: |
          MAJOR="\${TAG%%.*}"
          LATEST=$(git ls-remote --tags --refs origin "$MAJOR.*" | sed 's|.*refs/tags/||' | sort -V | tail -1)
          if [ "$LATEST" = "$TAG" ]; then
            git tag -f "$MAJOR" HEAD
            git push -f origin "refs/tags/$MAJOR"
          fi
`;

export const releaseWorkflow = (action) => `name: release

on:
  push:
    tags: ["v*.*.*"]
  workflow_dispatch:
    inputs:
      tag:
        description: Existing tag to publish, e.g. v0.3.0
        required: true

permissions:
  contents: write
  id-token: write

jobs:
  publish:
    runs-on: ubuntu-latest
    env:
      TAG: \${{ inputs.tag || github.ref_name }}
    steps:
      - uses: actions/checkout@v7
        with:
          ref: \${{ env.TAG }}
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          registry-url: https://registry.npmjs.org
      - name: Check tag matches package.json
        run: test "v$(node -p 'require("./package.json").version')" = "$TAG"
      - run: npm test
      - name: Publish to npm (trusted publishing)
        run: |
          NAME="$(node -p 'require("./package.json").name')"
          if npm view "$NAME@\${TAG#v}" version >/dev/null 2>&1; then
            echo "Already on npm"
          elif [[ "$TAG" == *-* ]]; then
            npm publish --provenance --access public --tag next
          else
            npm publish --provenance --access public
          fi
      - name: Create GitHub release from CHANGELOG
        env:
          GH_TOKEN: \${{ github.token }}
        run: |
          VERSION="\${TAG#v}"
          awk -v v="$VERSION" '$0 ~ "^## \\\\[" v "\\\\]" {f=1; next} /^## / {f=0} f' CHANGELOG.md > notes.md
          gh release view "$TAG" >/dev/null 2>&1 || gh release create "$TAG" --title "$TAG" --notes-file notes.md
${action ? MAJOR_TAG : ""}`;

export const CHANGELOG = `# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]
`;

export function nodeVersions(engines = "") {
  const min = Number(engines.match(/\d+/)?.[0] || 0);
  const nodes = NODE_VERSIONS.filter((v) => v >= min);
  return nodes.length ? nodes : [NODE_VERSIONS.at(-1)];
}

export function init({ cwd, write = false }, deps) {
  const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
  const action = ["action.yml", "action.yaml"].some((f) => fs.existsSync(path.join(cwd, f)));
  const files = [
    { file: ".github/workflows/test.yml", content: testWorkflow(nodeVersions(pkg.engines?.node)) },
    { file: ".github/workflows/release.yml", content: releaseWorkflow(action) },
    { file: "CHANGELOG.md", content: CHANGELOG },
  ].map((f) => ({ ...f, exists: fs.existsSync(path.join(cwd, f.file)) }));
  if (write) {
    for (const f of files.filter((f) => !f.exists)) {
      fs.mkdirSync(path.dirname(path.join(cwd, f.file)), { recursive: true });
      fs.writeFileSync(path.join(cwd, f.file), f.content);
    }
  }
  const remote = deps.run("git", ["config", "--get", "--default=", "remote.origin.url"], cwd);
  const repo = webUrl(remote).match(/github\.com\/(.+)$/)?.[1] || "<owner>/<repo>";
  return {
    name: pkg.name,
    action,
    files: files.map(({ file, exists }) => ({ file, exists })),
    trust: `npm trust github ${pkg.name} --file release.yml --repo ${repo} --allow-publish --yes`,
  };
}
