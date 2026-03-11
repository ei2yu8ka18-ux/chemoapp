import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Jimp } from 'jimp';
import { createWorker } from 'tesseract.js';
import {
  dedupBy,
  extractConditionFromText,
  makeEmptyRecord,
  parseLevelIndex,
} from './decision-package.mjs';

const GRADE_RE = /(Grade\s*[0-9]+(?:\s*[-~]\s*[0-9]+)?|G[1-4]|[1-4]\s*grade|[1-4]度)/i;

function detectSectionType(text) {
  const t = String(text || '').normalize('NFKC');
  if (/投与開始基準|適格基準/.test(t)) return 'start_criteria';
  if (/減量レベル|初回基準量/.test(t)) return 'dose_level';
  if (/減量基準/.test(t)) return 'dose_reduction_criteria';
  if (/休薬|中止基準|減量中止基準/.test(t)) return 'hold_stop_criteria';
  if (/有害事象/.test(t)) return 'adverse_event';
  if (/用法用量|投与スケジュール/.test(t)) return 'protocol';
  return 'other';
}

function normalizeLine(input) {
  return String(input || '')
    .normalize('NFKC')
    .replace(/[|｜¦]/g, ' | ')
    .replace(/\s+/g, ' ')
    .replace(/[，､]/g, ',')
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .trim();
}

function splitColumns(line) {
  const normalized = normalizeLine(line);
  if (normalized.includes('|')) {
    return normalized.split('|').map((v) => v.trim()).filter(Boolean);
  }
  const cols = normalized.split(/\t+|\s{2,}/).map((v) => v.trim()).filter(Boolean);
  return cols.length > 1 ? cols : [normalized];
}

function coalesceLines(lines) {
  const out = [];
  for (const raw of lines) {
    const line = normalizeLine(raw);
    if (!line) continue;

    if (!out.length) {
      out.push(line);
      continue;
    }

    const shouldJoin =
      /^[・･:：,，。．\)\]＞>]/.test(line)
      || /^(次の時継続可|治療リスク|出血改善|時々|ポンプ)/.test(line)
      || (line.length < 8 && /^(中止|休薬|継続可)$/.test(line));

    if (shouldJoin) {
      out[out.length - 1] = `${out[out.length - 1]} ${line}`.trim();
    } else {
      out.push(line);
    }
  }
  return out;
}

function extractDrugHeaders(line) {
  const m = line.match(/(?:CPT-11|L-OHP|5-FU|[A-Za-z][A-Za-z0-9\-]{1,12})/g) || [];
  const unique = [];
  for (const x of m) {
    if (!unique.includes(x)) unique.push(x);
  }
  return unique;
}

function parseDoseLevelLine(line, currentDrugHeaders, sourceSection) {
  const normalized = normalizeLine(line);
  if (!/(初回投与量|初回基準量|段階減量)/.test(normalized)) return [];

  const cols = splitColumns(normalized);
  const levelLabel = cols[0] || normalized;
  const levelIndex = parseLevelIndex(levelLabel);

  const valueCandidates = cols.slice(1).filter((v) => v && v !== '-');
  const numbers = valueCandidates.length
    ? valueCandidates
    : (normalized.match(/[0-9]+(?:\.[0-9]+)?/g) || []);

  const drugs = (currentDrugHeaders && currentDrugHeaders.length)
    ? currentDrugHeaders
    : numbers.map((_, idx) => `OCR薬剤${idx + 1}`);

  const rows = [];
  for (let i = 0; i < numbers.length && i < drugs.length; i += 1) {
    rows.push({
      drug_name: drugs[i],
      level_index: levelIndex,
      level_label: /初回/.test(levelLabel) ? '初回投与量' : `${levelIndex}段階減量`,
      dose_text: String(numbers[i]).trim(),
      dose_unit: null,
      per_basis: null,
      is_discontinue: /中止/.test(levelLabel) || /中止/.test(String(numbers[i])),
      section_type: 'dose_level',
      source_section: sourceSection || 'ocr',
    });
  }

  return rows;
}

