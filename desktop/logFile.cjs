// The desktop game's log file: what a packaged build would otherwise lose (it has no console).
// One file per launch, `<userData>/logs/game.log`, with the previous launches kept as game.1.log …
// game.<keep - 1>.log. Each file starts with the version and system it was written by, and is
// capped in size, so an error repeating every frame cannot fill the disk. The main process writes
// it: its own console, the host process's output and the game window's warnings and errors.
// Logging never throws: a full disk or a locked file only loses log lines.
const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');

const LEVELS = ['debug', 'info', 'warn', 'error'];

/** Shift game.log -> game.1.log -> … and drop the oldest, so this launch starts a fresh file. */
function rotate(dir, name, keep) {
  const file = (i) => path.join(dir, i ? `${name}.${i}.log` : `${name}.log`);
  try { fs.rmSync(file(keep - 1), { force: true }); } catch { /* best effort */ }
  for (let i = keep - 2; i >= 0; i--) {
    try { fs.renameSync(file(i), file(i + 1)); } catch { /* missing: nothing to keep */ }
  }
  return file(0);
}

/**
 * Open this launch's log. `header`: lines written first (version, system). Returns
 * { file, write(level, source, ...args), lines } (`lines`: how many were written, for tests).
 */
function openLog(dir, { name = 'game', keep = 5, maxBytes = 4 * 1024 * 1024, header = [], now = () => new Date() } = {}) {
  let file = null;
  try {
    fs.mkdirSync(dir, { recursive: true });
    file = rotate(dir, name, Math.max(1, keep));
  } catch { /* no log folder: logging is off, the game still runs */ }
  let size = 0;
  let full = false;
  const log = {
    file,
    lines: 0,
    write(level, source, ...args) {
      if (!file || full) return;
      const text = util.format(...args).replace(/\r?\n(?!$)/g, '\n    ');
      let line = `${now().toISOString()} ${String(LEVELS.includes(level) ? level : 'info').toUpperCase().padEnd(5)} [${source}] ${text}\n`;
      if (size + Buffer.byteLength(line) > maxBytes) {
        full = true;
        line = `${now().toISOString()} WARN  [log] The log is full (${maxBytes} bytes); later lines of this launch are dropped.\n`;
      }
      try {
        fs.appendFileSync(file, line);
        size += Buffer.byteLength(line);
        log.lines++;
      } catch { /* disk full or file locked: drop the line */ }
    },
  };
  for (const line of header) log.write('info', 'start', line);
  return log;
}

/** Copy `target`'s console output (console.log/info/warn/error) into `log`. Returns a function that undoes it. */
function captureConsole(log, source = 'main', target = console) {
  const original = {};
  for (const [method, level] of [['log', 'info'], ['info', 'info'], ['warn', 'warn'], ['error', 'error']]) {
    original[method] = target[method];
    target[method] = (...args) => {
      original[method].apply(target, args);
      log.write(level, source, ...args);
    };
  }
  return () => Object.assign(target, original);
}

/** Forward a child's stdout / stderr stream lines to `log` (and on to `echo`, the developer's terminal). */
function pipeLines(stream, log, level, source, echo = null) {
  if (!stream) return;
  let rest = '';
  stream.setEncoding?.('utf8');
  stream.on('data', (chunk) => {
    echo?.write(chunk);
    const lines = (rest + chunk).split(/\r?\n/);
    rest = lines.pop();
    for (const line of lines) if (line) log.write(level, source, line);
  });
  stream.on('end', () => { if (rest) log.write(level, source, rest); rest = ''; });
}

/** The first lines of every log: which build on which system. */
function buildInfo({ product, version, versions = process.versions, platform = process.platform, arch = process.arch, osRelease = '', packaged = false }) {
  return [
    `${product} ${version}${packaged ? '' : ' (source checkout)'}`,
    `Electron ${versions.electron ?? '-'}, Chromium ${versions.chrome ?? '-'}, Node ${versions.node}`,
    `${platform} ${osRelease} ${arch}`.replace(/\s+/g, ' ').trim(),
  ];
}

module.exports = { openLog, captureConsole, pipeLines, buildInfo };
