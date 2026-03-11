#!/usr/bin/env node
import path from 'node:path';
import { Command } from 'commander';
import { collectFiles, readJson, writeJson } from './lib/fs-utils.mjs';
import { fetchHokutoSnapshot } from './lib/fetch-hokuto.mjs';
import { extractRecordFromHtmlFile } from './lib/html-extractor.mjs';
import { extractRecordFromImages } from './lib/ocr-extractor.mjs';

function buildEnvelope(records) {
  return {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    records,
  };
}

async function collectHtmlRecords(options) {
  const files = await collectFiles(options.input, ['**/*.html', '**/*.htm', '**/*.md', '**/*.txt']);
  if (!files.length) throw new Error(`No files found: ${options.input}`);

  const records = [];
  for (const file of files) {
    const record = await extractRecordFromHtmlFile(file, {
      department: options.department,
      regimenName: options.regimenName,
      sourceFile: options.sourceFile,
    });
    records.push(record);
  }
  return records;
}

async function collectOcrRecord(options) {
  const files = await collectFiles(options.input, ['**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.webp', '**/*.tif', '**/*.tiff']);
  if (!files.length) throw new Error(`No image files found: ${options.input}`);

  return extractRecordFromImages(files, {
    regimenName: options.regimenName,
    department: options.department,
    sourceTitle: options.sourceTitle,
    sourceFile: options.sourceFile,
    preprocess: options.preprocess,
    threshold: options.threshold,
    contrast: options.contrast,
    scale: options.scale,
    psm: options.psm,
    keepRaw: options.keepRaw,
  });
}

async function runExtractHtml(options) {
  const records = await collectHtmlRecords(options);
  const envelope = buildEnvelope(records);
  await writeJson(options.output, envelope);
  console.log(`HTML抽出完了: ${records.length}件 -> ${path.resolve(options.output)}`);
}

async function runExtractOcr(options) {
  const record = await collectOcrRecord(options);
  const envelope = buildEnvelope([record]);
  await writeJson(options.output, envelope);
  console.log(`OCR抽出完了: 1件 -> ${path.resolve(options.output)}`);
}

async function runMerge(options) {
  const files = await collectFiles(options.input, ['**/*.json']);
  if (!files.length) throw new Error(`No json files found: ${options.input}`);

  const merged = [];
  for (const file of files) {
    const data = await readJson(file);
    if (Array.isArray(data)) {
      merged.push(...data);
      continue;
    }
    if (Array.isArray(data.records)) {
      merged.push(...data.records);
      continue;
    }
    throw new Error(`Unsupported JSON format: ${file}`);
  }

  const envelope = buildEnvelope(merged);
  await writeJson(options.output, envelope);
  console.log(`マージ完了: ${merged.length}件 -> ${path.resolve(options.output)}`);
}

async function pushPayload(records, options) {
  const res = await fetch(options.api, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: JSON.stringify({ records }),
  });

  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }

  if (!res.ok) {
    throw new Error(`Push failed (${res.status}): ${JSON.stringify(body)}`);
  }

  return body;
}

async function runPush(options) {
  const payload = await readJson(options.input);
  const records = Array.isArray(payload) ? payload : (Array.isArray(payload.records) ? payload.records : []);
  if (!records.length) throw new Error('No records found in input JSON');

  const body = await pushPayload(records, options);
  console.log('送信成功:', JSON.stringify(body));
}

async function runBatch(options) {
  const allRecords = [];

  if (!options.htmlInput && !options.ocrInput) {
    throw new Error('Either --html-input or --ocr-input is required');
  }

  if (options.htmlInput) {
    const htmlRecords = await collectHtmlRecords({
      input: options.htmlInput,
      department: options.department,
      regimenName: options.regimenName,
      sourceFile: options.sourceFile,
    });
    allRecords.push(...htmlRecords);
    console.log(`HTML records: ${htmlRecords.length}`);
  }

  if (options.ocrInput) {
    if (!options.regimenName) {
      throw new Error('--regimen-name is required when --ocr-input is specified');
    }
    const ocrRecord = await collectOcrRecord({
      input: options.ocrInput,
      regimenName: options.regimenName,
      department: options.department,
      sourceTitle: options.sourceTitle,
      sourceFile: options.sourceFile,
      preprocess: options.preprocess,
      threshold: options.threshold,
      contrast: options.contrast,
      scale: options.scale,
      psm: options.psm,
      keepRaw: options.keepRaw,
    });
    allRecords.push(ocrRecord);
    console.log('OCR records: 1');
  }

  const envelope = buildEnvelope(allRecords);
  await writeJson(options.output, envelope);
  console.log(`Batch output: ${allRecords.length}件 -> ${path.resolve(options.output)}`);

  if (options.api) {
    const body = await pushPayload(allRecords, options);
    console.log('Batch push成功:', JSON.stringify(body));
  }
}