function parseProtocolDoseLine(line, sourceSection) {
  const normalized = normalizeLine(line);
  const m = normalized.match(/([A-Za-z0-9\-]+)\s*[:：]?\s*([0-9]+(?:\.[0-9]+)?\s*(?:mg\/m2|mg\/kg|mg|AUC\s*[0-9.]+))/i);
  if (!m) return null;

  return {
    drug_name: m[1],
    level_index: 0,
    level_label: '通常量',
    dose_text: m[2],
    dose_unit: null,
    per_basis: null,
    is_discontinue: false,
    section_type: 'protocol',
    source_section: sourceSection || 'ocr',
  };
}

function parseToxicityLine(line, fallbackToxicity, sectionType, sourceSection) {
  const normalized = normalizeLine(line);
  if (!/(Grade|G[1-4]|中止|休薬|減量)/i.test(normalized)) return null;

  const cols = splitColumns(normalized);
  if (cols.length >= 3 && (GRADE_RE.test(cols[1]) || GRADE_RE.test(cols[0]))) {
    const toxicity = cols[0] || fallbackToxicity || '有害事象';
    const condition = GRADE_RE.test(cols[1]) ? cols[1] : '-';
    const action = cols.slice(2).join(' / ') || '-';
    const levelMatch = action.match(/([0-9]+)段階減量/);
    return {
      toxicity_name: toxicity,
      condition_text: condition,
      action_text: action,
      level_delta: levelMatch ? Number(levelMatch[1]) : 0,
      hold_flag: /休薬/.test(action),
      discontinue_flag: /中止/.test(action),
      priority: sectionType === 'hold_stop_criteria' ? 10 : sectionType === 'dose_reduction_criteria' ? 20 : 30,
      section_type: sectionType,
      source_section: sourceSection || 'ocr',
    };
  }

  const fullMatch = normalized.match(/^(.+?)\s+(Grade\s*[0-9]+(?:\s*[-~]\s*[0-9]+)?|G[1-4])\s+(.+)$/i);
  if (!fullMatch) return null;

  const actionText = fullMatch[3];
  const levelMatch = actionText.match(/([0-9]+)段階減量/);
  return {
    toxicity_name: fullMatch[1] || fallbackToxicity || '有害事象',
    condition_text: fullMatch[2],
    action_text: actionText,
    level_delta: levelMatch ? Number(levelMatch[1]) : 0,
    hold_flag: /休薬/.test(actionText),
    discontinue_flag: /中止/.test(actionText),
    priority: sectionType === 'hold_stop_criteria' ? 10 : sectionType === 'dose_reduction_criteria' ? 20 : 30,
    section_type: sectionType,
    source_section: sourceSection || 'ocr',
  };
}

async function preprocessImage(inputPath, options) {
  const image = await Jimp.read(inputPath);
  image.greyscale();

  const contrast = Number.isFinite(options.contrast) ? options.contrast : 0.45;
  image.contrast(contrast);

  if (options.normalize !== false) {
    image.normalize();
  }

  const threshold = Number.isFinite(options.threshold) ? options.threshold : 170;
  image.scan(0, 0, image.bitmap.width, image.bitmap.height, function scan(_x, _y, idx) {
    const v = this.bitmap.data[idx];
    const bw = v >= threshold ? 255 : 0;
    this.bitmap.data[idx] = bw;
    this.bitmap.data[idx + 1] = bw;
    this.bitmap.data[idx + 2] = bw;
  });

  const scale = Number.isFinite(options.scale) ? options.scale : 1.6;
  if (scale > 1) {
    image.scale(scale);
  }

  const tempPath = path.join(os.tmpdir(), `hokuto-ocr-${Date.now()}-${Math.random().toString(16).slice(2)}.png`);
  await image.write(tempPath);
  return tempPath;
}

