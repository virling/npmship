const isLink = (line) => /^\[[^\]]+\]:\s+\S/.test(line);
const isUnreleased = (line) => /^\[Unreleased\]:/i.test(line);

function bounds(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((l) => /^## \[Unreleased\]/i.test(l));
  if (start < 0) throw new Error("CHANGELOG.md has no ## [Unreleased] heading");
  let linkStart = lines.length;
  for (let i = lines.length - 1; i > start && (isLink(lines[i]) || !lines[i].trim()); i--) if (isLink(lines[i])) linkStart = i;
  const next = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  return { lines, start, linkStart, end: next < 0 || next > linkStart ? linkStart : next };
}

export function releaseChangelog(text, { version, prev, date, repoUrl, allowEmpty }) {
  const { lines, start, linkStart, end } = bounds(text);
  if (lines.some((l) => l.startsWith(`## [${version}]`))) throw new Error(`CHANGELOG.md already has a ${version} section`);
  const body = lines.slice(start + 1, end).join("\n").trim();
  if (!body && !allowEmpty) throw new Error("## [Unreleased] in CHANGELOG.md is empty (use --allow-empty-changelog)");
  const links = lines.slice(linkStart).filter((l) => l.trim());
  const unreleased = links.find(isUnreleased);
  const base = unreleased ? unreleased.replace(/^\[Unreleased\]:\s*/i, "").replace(/\/(compare|commits|tree)\/.*$/, "") : repoUrl;
  if (!base) throw new Error("no [Unreleased] compare link in CHANGELOG.md and no git remote to build one");
  const newLinks = [
    `[Unreleased]: ${base}/compare/v${version}...HEAD`,
    prev ? `[${version}]: ${base}/compare/v${prev}...v${version}` : `[${version}]: ${base}/releases/tag/v${version}`,
  ];
  const section = `## [${version}] - ${date}` + (body ? `\n\n${body}` : "");
  const middle = lines.slice(end, linkStart).join("\n").trim();
  const parts = [lines.slice(0, start + 1).join("\n"), section, middle, [...newLinks, ...links.filter((l) => !isUnreleased(l))].join("\n")];
  return { text: parts.filter(Boolean).join("\n\n") + "\n", body };
}

export function insertDraft(text, groups) {
  const { lines, start, end } = bounds(text);
  const body = lines.slice(start + 1, end).join("\n").trimEnd().split("\n");
  let added = 0;
  for (const [name, subjects] of Object.entries(groups)) {
    const bullets = [...new Set(subjects.map((s) => `- ${s}`))].filter((b) => !body.some((l) => l.trim() === b));
    if (!bullets.length) continue;
    added += bullets.length;
    const head = body.findIndex((l) => l.trim() === `### ${name}`);
    if (head < 0) {
      body.push("", `### ${name}`, "", ...bullets);
      continue;
    }
    let last = head;
    for (let i = head + 1; i < body.length && !body[i].startsWith("### "); i++) if (body[i].trim()) last = i;
    body.splice(last + 1, 0, ...(last === head ? ["", ...bullets] : bullets));
  }
  const parts = [lines.slice(0, start + 1).join("\n"), body.join("\n").trim(), lines.slice(end).join("\n").trim()];
  return { text: parts.filter(Boolean).join("\n\n") + "\n", added };
}

export function localDate(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
