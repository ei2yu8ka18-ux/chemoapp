import fs from 'fs';
import path from 'path';

export type GuidelineRuleType =
  | 'start_criteria'
  | 'dose_adjustment'
  | 'toxicity_management'
  | 'protocol_note';

export type GuidelineEvaluationMode = 'condition' | 'requirement' | 'manual';

export type GuidelineSeverity = 'info' | 'warning' | 'error';

export interface ParsedGuidelineRule {
  regimen_name: string;
  regimen_key: string;
  rule_type: GuidelineRuleType;
  evaluation_mode: GuidelineEvaluationMode;
  metric_key: string | null;
  comparator: string | null;
  threshold_value: number | null;
  threshold_unit: string | null;
  condition_text: string;
  action_text: string;
  severity: GuidelineSeverity;
  source_file: string;
  source_line: number;
}

export interface ParsedGuidelineDocument {
  regimenName: string;
  regimenKey: string;
  sourceTitle: string | null;
  sourceFile: string;
  markdownContent: string;
  rules: ParsedGuidelineRule[];
}

export interface GuidelineRuleRow {
  id: number;
  regimen_name: string;
  regimen_key: string;
  rule_type: GuidelineRuleType;
  evaluation_mode: GuidelineEvaluationMode;
  metric_key: string | null;
  comparator: string | null;
  threshold_value: number | null;
  threshold_unit: string | null;
  condition_text: string;
  action_text: string;
  severity: GuidelineSeverity;
  source_file: string | null;
  source_line: number | null;
  is_active: boolean;
}

export interface GuidelineAlertRow {
  rule_id: number;
  rule_type: GuidelineRuleType;
  severity: GuidelineSeverity;
  evaluation_mode: GuidelineEvaluationMode;
  metric_key: string | null;
  comparator: string | null;
  threshold_value: number | null;
  threshold_unit: string | null;
  condition_text: string;
  action_text: string;
  current_value: number | null;
  source_file: string | null;
  source_line: number | null;
}

export interface LabSnapshot {
  anc?: number | null;
  plt?: number | null;
  hgb?: number | null;
  ast?: number | null;
  alt?: number | null;
  tbil?: number | null;
  egfr?: number | null;
}

const METRIC_PATTERNS: Array<{ metric: string; pattern: RegExp }> = [
  { metric: 'anc', pattern: /(好中球|ANC)/i },
  { metric: 'plt', pattern: /(血小板|PLT)/i },
  { metric: 'hgb', pattern: /(ヘモグロビン|Hb|Hgb)/i },
  { metric: 'ast', pattern: /(AST)/i },
  { metric: 'alt', pattern: /(ALT)/i },
  { metric: 'tbil', pattern: /(T[-\s]?Bil|総ビリルビン|ビリルビン)/i },
  { metric: 'egfr', pattern: /(CrCl|Ccr|eGFR|クレアチニン|腎機能|Cre)/i },
];

const COMPARATOR_TOKENS = ['>=', '<=', '>', '<', '≧', '≦', '以上', '以下', '未満', '超'];

