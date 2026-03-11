import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
import {
  dedupBy,
  extractConditionFromText,
  makeEmptyRecord,
  normalizeHeader,
  normalizeSectionType,
  parseLevelIndex,
} from './decision-package.mjs';

function parseTitleFromHtml(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m?.[1]?.trim() || '';
}

function inferRegimenName(title, filePath) {
  const fromTitle = String(title || '').split('|')[0]?.trim();
  if (fromTitle) return fromTitle;
  return path.basename(filePath, path.extname(filePath));
}

function parseNextData(html) {
  const m = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m?.[1]) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function flattenStrings(value, out = []) {
  if (typeof value === 'string') {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) flattenStrings(item, out);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) flattenStrings(v, out);
  }
  return out;
}

function getRegimenFromNextData(nextData) {
  return nextData?.props?.pageProps?.regimen ?? null;
}

function toFlatText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function toTitleCaseKey(key) {
  return String(key || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
}

function parseAbstractOps(abstractOps) {
  const lines = [];
  const images = [];
  let currentSection = 'abstract';
  let lastTextLine = '';

  for (const op of abstractOps || []) {
    const insert = op?.insert;
    const attrs = op?.attributes || {};

    if (typeof insert === 'string') {
      const parts = insert.replace(/\r/g, '').split('\n');
      for (let i = 0; i < parts.length; i += 1) {
        const text = parts[i].trim();
        if (text) {
          lines.push({ text, section: currentSection });
          lastTextLine = text;
        }
        const isLineBreak = i < parts.length - 1;
        if (isLineBreak && attrs.heading && lastTextLine) {
          currentSection = lastTextLine;
        }
      }
      continue;
    }

    if (insert && typeof insert === 'object') {
      const src = toFlatText(insert.source || insert.url || insert.src);
      if (src) {
        images.push({ url: src, section: currentSection });
      }
    }
  }

  return { lines, images };
}

function extractDoseLevelsFromMedicines(regimen) {
  const out = [];
  const medicines = Array.isArray(regimen?.medicines) ? regimen.medicines : [];
  for (const med of medicines) {
    const drugName = toFlatText(med?.generalName || med?.name || med?.productName) || '薬剤';
    const doses = Array.isArray(med?.doses) ? med.doses : [];
    for (const d of doses) {
      const dose = toFlatText(d?.dose);
      if (!dose || dose === '-') continue;
      const course = toFlatText(d?.course);
      const period = toFlatText(d?.period);
      const doseText = [dose, course ? `コース ${course}` : '', period ? `投与日 ${period}` : '']
        .filter(Boolean)
        .join(' / ');
      out.push({
        drug_name: drugName,
        level_index: 0,
        level_label: '通常量',
        dose_text: doseText,
        dose_unit: null,
        per_basis: null,
        is_discontinue: false,
        section_type: 'protocol',
        source_section: 'regimen.medicines',
      });
    }
  }
  return out;
}

function extractScheduleImageUrls(regimen) {
  const urls = [];
  const scheduleImages = Array.isArray(regimen?.scheduleImages) ? regimen.scheduleImages : [];
  for (const image of scheduleImages) {
    const src = toFlatText(image?.source || image?.url || image?.src || image);
    if (src) urls.push({ url: src, section: 'scheduleImages' });
  }
  return urls;
}

function extractTablesFromRegimenObjectArrays(regimen) {
  const tables = [];
  const visited = new Set();

  function pushTable(heading, rows) {
    if (!rows || rows.length < 2) return;
    const key = JSON.stringify([heading, rows[0], rows.length]);
    if (visited.has(key)) return;
    visited.add(key);
    const sectionType = normalizeSectionType(heading || rows[0].join(' '));
    tables.push({ rows, heading, sectionType });
  }

  function walk(value, pathTokens) {
    if (Array.isArray(value)) {
      if (value.length >= 2 && value.every((row) => row && typeof row === 'object' && !Array.isArray(row))) {
        const keySet = new Set();
        for (const row of value.slice(0, 30)) {
          Object.keys(row).forEach((k) => keySet.add(k));
        }
        const keys = Array.from(keySet);
        if (keys.length >= 2 && keys.length <= 8) {
          const rows = [keys.map((k) => toTitleCaseKey(k))];
          for (const row of value) {
            rows.push(keys.map((k) => toFlatText(row[k])));
          }
          pushTable(`regimen.${pathTokens.join('.')}`, rows);
        }
      }
      value.forEach((item, idx) => walk(item, [...pathTokens, `[${idx}]`]));
      return;
    }
    if (value && typeof value === 'object') {
      Object.entries(value).forEach(([k, v]) => walk(v, [...pathTokens, k]));
    }
  }

  if (regimen && typeof regimen === 'object') {
    walk(regimen, []);
  }
  return tables;
}

function extractTablesFromHtml($) {
  const tables = [];
  $('table').each((_, tableNode) => {
    const table = $(tableNode);
    const rows = [];
    table.find('tr').each((__, trNode) => {
      const cells = [];
      $(trNode).find('th,td').each((___, cellNode) => {
        const text = $(cellNode).text().replace(/\s+/g, ' ').trim();
        cells.push(text);
      });
      if (cells.length >= 2) rows.push(cells);
    });

    if (rows.length < 2) return;

    const heading = table.prevAll('h1,h2,h3,h4,h5').first().text().replace(/\s+/g, ' ').trim();
    const sectionType = normalizeSectionType(heading || rows[0].join(' '));
    tables.push({ rows, heading: heading || null, sectionType });
  });
  return tables;
}

function splitMarkdownRow(row) {
  return row
    .split('|')
    .map((cell) => cell.trim())
    .filter((cell, idx, arr) => !(idx === 0 && cell === '') && !(idx === arr.length - 1 && cell === ''));
}

function isMarkdownDelimiter(row) {
  return /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(row.trim());
}

function extractTablesFromMarkdown(markdownText) {
  const lines = markdownText.split(/\r?\n/);
  const tables = [];
  let currentHeading = null;
  let currentSectionType = 'other';

  for (let i = 0; i < lines.length; i += 1) {
    const heading = lines[i].match(/^#{2,6}\s*(.+)$/);
    if (heading) {
      currentHeading = heading[1].trim();
      currentSectionType = normalizeSectionType(currentHeading);
      continue;
    }

    if (!lines[i].includes('|')) continue;

    const rows = [];
    while (i < lines.length && lines[i].includes('|')) {
      if (!isMarkdownDelimiter(lines[i])) {
        const cells = splitMarkdownRow(lines[i]);
        if (cells.length >= 2) rows.push(cells);
      }
      i += 1;
    }

    if (rows.length >= 2) {
      tables.push({ rows, heading: currentHeading, sectionType: currentSectionType });
    }
  }

  return tables;
}

function extractCriteriaFromText(text, sectionType, sourceSection) {
  const lines = String(text || '').split(/\r?\n/);
  const rows = [];
  for (const raw of lines) {
    const line = raw
      .replace(/^\\[-*]\s*/, '')
      .replace(/^[-*]\s*/, '')
      .replace(/^[0-9]+[\.)]\s*/, '')
      .trim();
    if (!line || line.includes('|') || line.startsWith('![')) continue;
    const cond = extractConditionFromText(line);
    if (!cond) continue;
    rows.push({
      ...cond,
      criterion_text: line,
      is_required: true,
      section_type: sectionType,
      source_section: sourceSection || null,
    });
  }
  return rows;
}

function extractCriteriaFromTables(tables) {
  const out = [];
  for (const table of tables) {
    const headers = table.rows[0].map((v) => normalizeHeader(v));
    const isTarget =
      table.sectionType === 'start_criteria'
      || headers.some((h) => /投与開始基準|適格基準|項目|criteria|criterion|eligibility|metric|item/.test(h));
    if (!isTarget) continue;

    for (const row of table.rows.slice(1)) {
      const text = `${(row[0] || '').trim()} ${(row.slice(1).join(' ') || '').trim()}`.trim();
      const cond = extractConditionFromText(text);
      if (!cond) continue;
      out.push({
        ...cond,
        criterion_text: text,
        is_required: true,
        section_type: 'start_criteria',
        source_section: table.heading || null,
      });
    }
  }
  return out;
}

function extractDoseLevelsFromTables(tables) {
  const out = [];
  for (const table of tables) {
    const headers = table.rows[0].map((h) => normalizeHeader(h));
    const hasLevelHeader = headers.some((h) => /減量レベル|用量レベル|doselevel|level/.test(h));
    const hasDoseColumns = headers.some((h) => /投与量|mg\/m2|mg\/kg|AUC|dose|dosage/.test(h));

    if (hasLevelHeader) {
      const drugHeaders = table.rows[0].slice(1).map((h, i) => h.trim() || `drug${i + 1}`);
      for (const row of table.rows.slice(1)) {
        const levelLabel = row[0] || '';
        const levelIndex = parseLevelIndex(levelLabel);
        for (let i = 1; i < row.length && i <= drugHeaders.length; i += 1) {
          const doseText = (row[i] || '').trim();
          if (!doseText || doseText === '-') continue;
          out.push({
            drug_name: drugHeaders[i - 1],
            level_index: levelIndex,
            level_label: levelLabel || '通常量',
            dose_text: doseText,
            dose_unit: null,
            per_basis: null,
            is_discontinue: /中止/.test(doseText),
            section_type: 'dose_level',
            source_section: table.heading || null,
          });
        }
      }
      continue;
    }

    if (hasDoseColumns) {
      const doseIdx = headers.findIndex((h) => /投与量/.test(h));
      const dayIdx = headers.findIndex((h) => /投与日|Day/.test(h));
      if (doseIdx < 0 || dayIdx < 0) continue;

      const source = String(table.heading || '').trim();
      const m = source.match(/^([^:：]+)[:：]/);
      const drugName = m?.[1]?.trim() || source || '薬剤';

      for (const row of table.rows.slice(1)) {
        const dose = (row[doseIdx] || '').trim();
        if (!dose || dose === '-') continue;
        const day = (row[dayIdx] || '').trim();
        out.push({
          drug_name: drugName,
          level_index: 0,
          level_label: '通常量',
          dose_text: day ? `${dose} / ${day}` : dose,
          dose_unit: null,
          per_basis: null,
          is_discontinue: false,
          section_type: 'protocol',
          source_section: table.heading || null,
        });
      }
    }
  }
  return out;
}

function extractToxicityFromTables(tables) {
  const out = [];
  for (const table of tables) {
    const headers = table.rows[0].map((h) => normalizeHeader(h));
    const toxIdx = headers.findIndex((h) => /有害事象|adverseevent|toxicity|event/.test(h));
    const condIdx = headers.findIndex((h) => /基準|Grade|程度|criteria|condition/.test(h));
    const actionIdx = headers.findIndex((h) => /処置|action|management/.test(h));

    const looksToxicity = ['dose_reduction_criteria', 'hold_stop_criteria', 'adverse_event'].includes(table.sectionType);
    if (toxIdx < 0 && !looksToxicity) continue;
    if (condIdx < 0 && actionIdx < 0) continue;

    let lastToxicity = '';
    for (const row of table.rows.slice(1)) {
      const toxicity = (toxIdx >= 0 ? row[toxIdx] : '')?.trim() || lastToxicity || 'その他';
      if (toxicity) lastToxicity = toxicity;

      const condition = (condIdx >= 0 ? row[condIdx] : '')?.trim() || '-';
      const actionParts = [];
      if (actionIdx >= 0) {
        for (let i = actionIdx; i < row.length; i += 1) {
          const cell = (row[i] || '').trim();
          if (!cell || cell === '-') continue;
          const header = (table.rows[0][i] || '').trim();
          if (i === actionIdx || !header) {
            actionParts.push(cell);
          } else {
            actionParts.push(`${header}: ${cell}`);
          }
        }
      }
      const action = actionParts.join(' / ') || '-';
      if (!toxicity && !condition && !action) continue;

      const m = action.match(/([0-9]+)段階減量/);
      out.push({
        toxicity_name: toxicity,
        condition_text: condition,
        action_text: action,
        level_delta: m ? Number(m[1]) : 0,
        hold_flag: /休薬/.test(action),
        discontinue_flag: /中止/.test(action),
        priority: table.sectionType === 'hold_stop_criteria' ? 10 : table.sectionType === 'dose_reduction_criteria' ? 20 : 30,
        section_type: table.sectionType === 'other' ? 'adverse_event' : table.sectionType,
        source_section: table.heading || null,
      });
    }
  }
  return out;
}

function parseMarkdownFrontmatter(markdown) {
  const m = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const lines = m[1].split(/\r?\n/);
  const out = {};
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^"|"$/g, '');
    out[key] = value;
  }
  return out;
}

