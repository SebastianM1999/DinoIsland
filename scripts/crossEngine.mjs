// Prints the island generator's fingerprints (test/helpers/genFingerprint.js) per JS engine side by side: this Node,
// installed Chrome (or Playwright's Chromium), Firefox / WebKit when Playwright has them, and Electron's Node.
// Every cell is a hash of exact bits; a row that is not the same everywhere means the engines build different islands.
//
//   node scripts/crossEngine.mjs [--json out.json] [--engines chrome,firefox,webkit,electron]

import fs from 'node:fs';
import { allFingerprints } from '../test/helpers/genFingerprint.js';
import { browserFingerprints, electronFingerprints } from '../test/helpers/engineFingerprint.js';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const engines = opt('--engines', 'chrome,firefox,webkit,electron').split(',');

const runs = [{ engine: 'node', version: `Node ${process.version} (V8 ${process.versions.v8})`, result: allFingerprints() }];
for (const e of engines) {
  const r = e === 'electron' ? await electronFingerprints() : await browserFingerprints(e);
  runs.push(r);
}
const live = runs.filter((r) => !r.skipped);
for (const r of runs) console.log(r.skipped ? `- ${r.engine}: skipped, ${r.skipped}` : `- ${r.engine}: ${r.version}`);

const rows = [];
for (const key of Object.keys(runs[0].result)) {
  for (const sec of Object.keys(runs[0].result[key].hashes)) {
    const cells = live.map((r) => r.result[key]?.hashes[sec] ?? '-');
    rows.push({ island: key, section: sec, same: cells.every((c) => c === cells[0]), cells });
  }
}
const short = (h) => h.slice(0, 8);
console.log(`\n${'island'.padEnd(7)} ${'section'.padEnd(10)} ${live.map((r) => r.engine.padEnd(9)).join(' ')} same`);
for (const r of rows) console.log(`${r.island.padEnd(7)} ${r.section.padEnd(10)} ${r.cells.map((c) => short(c).padEnd(9)).join(' ')} ${r.same ? 'yes' : 'NO'}`);
console.log('\ntimings (ms, plan / terrain / layout / cave):');
for (const r of live) {
  const t = Object.entries(r.result).filter(([, v]) => v.ms.terrain !== undefined)
    .map(([k, v]) => `${k} ${[v.ms.plan, v.ms.terrain, v.ms.layout, v.ms.cave].map((x) => (x === undefined ? '-' : Math.round(x))).join('/')}`);
  console.log(`  ${r.engine.padEnd(9)} ${t.join('  ')}`);
}
const bad = rows.filter((r) => !r.same).length;
console.log(`\n${bad ? `${bad} of ${rows.length} rows differ` : `all ${rows.length} rows identical`} across ${live.map((r) => r.engine).join(', ')}`);
const out = opt('--json');
if (out) fs.writeFileSync(out, JSON.stringify(runs, null, 1));
