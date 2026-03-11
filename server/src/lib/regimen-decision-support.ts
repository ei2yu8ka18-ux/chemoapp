export type DecisionSectionType =
  | 'protocol'
  | 'dose_level'
  | 'start_criteria'
  | 'dose_reduction_criteria'
  | 'hold_stop_criteria'
  | 'adverse_event'
  | 'other';

export interface DecisionLabSnapshot {
  anc?: number | null;
  plt?: number | null;
  hgb?: number | null;
  cre?: number | null;
  egfr?: number | null;
  ast?: number | null;
  alt?: number | null;
  tbil?: number | null;
  lvef?: number | null;
}

export interface DecisionCriterion {
  metric_key: string;
  comparator: string;
  threshold_value: number;
  threshold_unit: string | null;
  criterion_text: string;
  is_required: boolean;
  section_type: DecisionSectionType;
  source_section: string | null;
}

export interface DecisionDoseLevel {
  drug_name: string;
  level_index: number;
  level_label: string;
  dose_text: string;
  dose_unit: string | null;
  per_basis: string | null;
  is_discontinue: boolean;
  section_type: DecisionSectionType;
  source_section: string | null;
}

export interface DecisionToxicityAction {
  toxicity_name: string;
  condition_text: string;
  action_text: string;
  level_delta: number;
  hold_flag: boolean;
  discontinue_flag: boolean;
  priority: number;
  section_type: DecisionSectionType;
  source_section: string | null;
}

export interface StructuredDecisionSupport {
  criteria: DecisionCriterion[];
  doseLevels: DecisionDoseLevel[];
  toxicityActions: DecisionToxicityAction[];
}

export interface DecisionCriterionAlert {
  metric_key: string;
  comparator: string;
  threshold_value: number;
  threshold_unit: string | null;
  current_value: number | null;
  criterion_text: string;
}

type ParsedTable = {
  rows: string[][];
  section_type: DecisionSectionType;
  section_title: string | null;
};

const METRIC_PATTERNS: Array<{ metric: string; pattern: RegExp; unit: string | null }> = [
  { metric: 'anc', pattern: /(好中球|ANC)/i, unit: 'x10^3/uL' },
  { metric: 'plt', pattern: /(血小板|Plt|PLT)/i, unit: 'x10^4/uL' },
  { metric: 'hgb', pattern: /(ヘモグロビン|Hb|Hgb)/i, unit: 'g/dL' },
  { metric: 'cre', pattern: /(Cr\b|Cre|クレアチニン|血中Cre)/i, unit: 'mg/dL' },
  { metric: 'egfr', pattern: /(eGFR|Ccr|CrCl)/i, unit: 'mL/min' },
  { metric: 'ast', pattern: /(AST)/i, unit: 'U/L' },
  { metric: 'alt', pattern: /(ALT)/i, unit: 'U/L' },
  { metric: 'tbil', pattern: /(T-?Bil|総ビリルビン|ビリルビン)/i, unit: 'mg/dL' },
  { metric: 'lvef', pattern: /(LVEF)/i, unit: '%' },
];

const LEVEL_WORDS: Array<{ pattern: RegExp; level: number }> = [
  { pattern: /(通常量|初回投与量|初回基準量)/, level: 0 },
  { pattern: /1段階減量/, level: 1 },
  { pattern: /2段階減量/, level: 2 },
  { pattern: /3段階減量/, level: 3 },
  { pattern: /4段階減量/, level: 4 },
  { pattern: /5段階減量/, level: 5 },
];

function normalizeComparator(token: string): string {
  if (token === '≧' || token === '以上') return '>=';
  if (token === '≦' || token === '以下') return '<=';
  return token;
}

function normalizeSectionType(title: string): DecisionSectionType {
  const t = title.normalize('NFKC');
  if (/投与開始基準|適格基準|各プロトコル/.test(t)) return 'start_criteria';
  if (/減量レベル|初回基準量と減量レベル/.test(t)) return 'dose_level';
  if (/減量基準/.test(t)) return 'dose_reduction_criteria';
  if (/休薬・中止基準|休薬中止基準|減量中止基準|中止基準/.test(t)) return 'hold_stop_criteria';
  if (/有害事象/.test(t)) return 'adverse_event';
  if (/用法用量|投与スケジュール|治療スケジュール|プロトコル/.test(t)) return 'protocol';
  return 'other';
}

