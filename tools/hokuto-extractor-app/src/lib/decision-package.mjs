export const SECTION_TYPES = [
  'protocol',
  'dose_level',
  'start_criteria',
  'dose_reduction_criteria',
  'hold_stop_criteria',
  'adverse_event',
  'other',
];

const METRIC_PATTERNS = [
  { key: 'anc', pattern: /(好中球|ANC)/i, unit: 'x10^3/uL' },
  { key: 'plt', pattern: /(血小板|Plt|PLT)/i, unit: 'x10^4/uL' },
  { key: 'hgb', pattern: /(ヘモグロビン|Hb|Hgb)/i, unit: 'g/dL' },
  { key: 'cre', pattern: /(Cr\b|Cre|クレアチニン|血中Cre)/i, unit: 'mg/dL' },
  { key: 'egfr', pattern: /(eGFR|Ccr|CrCl)/i, unit: 'mL/min' },
  { key: 'ast', pattern: /(AST)/i, unit: 'U/L' },
  { key: 'alt', pattern: /(ALT)/i, unit: 'U/L' },
  { key: 'tbil', pattern: /(T-?Bil|総ビリルビン|ビリルビン)/i, unit: 'mg/dL' },
  { key: 'lvef', pattern: /(LVEF)/i, unit: '%' },
];

export function normalizeSectionType(input) {
  const text = String(input || '').normalize('NFKC');
  if (/投与開始基準|適格基準|各プロトコル/.test(text)) return 'start_criteria';
  if (/減量レベル|初回基準量と減量レベル/.test(text)) return 'dose_level';
  if (/減量基準/.test(text)) return 'dose_reduction_criteria';
  if (/休薬・中止基準|休薬中止基準|減量中止基準|中止基準/.test(text)) return 'hold_stop_criteria';
  if (/有害事象/.test(text)) return 'adverse_event';
  if (/用法用量|投与スケジュール|治療スケジュール|プロトコル/.test(text)) return 'protocol';
  return 'other';
}

export function normalizeComparator(token) {
  if (token === '≧' || token === '以上') return '>=';
  if (token === '≦' || token === '以下') return '<=';
  return token;
}

export function extractConditionFromText(text) {
  const normalized = String(text || '').normalize('NFKC');
  const metric = METRIC_PATTERNS.find((m) => m.pattern.test(normalized));
  if (!metric) return null;

  const m = normalized.match(/(>=|<=|>|<|=|≧|≦|以上|以下)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)/);
  if (!m) return null;

  const raw = Number((m[2] || '').replace(/,/g, ''));
  if (!Number.isFinite(raw)) return null;

  let threshold = raw;
  if (metric.key === 'anc' && raw > 50) threshold = raw / 1000;
  if (metric.key === 'plt' && raw > 1000) threshold = raw / 10000;

  return {
    metric_key: metric.key,
    comparator: normalizeComparator(m[1]),
    threshold_value: threshold,
    threshold_unit: metric.unit,
  };
}

export function parseLevelIndex(text) {
  const label = String(text || '').normalize('NFKC');
  if (/(通常量|初回投与量|初回基準量)/.test(label)) return 0;
  const m = label.match(/([0-9]+)段階減量/);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 0;
}

export function dedupBy(items, keyFn) {
  const set = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (set.has(key)) continue;
    set.add(key);
    out.push(item);
  }
  return out;
}

export function normalizeHeader(text) {
  return String(text || '').normalize('NFKC').replace(/\s+/g, '');
}

export function makeEmptyRecord({ regimenName, department, sourceTitle, sourceFile, markdownContent }) {
  return {
    regimenName,
    department: department || null,
    sourceTitle: sourceTitle || regimenName,
    sourceFile: sourceFile || null,
    markdownContent: markdownContent || `# ${regimenName}`,
    decisionSupport: {
      criteria: [],
      doseLevels: [],
      toxicityActions: [],
    },
  };
}
