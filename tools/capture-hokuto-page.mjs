#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

function parseArgs(argv) {
  const args = { url: '', out: '', waitMs: 4000 };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--url') args.url = String(argv[++i] || '');
    else if (a === '--out') args.out = String(argv[++i] || '');
    else if (a === '--wait') args.waitMs = Number(argv[++i] || 4000);
  }
  return args;
}

function usage() {
  console.log(
    'Usage: node tools/capture-hokuto-page.mjs --url <hokuto-url> --out <output.html> [--wait 4000]'
  );
}

async function tryRenderCapture(url, waitMs) {
  try {
    const dynamicImport = new Function('m', 'return import(m)');
    const playwright = await dynamicImport('playwright');
    const browser = await playwright.chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle' });
      if (waitMs > 0) await page.waitForTimeout(waitMs);
      return await page.content();
    } finally {
      await browser.close();
    }
  } catch {
    return null;
  }
}

async function fetchRaw(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

async function main() {
  const { url, out, waitMs } = parseArgs(process.argv);
  if (!url || !out) {
    usage();
    process.exit(1);
  }

  const outPath = path.resolve(out);
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const rendered = await tryRenderCapture(url, waitMs);
  if (rendered) {
    fs.writeFileSync(outPath, rendered, 'utf8');
    console.log(`Saved rendered HTML: ${outPath}`);
    return;
  }

  const raw = await fetchRaw(url);
  fs.writeFileSync(outPath, raw, 'utf8');
  console.log(`Saved raw HTML (playwright not available): ${outPath}`);
  console.log('Tip: install playwright to preserve JS-rendered tables.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