function splitMarkdownRow(row: string): string[] {
  return row
    .split('|')
    .map((cell) => cell.trim())
    .filter((cell, idx, arr) => !(idx === 0 && cell === '') && !(idx === arr.length - 1 && cell === ''));
}

function isMarkdownDelimiter(row: string): boolean {
  return /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(row.trim());
}

function htmlToText(value: string): string {
  return value
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCondition(text: string): { metric_key: string; comparator: string; threshold_value: number; threshold_unit: string | null } | null {
  const normalized = text.normalize('NFKC');
  const metric = METRIC_PATTERNS.find((m) => m.pattern.test(normalized));
  if (!metric) return null;

  const m = normalized.match(/(>=|<=|>|<|=|≧|≦|以上|以下)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)/);
  if (!m) return null;
  const threshold = Number((m[2] || '').replace(/,/g, ''));
  if (!Number.isFinite(threshold)) return null;

  let converted = threshold;
  if (metric.metric === 'anc' && threshold > 50) converted = threshold / 1000;
  if (metric.metric === 'plt' && threshold > 1000) converted = threshold / 10000;

  return {
    metric_key: metric.metric,
    comparator: normalizeComparator(m[1]),
    threshold_value: converted,
    threshold_unit: metric.unit,
  };
}

function extractDrugNameFromSectionTitle(title: string | null): string {
  if (!title) return '薬剤';
  const normalized = title.replace(/^#+\s*/, '').trim();
  const m = normalized.match(/^([^:：]+)[:：]/);
  if (m?.[1]) return m[1].trim();
  return normalized;
}

function parseMarkdownTables(content: string): ParsedTable[] {
  const lines = content.split(/\r?\n/);
  const tables: ParsedTable[] = [];
  let currentSectionTitle: string | null = null;
  let currentSectionType: DecisionSectionType = 'other';

  for (let i = 0; i < lines.length; i += 1) {
    const heading = lines[i].match(/^#{2,6}\s*(.+)$/);
    if (heading) {
      currentSectionTitle = heading[1].trim();
      currentSectionType = normalizeSectionType(currentSectionTitle);
      continue;
    }

    if (!lines[i].includes('|')) continue;
    const start = i;
    const rows: string[][] = [];
    while (i < lines.length && lines[i].includes('|')) {
      if (!isMarkdownDelimiter(lines[i])) {
        const cells = splitMarkdownRow(lines[i]);
        if (cells.length >= 2) rows.push(cells);
      }
      i += 1;
    }
    if (rows.length >= 2) {
      tables.push({
        rows,
        section_type: currentSectionType,
        section_title: currentSectionTitle,
      });
    }
    if (i === start) i += 1;
  }

  return tables;
}

function parseHtmlTables(content: string): ParsedTable[] {
  const tables: ParsedTable[] = [];
  const tableRegex = /<table[\s\S]*?<\/table>/gi;
  const trRegex = /<tr[\s\S]*?<\/tr>/gi;
  const tdRegex = /<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi;
  const headingRegex = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;

  const headings: Array<{ index: number; title: string; type: DecisionSectionType }> = [];
  let hMatch: RegExpExecArray | null;
  while ((hMatch = headingRegex.exec(content)) !== null) {
    const title = htmlToText(hMatch[2] || '');
    headings.push({
      index: hMatch.index,
      title,
      type: normalizeSectionType(title),
    });
  }

  let tableMatch: RegExpExecArray | null;
  while ((tableMatch = tableRegex.exec(content)) !== null) {
    const table = tableMatch[0];
    const tableIndex = tableMatch.index;
    const heading = [...headings].reverse().find((h) => h.index <= tableIndex) || null;
    const sectionTitle = heading?.title ?? null;
    const sectionType = heading?.type ?? 'other';

    const rows: string[][] = [];
    const trMatches = table.match(trRegex) || [];
    for (const tr of trMatches) {
      const cells: string[] = [];
      let tdMatch: RegExpExecArray | null;
      const tdRegexLocal = new RegExp(tdRegex);
      while ((tdMatch = tdRegexLocal.exec(tr)) !== null) {
        const text = htmlToText(tdMatch[2] || '');
        cells.push(text);
      }
      if (cells.length >= 2) rows.push(cells);
    }
    if (rows.length >= 2) {
      tables.push({
        rows,
        section_type: sectionType,
        section_title: sectionTitle,
      });
    }
  }

  return tables;
}

function parseLevelIndex(label: string): number {
  for (const w of LEVEL_WORDS) {
    if (w.pattern.test(label)) return w.level;
  }
  const m = label.match(/([0-9]+)段階減量/);
  return m ? Number(m[1]) : 0;
}

function normalizeHeader(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, '');
}

function parseDoseLevels(tables: ParsedTable[]): DecisionDoseLevel[] {
  const results: DecisionDoseLevel[] = [];
  for (const table of tables) {
    const headers = table.rows[0].map((v) => normalizeHeader(v));
    const hasLevelHeader = headers.some((h) => /用量レベル|減量レベル/.test(h));
    const hasDoseColumns = headers.some((h) => /投与量|mg\/m2|mg\/kg|AUC/.test(h));

    const hasLevelRows = table.rows.slice(1).some((row) => /(初回投与量|初回基準量|段階減量|通常量)/.test((row[0] || '').normalize('NFKC')));

    if (hasLevelHeader || hasLevelRows) {
      const drugHeaders = table.rows[0].slice(1).map((v, idx) => (v || `薬剤${idx + 1}`).trim());
      for (const row of table.rows.slice(1)) {
        if (!row.length) continue;
        const levelLabel = row[0] || '';
        const levelIndex = parseLevelIndex(levelLabel);
        for (let i = 1; i < row.length && i <= drugHeaders.length; i += 1) {
          const doseText = (row[i] || '').trim();
          const drugName = (drugHeaders[i - 1] || '').trim();
          if (!doseText || !drugName || doseText === '-') continue;
          results.push({
            drug_name: drugName,
            level_index: levelIndex,
            level_label: levelLabel,
            dose_text: doseText,
            dose_unit: null,
            per_basis: null,
            is_discontinue: /投与中止|中止/.test(doseText),
            section_type: 'dose_level',
            source_section: table.section_title,
          });
        }
      }
      continue;
    }

    if (hasDoseColumns) {
      const doseIdx = headers.findIndex((h) => /投与量/.test(h));
      const dayIdx = headers.findIndex((h) => /投与日|Day/.test(h));
      if (doseIdx >= 0 && dayIdx >= 0) {
        const drugName = extractDrugNameFromSectionTitle(table.section_title);
        for (const row of table.rows.slice(1)) {
          const baseDose = (row[doseIdx] || '').trim();
          if (!baseDose || baseDose === '-') continue;
          const schedule = dayIdx >= 0 ? (row[dayIdx] || '').trim() : '';
          const doseText = schedule ? `${baseDose} / ${schedule}` : baseDose;
          results.push({
            drug_name: drugName,
            level_index: 0,
            level_label: '通常量',
            dose_text: doseText,
            dose_unit: null,
            per_basis: null,
            is_discontinue: false,
            section_type: 'protocol',
            source_section: table.section_title,
          });
        }
      }
    }
  }
  return results;
}

function parseToxicityActions(tables: ParsedTable[]): DecisionToxicityAction[] {
  const results: DecisionToxicityAction[] = [];
  for (const table of tables) {
    const headers = table.rows[0].map((v) => normalizeHeader(v));
    const toxicityIdx = headers.findIndex((h) => /有害事象/.test(h));
    const conditionIdx = headers.findIndex((h) => /基準|Grade|程度/.test(h));
    const actionMainIdx = headers.findIndex((h) => /処置/.test(h));

    const sectionLooksLikeToxicity = ['dose_reduction_criteria', 'hold_stop_criteria', 'adverse_event'].includes(table.section_type);
    if (toxicityIdx < 0 && !sectionLooksLikeToxicity) continue;
    if (conditionIdx < 0 && actionMainIdx < 0) continue;

    const actionIdxCandidates: number[] = [];
    if (actionMainIdx >= 0) {
      actionIdxCandidates.push(actionMainIdx);
      for (let i = actionMainIdx + 1; i < headers.length; i += 1) {
        const h = headers[i];
        if (!h) continue;
        if (/有害事象|基準|Grade|程度/.test(h)) continue;
        actionIdxCandidates.push(i);
      }
    }
    if (!actionIdxCandidates.length) {
      for (let i = 0; i < headers.length; i += 1) {
        if (i !== toxicityIdx && i !== conditionIdx) actionIdxCandidates.push(i);
      }
    }

    let lastToxicity = '';
    for (const row of table.rows.slice(1)) {
      const toxicityNameRaw = toxicityIdx >= 0 ? (row[toxicityIdx] || '').trim() : '';
      const toxicityName = toxicityNameRaw || lastToxicity || 'その他';
      if (toxicityNameRaw) lastToxicity = toxicityNameRaw;
      const conditionText = conditionIdx >= 0 ? (row[conditionIdx] || '').trim() : '-';

      const actionParts: string[] = [];
      for (const idx of actionIdxCandidates) {
        const value = (row[idx] || '').trim();
        if (!value || value === '-') continue;
        const header = (table.rows[0][idx] || '').trim();
        if (header && !/処置/.test(header) && actionIdxCandidates.length > 1) {
          actionParts.push(`${header}: ${value}`);
        } else {
          actionParts.push(value);
        }
      }
      const actionText = actionParts.join(' / ');
      if (!toxicityName && !conditionText && !actionText) continue;

      const levelDelta = (() => {
        const m = actionText.match(/([0-9]+)段階減量/);
        return m ? Number(m[1]) : 0;
      })();

      const normalizedAction = actionText.normalize('NFKC');
      results.push({
        toxicity_name: toxicityName,
        condition_text: conditionText || '-',
        action_text: actionText || '-',
        level_delta: levelDelta,
        hold_flag: /休薬/.test(normalizedAction),
        discontinue_flag: /中止/.test(normalizedAction),
        priority: table.section_type === 'hold_stop_criteria' ? 10 : table.section_type === 'dose_reduction_criteria' ? 20 : 30,
        section_type: table.section_type === 'other' ? 'adverse_event' : table.section_type,
        source_section: table.section_title,
      });
    }
  }
  return results;
}

function parseEligibilityCriteriaFromSections(content: string): DecisionCriterion[] {
  const lines = content.split(/\r?\n/);
  const results: DecisionCriterion[] = [];
  let currentTitle: string | null = null;
  let currentType: DecisionSectionType = 'other';

  for (const raw of lines) {
    const heading = raw.match(/^#{2,6}\s*(.+)$/);
    if (heading) {
      currentTitle = heading[1].trim();
      currentType = normalizeSectionType(currentTitle);
      continue;
    }

    if (!['start_criteria'].includes(currentType)) continue;

    const line = raw
      .replace(/^\\[-*]\s*/, '')
      .replace(/^[-*]\s*/, '')
      .replace(/^[0-9]+[\.)]\s*/, '')
      .trim();
    if (!line || line.includes('|') || line.startsWith('![')) continue;

    const cond = extractCondition(line);
    if (!cond) continue;

    results.push({
      metric_key: cond.metric_key,
      comparator: cond.comparator,
      threshold_value: cond.threshold_value,
      threshold_unit: cond.threshold_unit,
      criterion_text: line,
      is_required: true,
      section_type: 'start_criteria',
      source_section: currentTitle,
    });
  }

  return results;
}

function parseEligibilityCriteriaFromTables(tables: ParsedTable[]): DecisionCriterion[] {
  const results: DecisionCriterion[] = [];
  for (const table of tables) {
    const headers = table.rows[0].map((v) => normalizeHeader(v));
    const isStartCriteriaTable =
      table.section_type === 'start_criteria'
      || headers.some((h) => /投与開始基準|適格基準/.test(h));
    if (!isStartCriteriaTable) continue;

    for (const row of table.rows.slice(1)) {
      if (row.length < 2) continue;
      const criterionText = `${(row[0] || '').trim()} ${(row.slice(1).join(' ') || '').trim()}`.trim();
      if (!criterionText) continue;
      const cond = extractCondition(criterionText);
      if (!cond) continue;
      results.push({
        metric_key: cond.metric_key,
        comparator: cond.comparator,
        threshold_value: cond.threshold_value,
        threshold_unit: cond.threshold_unit,
        criterion_text: criterionText,
        is_required: true,
        section_type: 'start_criteria',
        source_section: table.section_title,
      });
    }
  }
  return results;
}

function dedupCriteria(criteria: DecisionCriterion[]): DecisionCriterion[] {
  const dedup = new Set<string>();
  return criteria.filter((r) => {
    const key = `${r.metric_key}|${r.comparator}|${r.threshold_value}|${r.criterion_text}|${r.section_type}`;
    if (dedup.has(key)) return false;
    dedup.add(key);
    return true;
  });
}

function dedupDoseLevels(rows: DecisionDoseLevel[]): DecisionDoseLevel[] {
  const dedup = new Set<string>();
  return rows.filter((r) => {
    const key = `${r.drug_name}|${r.level_index}|${r.level_label}|${r.dose_text}|${r.section_type}`;
    if (dedup.has(key)) return false;
    dedup.add(key);
    return true;
  });
}

function dedupToxicity(rows: DecisionToxicityAction[]): DecisionToxicityAction[] {
  const dedup = new Set<string>();
  return rows.filter((r) => {
    const key = `${r.toxicity_name}|${r.condition_text}|${r.action_text}|${r.section_type}`;
    if (dedup.has(key)) return false;
    dedup.add(key);
    return true;
  });
}

export function parseStructuredDecisionSupport(content: string): StructuredDecisionSupport {
  const markdownTables = parseMarkdownTables(content);
  const htmlTables = parseHtmlTables(content);
  const allTables = [...markdownTables, ...htmlTables];

  const criteria = dedupCriteria([
    ...parseEligibilityCriteriaFromSections(content),
    ...parseEligibilityCriteriaFromTables(allTables),
  ]);
  const doseLevels = dedupDoseLevels(parseDoseLevels(allTables));
  const toxicityActions = dedupToxicity(parseToxicityActions(allTables));

  return { criteria, doseLevels, toxicityActions };
}

function pickLabValue(metricKey: string, latestLab: DecisionLabSnapshot | null): number | null {
  if (!latestLab) return null;
  const value = (latestLab as Record<string, unknown>)[metricKey];
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function compare(current: number, comparator: string, threshold: number): boolean {
  switch (comparator) {
    case '>=': return current >= threshold;
    case '<=': return current <= threshold;
    case '>': return current > threshold;
    case '<': return current < threshold;
    case '=': return current === threshold;
    default: return false;
  }
}

export function evaluateDecisionCriteria(
  criteria: DecisionCriterion[],
  latestLab: DecisionLabSnapshot | null,
): DecisionCriterionAlert[] {
  const alerts: DecisionCriterionAlert[] = [];
  for (const c of criteria) {
    const current = pickLabValue(c.metric_key, latestLab);
    if (current == null) continue;
    const ok = compare(current, c.comparator, c.threshold_value);
    if (!ok) {
      alerts.push({
        metric_key: c.metric_key,
        comparator: c.comparator,
        threshold_value: c.threshold_value,
        threshold_unit: c.threshold_unit,
        current_value: current,
        criterion_text: c.criterion_text,
      });
    }
  }
  return alerts;
}

export function evaluateToxicityActions(
  actions: DecisionToxicityAction[],
  latestLab: DecisionLabSnapshot | null,
): DecisionToxicityAction[] {
  const matched: DecisionToxicityAction[] = [];
  for (const action of actions) {
    const cond = extractCondition(action.condition_text);
    if (!cond) continue;
    const current = pickLabValue(cond.metric_key, latestLab);
    if (current == null) continue;
    if (compare(current, cond.comparator, cond.threshold_value)) {
      matched.push(action);
    }
  }
  return matched;
}

export function recommendReductionLevel(actions: DecisionToxicityAction[]): number {
  return actions.reduce((max, row) => Math.max(max, row.level_delta || 0), 0);
}

export function pickDoseLevelByReduction(doseLevels: DecisionDoseLevel[], level: number): DecisionDoseLevel[] {
  if (!doseLevels.length) return [];
  const exact = doseLevels.filter((row) => row.level_index === level);
  if (exact.length) return exact;
  const zero = doseLevels.filter((row) => row.level_index === 0);
  return zero;
}
