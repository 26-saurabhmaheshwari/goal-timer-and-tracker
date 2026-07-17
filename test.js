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

// --- 1b. syntax check the <script type="module"> block (Firebase) as ESM ---
const modBlocks = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (modBlocks.length) {
  const tmpM = path.join(require('os').tmpdir(), 'td_check.mjs');
  fs.writeFileSync(tmpM, modBlocks.join('\n;\n'));
  try { cp.execSync(`node --check ${tmpM}`, { stdio: 'pipe' }); ok('module JS syntax'); }
  catch (e) { bad('module JS syntax:\n' + e.stderr.toString()); }
}

// --- 2. merge precedence: SEED must come before loadObj so saved values win ---
for (const v of ['COLORS', 'ICONS']) {
  const re = new RegExp(`let\\s+${v}\\s*=\\s*\\{\\s*\\.\\.\\.SEED_${v}\\s*,\\s*\\.\\.\\.loadObj\\(`);
  if (re.test(html)) ok(`${v} merge precedence (seed first, saved overrides)`);
  else bad(`${v} merge precedence wrong — must be {...SEED_${v}, ...loadObj(LS_${v}, {})} or saved values revert on load`);
}

// --- 3. every persisted LS_* key is registered in SYNC_FIELDS (or exempt) ---
// SYNC_FIELDS drives fbBlob + applyBlob (sync, export, import) in one loop, so an
// unregistered key silently never syncs/exports. Exempt: dob/name/target are
// string/number specials handled inline in applyBlob; LS_VIEW is device-local UI state.
const regM = html.match(/const SYNC_FIELDS\s*=\s*\[([\s\S]*?)\n\];/);
if (!regM) bad('could not locate SYNC_FIELDS registry');
else {
  const reg = new Set([...regM[1].matchAll(/LS_\w+/g)].map(m => m[0]));
  const exempt = new Set(['LS_DOB', 'LS_NAME', 'LS_TARGET', 'LS_PLANWIN', 'LS_LIFEBAR', 'LS_VIEW', 'LS_ONBOARDED']);
  const declared = new Set([...html.matchAll(/(LS_\w+)\s*=\s*'/g)].map(m => m[1]));
  for (const k of declared) {
    if (reg.has(k) || exempt.has(k)) ok(`sync registry: ${k}`);
    else bad(`sync registry: ${k} declared but not in SYNC_FIELDS — it will never sync/export/import`);
  }
  for (const f of ['dob', 'name', 'target', 'planwin', 'lifebar']) {
    if (new RegExp(`d\\.${f}`).test(html)) ok(`applyBlob restores ${f}`);
    else bad(`applyBlob never reads d.${f} — special field will sync out but never back`);
  }
  if (/function applyBlob\(/.test(html)) ok('applyBlob exists (shared by fb-data + import)');
  else bad('applyBlob missing — fb-data and import must share one restore path');
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
