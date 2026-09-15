#!/usr/bin/env node
// Structural checks that keep flow pages consistent. Everything here is
// mechanically verifiable — including the autonumber contract, which is the
// repository's headline promise. Judgement calls (are the pitfalls real? is
// the wire format right?) stay in human review.
//
//   node .github/scripts/check-structure.mjs [rootDir]

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname, resolve } from "node:path";

const ROOT = process.argv[2] ?? process.cwd();
const CATEGORIES = ["ai-systems", "auth", "distributed-systems", "networking", "data-and-delivery"];
const REQUIRED_FRONTMATTER = ["title", "category", "tags", "difficulty", "specs", "updated"];
const DIFFICULTIES = ["beginner", "intermediate", "advanced"];

const problems = [];
const fail = (file, msg) => problems.push(`${relative(ROOT, file).replace(/\\/g, "/")}: ${msg}`);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git" || entry === ".mermaid-tmp") continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (entry.endsWith(".md")) out.push(p);
  }
  return out;
}

// Repo-relative, forward-slash path — used for every path comparison below so
// the checks behave identically on Windows and Linux.
const rel = (f) => relative(ROOT, f).replace(/\\/g, "/");

// Strip a UTF-8 BOM. Some editors add one, and it would otherwise make the
// frontmatter look absent, producing a confusing error.
const read = (f) => readFileSync(f, "utf8").replace(/^&#65279;/, "");

const allMarkdown = walk(ROOT);
const flowPages = allMarkdown.filter((f) => {
  const r = rel(f);
  return r.startsWith("flows/") && !r.endsWith("/README.md");
});

if (flowPages.length === 0) {
  console.error("No flow pages found — the checker is misconfigured, not the repo clean.");
  process.exit(1);
}

// ---------------------------------------------------------------- flow pages
for (const file of flowPages) {
  const src = read(file);

  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) {
    fail(file, "missing YAML frontmatter");
    continue;
  }
  const front = fm[1];
  const body = src.slice(fm[0].length);

  for (const key of REQUIRED_FRONTMATTER) {
    if (!new RegExp(`^${key}:`, "m").test(front)) fail(file, `frontmatter missing "${key}"`);
  }

  const category = front.match(/^category:\s*(\S+)/m)?.[1];
  if (category && !CATEGORIES.includes(category)) {
    fail(file, `unknown category "${category}" (expected one of ${CATEGORIES.join(", ")})`);
  }
  const dirCategory = rel(file).split("/")[1];
  if (category && dirCategory && category !== dirCategory) {
    fail(file, `frontmatter category "${category}" does not match directory "${dirCategory}"`);
  }

  const difficulty = front.match(/^difficulty:\s*(\S+)/m)?.[1];
  if (difficulty && !DIFFICULTIES.includes(difficulty)) {
    fail(file, `difficulty "${difficulty}" must be one of ${DIFFICULTIES.join(", ")}`);
  }

  // Every spec URL in frontmatter must be cited in the body, so the references
  // section is genuinely the source for everything the page claims.
  for (const url of front.match(/^\s*-\s+(https?:\/\/\S+)/gm)?.map((l) => l.trim().slice(2)) ??
    []) {
    const base = url.split("#")[0];
    if (!body.includes(base))
      fail(file, `spec "${url}" is in frontmatter but never cited in the body`);
  }

  for (const heading of [
    "## TL;DR",
    "## Common pitfalls",
    "## Specs and references",
    "## Related flows",
  ]) {
    if (!body.includes(heading)) fail(file, `missing required section "${heading}"`);
  }

  if (/<!--/.test(body)) fail(file, "leftover HTML comment from the template");
}

// ------------------------------------------------------------ mermaid rules
for (const file of allMarkdown) {
  const blocks = [...read(file).matchAll(/^```mermaid\r?\n([\s\S]*?)^```/gm)];
  blocks.forEach(([, code], i) => {
    const at = `mermaid block ${i + 1}`;
    if (/^\s*rect\s+rgb/m.test(code)) {
      fail(
        file,
        `${at}: uses "rect rgb(...)" — hard-coded fills are unreadable in one of GitHub's two themes. Use "Note over" to label phases.`,
      );
    }
    if (/^\s*(sequenceDiagram)/m.test(code) && !/^\s*autonumber\s*$/m.test(code)) {
      fail(file, `${at}: sequence diagram is missing "autonumber"`);
    }
    // `<` / `>` in diagram text breaks rendering. Strip the things that are
    // legitimately allowed first: arrow syntax, and `<br/>` line wrapping.
    const stripped = code.replace(/<br\s*\/?>/gi, "").replace(/<<?-->>?|<-->|--?>>?|--?[x)]/g, "");
    if (/[<>]/.test(stripped)) {
      fail(
        file,
        `${at}: contains "<" or ">" in diagram text, which breaks rendering (use "<br/>" for line breaks only)`,
      );
    }
  });
}

