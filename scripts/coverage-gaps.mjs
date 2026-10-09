// Read the last c8 report. Missing source files must remain visible in an audit.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function coverageGaps(report, baseDir, filters = []) {
  return Object.entries(report).map(([file, coverage]) => {
    const name = path.relative(baseDir, file).replaceAll('\\', '/');
    const lines = new Set();
    for (const [id, count] of Object.entries(coverage.s)) {
      if (count !== 0) continue;
      const span = coverage.statementMap[id];
      for (let line = span.start.line; line <= span.end.line; line++) lines.add(line);
    }
    return {
      file: name,
      lines: [...lines].sort((a, b) => a - b),
      functions: Object.entries(coverage.f).filter(([, count]) => count === 0).map(([id]) => {
        const entry = coverage.fnMap[id];
        return { name: entry.name, line: entry.loc.start.line };
      }),
      branches: Object.entries(coverage.b).flatMap(([id, counts]) => counts.flatMap((count, index) => {
        if (count !== 0) return [];
        return [{ line: coverage.branchMap[id].locations[index].start.line }];
      })),
    };
  }).filter(entry => (!filters.length || filters.some(filter => entry.file.includes(filter))) &&
    (entry.lines.length || entry.functions.length || entry.branches.length)).sort((a, b) =>
    b.lines.length - a.lines.length || a.file.localeCompare(b.file));
}

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : /\.(?:js|cjs)$/.test(entry.name) ? [file] : [];
  });
}

function main() {
  const file = path.join(root, 'coverage', 'coverage-final.json');
  if (!fs.existsSync(file)) throw new Error('No coverage report. Run npm run test:coverage first.');
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  const filters = process.argv.slice(2);
  const reported = new Set(Object.keys(report).map(name => path.resolve(name)));
  const missing = ['src', 'server', 'desktop'].flatMap(dir => sourceFiles(path.join(root, dir)))
    .filter(name => !reported.has(path.resolve(name)));
  console.log(`Report from ${fs.statSync(file).mtime.toISOString()}; last run only, ${reported.size} source files.`);
  console.log('Focused test runs do not represent full-suite coverage.');
  for (const entry of coverageGaps(report, root, filters)) {
    console.log(`\n${entry.file}`);
    if (entry.lines.length) console.log(`  uncovered lines: ${entry.lines.join(', ')}`);
    if (entry.functions.length) console.log(`  uncovered functions: ${entry.functions.map(fn => `${fn.name}:${fn.line}`).join(', ')}`);
    if (entry.branches.length) console.log(`  uncovered branch locations: ${[...new Set(entry.branches.map(branch => branch.line))].join(', ')}`);
  }
  if (missing.length) {
    console.error('\nSource files missing from the report (invalid complete-source measurement):');
    for (const name of missing) console.error(`  ${path.relative(root, name)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