function trimMarkdownDecoration(line: string): string {
  return line
    .replace(/^\s*[-*]\s+/, '')
    .replace(/^\s*\d+\.\s+/, '')
    .replace(/`+/g, '')
    .trim();
}

function isLikelyRuleLine(line: string): boolean {
  const normalized = line.normalize('NFKC');
  if (!normalized) return false;
  if (normalized.startsWith('![')) return false;
  if (/^https?:\/\//i.test(normalized)) return false;

  const hasKeyword = /(減量|休薬|中止|再開|開始基準|適格基準|投与基準|投与延期|有害事象|毒性|Grade|好中球|血小板|AST|ALT|T-?Bil|CrCl|eGFR|Cre)/i.test(normalized);
  const hasComparator = /(>=|<=|>|<|≧|≦|以上|以下|未満|超)/.test(normalized);
  return hasKeyword || hasComparator;
}

function normalizeComparator(token: string): string {
  if (token === '≧' || token === '以上') return '>=';
  if (token === '≦' || token === '以下') return '<=';
  if (token === '未満') return '<';
  if (token === '超') return '>';
  return token;
}

function extractComparatorAndValue(line: string): { comparator: string; value: number; hasManUnit: boolean } | null {
  const normalized = line.normalize('NFKC');

  for (const token of COMPARATOR_TOKENS) {
    const idx = normalized.indexOf(token);
    if (idx < 0) continue;
    const right = normalized.slice(idx + token.length);
    const m = right.match(/([0-9]+(?:\.[0-9]+)?)\s*(万)?/);
    if (!m) continue;
    const raw = Number(m[1]);
    if (!Number.isFinite(raw)) continue;
    return {
      comparator: normalizeComparator(token),
      value: raw,
      hasManUnit: Boolean(m[2]),
    };
  }
  return null;
}

function toRuleType(text: string): GuidelineRuleType {
  const normalized = text.normalize('NFKC');
  if (/(開始基準|適格基準|投与基準|サイクル開始基準)/.test(normalized)) return 'start_criteria';
  if (/(減量|増量|用量調整)/.test(normalized)) return 'dose_adjustment';
  if (/(休薬|中止|再開|毒性|有害事象|Grade)/.test(normalized)) return 'toxicity_management';
  return 'protocol_note';
}

function toEvaluationMode(text: string): GuidelineEvaluationMode {
  const normalized = text.normalize('NFKC');
  if (/(開始基準|適格基準|投与基準|サイクル開始基準)/.test(normalized)) return 'requirement';
  if (/(減量|休薬|中止|再開|Grade|毒性|有害事象)/.test(normalized)) return 'condition';
  return 'manual';
}

function toSeverity(text: string): GuidelineSeverity {
  const normalized = text.normalize('NFKC');
  if (/(永久中止|中止|Grade\s*[34]|Grade[34]|重篤)/i.test(normalized)) return 'error';
  if (/(減量|休薬|再開|投与延期|警告|注意)/.test(normalized)) return 'warning';
  return 'info';
}

function convertThreshold(metric: string, rawValue: number, hasManUnit: boolean, line: string): number {
  const normalized = line.normalize('NFKC');
  if (metric === 'anc') {
    // labs ANC unit is x10^3/uL. Convert if source line is per uL/mm3 scale.
    if (/\/\s*(uL|μL|mm3|mm\^3)/i.test(normalized) && rawValue > 50) return rawValue / 1000;
  }
  if (metric === 'plt') {
    // labs Plt unit is x10^4/uL.
    if (hasManUnit) return rawValue; // 10万/uL => 10
    if (/\/\s*(uL|μL|mm3|mm\^3)/i.test(normalized) && rawValue > 1000) return rawValue / 10000;
  }
  return rawValue;
}

function normalizeRuleText(line: string): string {
  return line
    .replace(/\s+/g, ' ')
    .replace(/｡/g, '。')
    .replace(/､/g, '、')
    .trim();
}

function extractTitle(content: string): string | null {
  const m = content.match(/^\s*title:\s*"([^"]+)"/m);
  if (!m?.[1]) return null;
  const first = m[1].split('|')[0]?.trim();
  return first || null;
}

function extractRegimenNameFromFileName(filePath: string): string {
  const base = path.basename(filePath, '.md');
  const chunk = base.split('  レジメン')[0]?.trim();
  return chunk || base;
}

export function normalizeRegimenKey(regimenName: string): string {
  return regimenName
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^0-9a-zぁ-んァ-ン一-龯]/gi, '');
}

export function parseGuidelineMarkdown(filePath: string): ParsedGuidelineDocument {
  const markdownContent = fs.readFileSync(filePath, 'utf8');
  const sourceTitle = extractTitle(markdownContent);
  const regimenName = (sourceTitle ? sourceTitle.split('|')[0] : extractRegimenNameFromFileName(filePath)).trim();
  const regimenKey = normalizeRegimenKey(regimenName);

  const rules: ParsedGuidelineRule[] = [];
  const dedup = new Set<string>();
  const lines = markdownContent.split(/\r?\n/);
  let currentHeading = '';
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const line = trimMarkdownDecoration(rawLine);
    if (!line) continue;

    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const heading = line.match(/^#{2,6}\s*(.+)$/);
    if (heading?.[1]) {
      currentHeading = heading[1].trim();
      continue;
    }

    if (!isLikelyRuleLine(line)) continue;

    const mergedText = normalizeRuleText(`${currentHeading ? `[${currentHeading}] ` : ''}${line}`);
    const ruleType = toRuleType(`${currentHeading} ${line}`);
    const evaluationMode = toEvaluationMode(`${currentHeading} ${line}`);
    const severity = toSeverity(`${currentHeading} ${line}`);

    const metricMatches = METRIC_PATTERNS.filter((m) => m.pattern.test(line.normalize('NFKC')));
    const comparatorInfo = extractComparatorAndValue(line);

    if (metricMatches.length && comparatorInfo) {
      for (const metricDef of metricMatches) {
        const threshold = convertThreshold(metricDef.metric, comparatorInfo.value, comparatorInfo.hasManUnit, line);
        const rule: ParsedGuidelineRule = {
          regimen_name: regimenName,
          regimen_key: regimenKey,
          rule_type: ruleType,
          evaluation_mode: evaluationMode,
          metric_key: metricDef.metric,
          comparator: comparatorInfo.comparator,
          threshold_value: threshold,
          threshold_unit: metricDef.metric === 'anc' ? 'x10^3/uL' :
            metricDef.metric === 'plt' ? 'x10^4/uL' :
              metricDef.metric === 'egfr' ? 'mL/min' :
                metricDef.metric === 'hgb' ? 'g/dL' :
                  metricDef.metric === 'ast' || metricDef.metric === 'alt' ? 'U/L' :
                    metricDef.metric === 'tbil' ? 'mg/dL' : null,
          condition_text: mergedText,
          action_text: mergedText,
          severity,
          source_file: filePath,
          source_line: i + 1,
        };
        const k = `${rule.regimen_key}|${rule.metric_key}|${rule.condition_text}`;
        if (!dedup.has(k)) {
          dedup.add(k);
          rules.push(rule);
        }
      }
      continue;
    }

    const hasActionKeyword = /(減量|休薬|中止|再開|注意|投与延期|有害事象|Grade)/i.test(line.normalize('NFKC'));
    if (hasActionKeyword) {
      const rule: ParsedGuidelineRule = {
        regimen_name: regimenName,
        regimen_key: regimenKey,
        rule_type: ruleType,
        evaluation_mode: 'manual',
        metric_key: null,
        comparator: null,
        threshold_value: null,
        threshold_unit: null,
        condition_text: mergedText,
        action_text: mergedText,
        severity,
        source_file: filePath,
        source_line: i + 1,
      };
      const k = `${rule.regimen_key}|manual|${rule.condition_text}`;
      if (!dedup.has(k)) {
        dedup.add(k);
        rules.push(rule);
      }
    }
  }

  return {
    regimenName,
    regimenKey,
    sourceTitle,
    sourceFile: filePath,
    markdownContent,
    rules,
  };
}

function compare(value: number, comparator: string, threshold: number): boolean {
  switch (comparator) {
    case '>=': return value >= threshold;
    case '<=': return value <= threshold;
    case '>': return value > threshold;
    case '<': return value < threshold;
    case '=': return value === threshold;
    default: return false;
  }
}

function pickCurrentValue(metricKey: string | null, latestLab: LabSnapshot | null): number | null {
  if (!metricKey || !latestLab) return null;
  const v = (latestLab as Record<string, unknown>)[metricKey];
  if (v === null || v === undefined) return null;
  const num = Number(v);
  return Number.isFinite(num) ? num : null;
}

export function evaluateGuidelineAlerts(
  rules: GuidelineRuleRow[],
  latestLab: LabSnapshot | null
): GuidelineAlertRow[] {
  const alerts: GuidelineAlertRow[] = [];
  for (const rule of rules) {
    if (!rule.is_active) continue;
    if (!rule.metric_key || !rule.comparator || rule.threshold_value == null) continue;

    const currentValue = pickCurrentValue(rule.metric_key, latestLab);
    if (currentValue == null) continue;

    const satisfied = compare(currentValue, rule.comparator, Number(rule.threshold_value));
    const triggered = rule.evaluation_mode === 'requirement' ? !satisfied : satisfied;
    if (!triggered) continue;

    alerts.push({
      rule_id: rule.id,
      rule_type: rule.rule_type,
      severity: rule.severity,
      evaluation_mode: rule.evaluation_mode,
      metric_key: rule.metric_key,
      comparator: rule.comparator,
      threshold_value: Number(rule.threshold_value),
      threshold_unit: rule.threshold_unit,
      condition_text: rule.condition_text,
      action_text: rule.action_text,
      current_value: currentValue,
      source_file: rule.source_file,
      source_line: rule.source_line,
    });
  }
  return alerts;
}

