import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';

export function options() {
  const opts = Object.fromEntries(process.argv.slice(2).map(arg => {
    if (!arg.startsWith('--')) throw new Error(`Expected --name=value, got ${arg}`);
    const [name, ...value] = arg.slice(2).split('=');
    return [name, value.length ? value.join('=') : true];
  }));
  return opts;
}

export function number(opts, name, fallback, min = 0) {
  const value = opts[name] === undefined ? fallback : Number(opts[name]);
  if (!Number.isFinite(value) || value < min) throw new Error(`Invalid --${name}`);
  return value;
}

export function distribution(values) {
  if (!values.length) throw new Error('Empty measurement');
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = p => sorted[Math.ceil(p * sorted.length) - 1];
  return { count: values.length, p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: sorted.at(-1) };
}

export function environment() {
  return { node: process.version, platform: process.platform, arch: process.arch,
    cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, memoryGiB: os.totalmem() / 2 ** 30 };
}

export async function report(result, output) {
  const json = JSON.stringify(result, null, 2);
  if (output) {
    await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
    await fs.writeFile(output, `${json}\n`);
  }
  console.log(json);
}