export async function extractRecordFromImages(imageFiles, options = {}) {
  if (!options.regimenName) {
    throw new Error('--regimen-name is required for extract-ocr');
  }

  const record = makeEmptyRecord({
    regimenName: options.regimenName,
    department: options.department || null,
    sourceTitle: options.sourceTitle || `${options.regimenName} OCR抽出`,
    sourceFile: options.sourceFile || imageFiles.join(', '),
    markdownContent: `# ${options.regimenName}\n\nOCR source images: ${imageFiles.length}`,
  });

  const worker = await createWorker('jpn+eng');
  await worker.setParameters({
    tessedit_pageseg_mode: String(options.psm || 6),
    preserve_interword_spaces: '1',
  });

  const tempFiles = [];
  const allTexts = [];
  const criteria = [];
  const doseLevels = [];
  const toxicityActions = [];

  try {
    for (const file of imageFiles) {
      const ocrTarget = options.preprocess === false ? file : await preprocessImage(file, options);
      if (ocrTarget !== file) tempFiles.push(ocrTarget);

      const result = await worker.recognize(ocrTarget);
      const text = String(result?.data?.text || '');
      allTexts.push({ file, text });

      const lines = coalesceLines(text.split(/\r?\n/));
      let sectionType = 'other';
      let lastToxicity = '';
      let currentDrugHeaders = [];

      for (const line of lines) {
        const detected = detectSectionType(line);
        if (detected !== 'other') sectionType = detected;

        const newDrugHeaders = extractDrugHeaders(line);
        if (newDrugHeaders.length >= 2) {
          currentDrugHeaders = newDrugHeaders;
        }

        const cond = extractConditionFromText(line);
        if (cond && (sectionType === 'start_criteria' || /好中球|血小板|Hb|Hgb|CrCl|AST|ALT|T-Bil/i.test(line))) {
          criteria.push({
            ...cond,
            criterion_text: line,
            is_required: true,
            section_type: 'start_criteria',
            source_section: path.basename(file),
          });
        }

        for (const row of parseDoseLevelLine(line, currentDrugHeaders, path.basename(file))) {
          doseLevels.push(row);
        }

        const protocolDose = parseProtocolDoseLine(line, path.basename(file));
        if (protocolDose) {
          doseLevels.push(protocolDose);
        }

        if (!/(Grade|G[1-4]|中止|休薬|減量)/i.test(line)) {
          if (/^[^0-9\s|]{2,}$/.test(line)) lastToxicity = line;
          continue;
        }

        const tox = parseToxicityLine(line, lastToxicity, sectionType, path.basename(file));
        if (tox) {
          toxicityActions.push(tox);
          if (tox.toxicity_name && tox.toxicity_name !== '有害事象') {
            lastToxicity = tox.toxicity_name;
          }
        }
      }
    }
  } finally {
    await worker.terminate();
    for (const temp of tempFiles) {
      try {
        await fs.unlink(temp);
      } catch {
        // ignore
      }
    }
  }

  record.decisionSupport.criteria = dedupBy(criteria,
    (x) => `${x.metric_key}|${x.comparator}|${x.threshold_value}|${x.criterion_text}|${x.source_section}`);
  record.decisionSupport.doseLevels = dedupBy(doseLevels,
    (x) => `${x.drug_name}|${x.level_index}|${x.dose_text}|${x.section_type}|${x.source_section}`);
  record.decisionSupport.toxicityActions = dedupBy(toxicityActions,
    (x) => `${x.toxicity_name}|${x.condition_text}|${x.action_text}|${x.section_type}|${x.source_section}`);

  record.meta = {
    extractor: 'ocr',
    sourceImages: imageFiles,
    preprocessing: {
      enabled: options.preprocess !== false,
      threshold: Number.isFinite(options.threshold) ? options.threshold : 170,
      contrast: Number.isFinite(options.contrast) ? options.contrast : 0.45,
      scale: Number.isFinite(options.scale) ? options.scale : 1.6,
      psm: options.psm || 6,
    },
    counts: {
      criteria: record.decisionSupport.criteria.length,
      doseLevels: record.decisionSupport.doseLevels.length,
      toxicityActions: record.decisionSupport.toxicityActions.length,
    },
    ocrRaw: options.keepRaw ? allTexts : undefined,
  };

  return record;
}
