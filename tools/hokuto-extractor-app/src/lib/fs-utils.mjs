import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';

export async function collectFiles(inputPath, patterns) {
  const absolute = path.resolve(inputPath);
  const stat = await fs.stat(absolute);
  if (stat.isFile()) return [absolute];

  const globs = patterns.map((p) => path.posix.join(toPosix(absolute), p));
  const files = [];
  for (const g of globs) {
    const found = await glob(g, { nodir: true, windowsPathsNoEscape: true });
    for (const f of found) files.push(path.resolve(f));
  }
  return Array.from(new Set(files)).sort();
}

export async function ensureDirForFile(filePath) {
  const dir = path.dirname(path.resolve(filePath));
  await fs.mkdir(dir, { recursive: true });
}

export async function writeJson(filePath, data) {
  await ensureDirForFile(filePath);
  await fs.writeFile(path.resolve(filePath), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export async function readJson(filePath) {
  const raw = await fs.readFile(path.resolve(filePath), 'utf8');
  return JSON.parse(raw);
}

export function toPosix(input) {
  return input.replace(/\\/g, '/');
}
