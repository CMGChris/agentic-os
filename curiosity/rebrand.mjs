#!/usr/bin/env node
// Curiosity rebrand for the Agentic OS starter.
//
// Turns a copy of the official starter (ctskool/agentic-os-starter-v2) into the
// Curiosity edition: Jarvis becomes Hugo, and Chase AI / CTSkool become Curiosity.
// Jev is a separate component and is left alone.
//
// Usage: node curiosity/rebrand.mjs <repo-folder> [--check]
//   --check  report what would change without writing anything (exit 1 if anything would)
//
// The script is idempotent: running it on an already rebranded tree changes nothing.
// The upstream sync workflow runs it against every new upstream release.

import fs from 'node:fs';
import path from 'node:path';

const UPSTREAM_REPO = 'ctskool/agentic-os-starter-v2';
const CURIOSITY_REPO = 'CMGChris/agentic-os';
const CURIOSITY_OWNER = 'CMGChris';
const COPYRIGHT_HOLDER = 'Curiosity Marketing Group';

// Paths (relative, forward slashes) that are never rewritten.
const SKIP = new Set([
  '.git',
  'curiosity',                              // this script and its notes
  '.github/workflows/upstream-sync.yml',    // must keep pointing at the real upstream
  'LICENSE',                                // handled separately below (MIT notice is kept)
  'node_modules',
]);

// Ordered text rules. Specific rules first, general rules last.
// Name rules avoid partial words: "purchase", "chased" and "chaser" are untouched.
const RULES = [
  // README license footer: keep the original notice (protected below), add ours once.
  [/\u0000NOTICE\u0000\.(?! Modifications)/g, `\u0000NOTICE\u0000. Modifications copyright (c) 2026 ${COPYRIGHT_HOLDER}.`],
  // Repository addresses.
  [new RegExp(UPSTREAM_REPO.replace('/', '\\/'), 'gi'), CURIOSITY_REPO],
  [/ctskool/gi, CURIOSITY_OWNER],
  // Company name.
  [/Chase AI/g, 'Curiosity'],
  // Remaining Chase names: Chase Command Center, ChaseSettings, deep-research-chase, Chase's.
  [/(?<![A-Za-z])CHASE(?![A-Z])/g, 'CURIOSITY'],
  [/(?<![A-Za-z])Chase(?![a-z])/g, 'Curiosity'],
  [/(?<![A-Za-z])chase(?![a-z])/g, 'curiosity'],
  // Jarvis anywhere, including inside identifiers (taskJarvis, JARVIS_URL, jarvis-v2).
  [/JARVIS/g, 'HUGO'],
  [/Jarvis/g, 'Hugo'],
  [/jarvis/g, 'hugo'],
];

// The original MIT copyright notice must survive the Chase rules wherever it appears.
const NOTICE = 'Copyright (c) 2026 Chase AI';
const apply = text => RULES
  .reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text.split(NOTICE).join('\u0000NOTICE\u0000'))
  .split('\u0000NOTICE\u0000').join(NOTICE);
const isBinary = buffer => buffer.subarray(0, 8000).includes(0);

function walk(root, rel = '', out = []) {
  for (const entry of fs.readdirSync(path.join(root, rel), {withFileTypes: true})) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (SKIP.has(childRel) || entry.name === 'node_modules' || entry.name === '.git') continue;
    if (entry.isSymbolicLink()) continue;
    out.push({rel: childRel, dir: entry.isDirectory()});
    if (entry.isDirectory()) walk(root, childRel, out);
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const root = path.resolve(args.find(a => !a.startsWith('--')) || '.');
  if (!fs.existsSync(path.join(root, 'aos.mjs'))) {
    console.error(`${root} does not look like an Agentic OS starter checkout (no aos.mjs).`);
    process.exit(2);
  }

  const entries = walk(root);
  let contentChanges = 0, renames = 0;

  // 1. Rewrite file contents.
  for (const {rel, dir} of entries) {
    if (dir) continue;
    const file = path.join(root, rel);
    const buffer = fs.readFileSync(file);
    if (isBinary(buffer)) continue;
    const before = buffer.toString('utf8');
    const after = apply(before);
    if (after !== before) {
      contentChanges++;
      if (check) console.log(`content  ${rel}`);
      else fs.writeFileSync(file, after);
    }
  }

  // 2. Rename files and folders, deepest first so parents move last.
  for (const {rel} of [...entries].sort((a, b) => b.rel.split('/').length - a.rel.split('/').length)) {
    const base = path.posix.basename(rel);
    const renamed = apply(base);
    if (renamed === base) continue;
    renames++;
    const target = path.posix.join(path.posix.dirname(rel), renamed);
    if (check) console.log(`rename   ${rel} -> ${target}`);
    else fs.renameSync(path.join(root, rel), path.join(root, target));
  }

  // 3. LICENSE: MIT requires the original notice to stay. Add ours beneath it.
  const licenseFile = path.join(root, 'LICENSE');
  if (fs.existsSync(licenseFile)) {
    const license = fs.readFileSync(licenseFile, 'utf8');
    const ours = `Copyright (c) 2026 ${COPYRIGHT_HOLDER}`;
    if (!license.includes(ours)) {
      contentChanges++;
      if (check) console.log('content  LICENSE');
      else fs.writeFileSync(licenseFile, license.replace(/^(Copyright \(c\).*)$/m, `$1\n${ours}`));
    }
  }

  console.log(`${check ? 'Would change' : 'Changed'} ${contentChanges} file(s), ${check ? 'would rename' : 'renamed'} ${renames} path(s).`);
  if (check && (contentChanges || renames)) process.exit(1);
}

main();