// -------------------------------------------------------- internal links
for (const file of allMarkdown) {
  // The template's links are placeholders (`../category/other-flow.md`) that
  // are meant to be replaced when it is copied, so they will never resolve.
  if (rel(file).startsWith("templates/")) continue;
  const src = read(file);
  for (const [, target] of src.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const path = target.split("#")[0];
    if (!path) continue;
    if (!existsSync(resolve(dirname(file), path))) {
      fail(file, `broken relative link "${target}"`);
    }
  }
}

// ------------------------------------------- every flow is in both indexes
const rootReadme = read(join(ROOT, "README.md"));
for (const file of flowPages) {
  const path = rel(file);
  const name = path.split("/").pop();
  if (!rootReadme.includes(path))
    fail(join(ROOT, "README.md"), `flow "${path}" is not linked from the root index`);
  const categoryReadme = join(dirname(file), "README.md");
  if (existsSync(categoryReadme) && !read(categoryReadme).includes(name)) {
    fail(categoryReadme, `flow "${name}" is not linked from its category index`);
  }
}

// ------------------------------------------------- the autonumber contract
// Step N in a sequence diagram must be step N in the walkthrough below it.
// `autonumber` increments on MESSAGES only, never on `Note over`, so a
// walkthrough that gives a number to a state change silently drifts out of
// sync with its diagram from that point on.
//
// A sequence diagram under a "## Sequence diagram…" heading is a *contract*
// diagram: it must be followed by a numbered walkthrough with exactly one item
// per message. Illustrative diagrams — a problem statement, a failure path, a
// variant — live under a descriptive heading and carry no walkthrough.

// Every Mermaid arrow form: ->>  -->>  ->  -->  -x  --x  -)  --)
const MESSAGE = /^\s*[A-Za-z0-9_]+\s*(?:--?>>?|--?x|--?\))[+-]?\s*[A-Za-z0-9_]+\s*:/;

function contractDiagrams(body) {
  const found = [];
  let heading = "";
  let block = null;
  for (const line of body.split(/\r?\n/)) {
    if (block) {
      if (/^```/.test(line)) {
        if (/^## Sequence diagram/.test(heading) && /sequenceDiagram/.test(block.join("\n"))) {
          found.push({ heading, messages: block.filter((l) => MESSAGE.test(l)).length });
        }
        block = null;
      } else {
        block.push(line);
      }
      continue;
    }
    if (/^```mermaid/.test(line)) block = [];
    else if (/^## /.test(line)) heading = line.trim();
  }
  return found;
}

// A walkthrough is a top-level ordered list whose items open in bold. A new
// list starts wherever the numbering restarts, so a page with one walkthrough
// per diagram (a read path and a write path, say) yields one group each.
function walkthroughs(body) {
  const groups = [];
  let cur = null;
  let inFence = false;
  for (const line of body.split(/\r?\n/)) {
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^(\d+)\. \*\*/);
    if (!m) continue;
    const n = Number(m[1]);
    if (!cur || n <= cur.last) {
      cur = { first: n, last: n, count: 1, sequential: n === 1 };
      groups.push(cur);
    } else {
      cur.sequential = cur.sequential && n === cur.last + 1;
      cur.last = n;
      cur.count++;
    }
  }
  return groups;
}

for (const file of flowPages) {
  const src = read(file);
  const body = src.replace(/^---\r?\n[\s\S]*?\r?\n---/, "");
  const diagrams = contractDiagrams(body);
  const lists = walkthroughs(body);

  if (diagrams.length !== lists.length) {
    fail(
      file,
      `${diagrams.length} diagram(s) under a "## Sequence diagram…" heading but ${lists.length} numbered walkthrough(s) — each needs exactly one, and illustrative diagrams belong under a descriptive heading`,
    );
    continue;
  }

  diagrams.forEach((diagram, i) => {
    const list = lists[i];
    if (!list.sequential) {
      fail(
        file,
        `the walkthrough for "${diagram.heading}" is not numbered 1..N in order (runs ${list.first}..${list.last})`,
      );
    }
    if (list.count !== diagram.messages) {
      fail(
        file,
        `"${diagram.heading}" has ${diagram.messages} numbered message(s) but its walkthrough has ${list.count} item(s) — "Note over" is not a step, so fold it into the message it explains`,
      );
    }
  });
}

// ---------------------------------------------------------------- report
if (problems.length) {
  console.error(`\n${problems.length} structural problem(s):\n`);
  problems.forEach((p) => console.error("  - " + p));
  process.exit(1);
}
console.log(`Structure OK — ${flowPages.length} flow pages, ${allMarkdown.length} markdown files.`);