async function runFetch(options) {
  const result = await fetchHokutoSnapshot({
    url: options.url,
    htmlOutput: options.htmlOutput,
    imagesDir: options.imagesDir,
  });
  console.log(`Fetched HTML: ${result.htmlOutput}`);
  console.log(`Image URLs found: ${result.imageUrlCount}`);
  if (options.imagesDir) {
    console.log(`Images downloaded: ${result.downloadedImageCount}`);
  }
}

function addOcrOptions(command) {
  return command
    .option('--no-preprocess', 'disable OCR image preprocessing')
    .option('--threshold <number>', 'binarization threshold (default: 170)', Number)
    .option('--contrast <number>', 'contrast boost (default: 0.45)', Number)
    .option('--scale <number>', 'upscale factor (default: 1.6)', Number)
    .option('--psm <number>', 'tesseract page segmentation mode (default: 6)', Number)
    .option('--keep-raw', 'keep raw OCR text in output');
}

const program = new Command();
program
  .name('hokuto-extractor')
  .description('Extract HOKUTO regimen information and build chemoapp decision-support package')
  .version('0.1.0');

program
  .command('fetch')
  .description('fetch HOKUTO page HTML, and optionally download image assets')
  .requiredOption('-u, --url <url>', 'HOKUTO regimen URL')
  .requiredOption('--html-output <path>', 'output html file path')
  .option('--images-dir <path>', 'directory to save extracted image assets')
  .action((opts) => runFetch(opts).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  }));

program
  .command('extract-html')
  .requiredOption('-i, --input <path>', 'html/md file or directory')
  .requiredOption('-o, --output <path>', 'output json file')
  .option('-d, --department <text>', 'department')
  .option('-r, --regimen-name <text>', 'override regimen name')
  .option('--source-file <text>', 'override source file identifier')
  .action((opts) => runExtractHtml(opts).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  }));

addOcrOptions(
  program
    .command('extract-ocr')
    .requiredOption('-i, --input <path>', 'image file or directory')
    .requiredOption('-o, --output <path>', 'output json file')
    .requiredOption('-r, --regimen-name <text>', 'regimen name')
    .option('-d, --department <text>', 'department')
    .option('--source-title <text>', 'source title')
    .option('--source-file <text>', 'source file identifier')
).action((opts) => runExtractOcr(opts).catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
}));

program
  .command('merge')
  .requiredOption('-i, --input <path>', 'json file or directory')
  .requiredOption('-o, --output <path>', 'output json file')
  .action((opts) => runMerge(opts).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  }));

program
  .command('push')
  .requiredOption('-i, --input <path>', 'package json file')
  .requiredOption('-a, --api <url>', 'chemoapp import-package endpoint')
  .option('-t, --token <jwt>', 'Bearer token')
  .action((opts) => runPush(opts).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  }));

addOcrOptions(
  program
    .command('batch')
    .description('run html extraction + ocr extraction + merge (+ optional push)')
    .requiredOption('-o, --output <path>', 'output json file')
    .option('--html-input <path>', 'html/md file or directory')
    .option('--ocr-input <path>', 'image file or directory')
    .option('-r, --regimen-name <text>', 'regimen name (required for ocr-input)')
    .option('-d, --department <text>', 'department')
    .option('--source-title <text>', 'source title')
    .option('--source-file <text>', 'source file identifier')
    .option('-a, --api <url>', 'chemoapp import-package endpoint')
    .option('-t, --token <jwt>', 'Bearer token')
).action((opts) => runBatch(opts).catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
}));

program.parse(process.argv);