export async function extractRecordFromHtmlFile(filePath, options = {}) {
  const content = await fs.readFile(filePath, 'utf8');
  const ext = path.extname(filePath).toLowerCase();

  let title = '';
  let regimenName = '';
  let nextData = null;
  let tables = [];
  let criteriaTextSource = '';
  let abstractImageEntries = [];
  let nextDataText = '';
  let regimenJsonDoseLevels = [];
  let regimenJsonTables = [];

  if (ext === '.md' || ext === '.txt') {
    const fm = parseMarkdownFrontmatter(content);
    title = String(fm.title || '');
    regimenName = options.regimenName || inferRegimenName(title, filePath);
    tables = extractTablesFromMarkdown(content);
    criteriaTextSource = content;
  } else {
    title = parseTitleFromHtml(content);
    regimenName = options.regimenName || inferRegimenName(title, filePath);
    nextData = parseNextData(content);
    const regimen = getRegimenFromNextData(nextData);

    const $ = cheerio.load(content);
    tables = extractTablesFromHtml($);
    criteriaTextSource = $('body').text().replace(/\s+/g, ' ');

    if (regimen) {
      const abstract = parseAbstractOps(regimen.abstracts);
      abstractImageEntries = [
        ...extractScheduleImageUrls(regimen),
        ...abstract.images,
      ];
      nextDataText = abstract.lines.map((line) => line.text).join('\n');
      regimenJsonDoseLevels = extractDoseLevelsFromMedicines(regimen);
      regimenJsonTables = extractTablesFromRegimenObjectArrays(regimen);
    }
  }

  const record = makeEmptyRecord({
    regimenName,
    department: options.department || null,
    sourceTitle: title || regimenName,
    sourceFile: options.sourceFile || filePath,
    markdownContent: ext === '.md' || ext === '.txt' ? content : `# ${regimenName}`,
  });

  const mergedTables = [...tables, ...regimenJsonTables];
  const criteriaFromTables = extractCriteriaFromTables(mergedTables);
  const criteriaFromText = extractCriteriaFromText(
    [criteriaTextSource, nextDataText].filter(Boolean).join('\n'),
    'start_criteria',
    'text-scan',
  );
  const doseLevels = [...extractDoseLevelsFromTables(mergedTables), ...regimenJsonDoseLevels];
  const toxicityActions = extractToxicityFromTables(mergedTables);

  const criteria = dedupBy([...criteriaFromTables, ...criteriaFromText],
    (x) => `${x.metric_key}|${x.comparator}|${x.threshold_value}|${x.criterion_text}`);

  record.decisionSupport.criteria = criteria;
  record.decisionSupport.doseLevels = dedupBy(doseLevels,
    (x) => `${x.drug_name}|${x.level_index}|${x.level_label}|${x.dose_text}|${x.section_type}`);
  record.decisionSupport.toxicityActions = dedupBy(toxicityActions,
    (x) => `${x.toxicity_name}|${x.condition_text}|${x.action_text}|${x.section_type}`);

  const nextDataStrings = nextData ? flattenStrings(nextData) : [];
  const imageSources = dedupBy(abstractImageEntries, (x) => x.url);
  record.meta = {
    extractor: 'html',
    sourcePath: filePath,
    tableCount: tables.length,
    regimenJsonTableCount: regimenJsonTables.length,
    nextDataStringCount: nextDataStrings.length,
    imageSourceCount: imageSources.length,
    imageSources,
    counts: {
      criteria: record.decisionSupport.criteria.length,
      doseLevels: record.decisionSupport.doseLevels.length,
      toxicityActions: record.decisionSupport.toxicityActions.length,
    },
  };

  return record;
}
