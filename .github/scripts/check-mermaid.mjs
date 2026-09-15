#!/usr/bin/env node
// Extract every ```mermaid block from the repo's markdown and parse it with
// mermaid-cli. A block that fails to parse renders as a raw code fence on
// GitHub, which is easy to miss in review — so this is a hard failure.
//
//   node .github/scripts/check-mermaid.mjs [rootDir]

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";

const ROOT = process.argv[2] ?? process.cwd();
const TMP = join(ROOT, ".mermaid-tmp");
// `npx` is a shell script on Windows and needs shell:true to be spawnable;
// elsewhere it does not, and passing shell:true raises a deprecation warning.
const WINDOWS = process.platform === "win32";

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git" || entry === ".mermaid-tmp") continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (entry.endsWith(".md")) out.push(p);
  }
  return out;
}

// Warm the package once. Otherwise the first block (or two, if they run before
// the download finishes) pays the whole npx install cost and times out, which
// looks exactly like a diagram error.
const MMDC = ["-y", "-p", "@mermaid-js/mermaid-cli", "mmdc"];
process.stdout.write("Fetching mermaid-cli… ");
try {
  execFileSync("npx", [...MMDC, "--version"], { stdio: "pipe", shell: WINDOWS, timeout: 600_000 });
  console.log("ok\n");
} catch {
  console.error("\nCould not run mermaid-cli via npx.");
  process.exit(1);
}

let total = 0;
const failures = [];

for (const file of walk(ROOT)) {
  const blocks = [...readFileSync(file, "utf8").matchAll(/^```mermaid\r?\n([\s\S]*?)^```/gm)];
  blocks.forEach(([, code], i) => {
    total++;
    const mmd = join(TMP, `block-${total}.mmd`);
    writeFileSync(mmd, code, "utf8");
    const where = `${relative(ROOT, file)} [block ${i + 1}]`;
    try {
      execFileSync("npx", [...MMDC, "-i", mmd, "-o", join(TMP, `block-${total}.svg`), "-q"], {
        stdio: "pipe",
        shell: WINDOWS,
        timeout: 180_000,
      });
      console.log(`  ok    ${where}`);
    } catch (err) {
      const msg = (err.stderr?.toString() || err.stdout?.toString() || err.message).trim();
      failures.push(
        `${where}\n${msg
          .split("\n")
          .slice(0, 12)
          .map((l) => "        " + l)
          .join("\n")}`,
      );
      console.log(`  FAIL  ${where}`);
    }
  });
}

rmSync(TMP, { recursive: true, force: true });

if (failures.length) {
  console.error(`\n${failures.length} of ${total} Mermaid blocks failed to parse:\n`);
  failures.forEach((f) => console.error("  " + f + "\n"));
  process.exit(1);
}

console.log(`\nAll ${total} Mermaid blocks parsed.`);
