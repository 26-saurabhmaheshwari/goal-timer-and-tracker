#!/usr/bin/env node
// Logic guard for index.html. Catches the recurring bug classes WITHOUT rendering:
//  1. JS syntax errors in the embedded <script> blocks.
//  2. Wrong startup merge precedence -> user-saved colors/icons silently revert.
//  3. State added to fbBlob() but not restored by the fb-data listener (silent sync drop).
// Run: node test.js   (zero dependencies)
const fs = require('fs');
const cp = require('child_process');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
let fails = 0;
const ok = m => console.log('  ok  ' + m);
const bad = m => { console.log('FAIL  ' + m); fails++; };

// --- 1. syntax check every inline script block (skip CDN <script src=...>) ---
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const js = blocks.join('\n;\n');
const tmp = path.join(require('os').tmpdir(), 'td_check.js');
fs.writeFileSync(tmp, js);
try { cp.execSync(`node --check ${tmp}`, { stdio: 'pipe' }); ok('JS syntax'); }
catch (e) { bad('JS syntax:\n' + e.stderr.toString()); }

// --- 2. merge precedence: SEED must come before loadObj so saved values win ---
for (const v of ['COLORS', 'ICONS']) {
  const re = new RegExp(`let\\s+${v}\\s*=\\s*\\{\\s*\\.\\.\\.SEED_${v}\\s*,\\s*\\.\\.\\.loadObj\\(`);
  if (re.test(html)) ok(`${v} merge precedence (seed first, saved overrides)`);
  else bad(`${v} merge precedence wrong — must be {...SEED_${v}, ...loadObj(LS_${v}, {})} or saved values revert on load`);
}

// --- 3. every fbBlob field is restored by the fb-data listener ---
const blobM = html.match(/function fbBlob\(\)\s*\{\s*return\s*\{([\s\S]*?)\}\s*;\s*\}/);
const listM = html.match(/addEventListener\('fb-data'[\s\S]*?\n\}\)/);
if (!blobM) bad('could not locate fbBlob()');
else if (!listM) bad('could not locate fb-data listener');
else {
  const blobKeys = [...blobM[1].matchAll(/(\w+)\s*:/g)].map(m => m[1]);
  const restored = new Set([...listM[0].matchAll(/d\.(\w+)/g)].map(m => m[1]));
  const exempt = new Set(['version']); // version is a schema marker, not restored
  for (const k of blobKeys) {
    if (restored.has(k) || exempt.has(k)) ok(`sync: ${k} restored`);
    else bad(`sync: fbBlob has '${k}' but fb-data listener never reads d.${k} — it will sync out but never sync back`);
  }
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
