import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { pool } from '../db/pool';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import {
  evaluateGuidelineAlerts,
  GuidelineRuleRow,
  normalizeRegimenKey,
  parseGuidelineMarkdown,
} from '../lib/regimen-guideline';
import {
  DecisionSectionType,
  StructuredDecisionSupport,
  evaluateDecisionCriteria,
  evaluateToxicityActions,
  parseStructuredDecisionSupport,
  pickDoseLevelByReduction,
  recommendReductionLevel,
} from '../lib/regimen-decision-support';

const router = Router();
router.use(authenticateToken);

function calcBSA(heightCm: number, weightKg: number): number {
  return 0.007184 * Math.pow(heightCm, 0.725) * Math.pow(weightKg, 0.425);
}

function normalizeDateString(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function requireAdmin(req: AuthRequest, res: Response): boolean {
  if (req.userRole !== 'admin') {
    res.status(403).json({ error: 'admin only' });
    return false;
  }
  return true;
}

async function ensureGuidelineTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS regimen_guideline_sources (
      id SERIAL PRIMARY KEY,
      regimen_id INTEGER REFERENCES regimen_master(id) ON DELETE SET NULL,
      department TEXT,
      regimen_name TEXT NOT NULL,
      regimen_key TEXT NOT NULL,
      source_file TEXT NOT NULL,
      source_title TEXT,
      markdown_content TEXT NOT NULL,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (regimen_key, source_file)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS regimen_guideline_rules (
      id SERIAL PRIMARY KEY,
      regimen_id INTEGER REFERENCES regimen_master(id) ON DELETE SET NULL,
      regimen_name TEXT NOT NULL,
      regimen_key TEXT NOT NULL,
      rule_type VARCHAR(40) NOT NULL,
      evaluation_mode VARCHAR(20) NOT NULL DEFAULT 'condition',
      metric_key VARCHAR(40),
      comparator VARCHAR(8),
      threshold_value NUMERIC(12,4),
      threshold_unit VARCHAR(40),
      condition_text TEXT NOT NULL,
      action_text TEXT NOT NULL,
      severity VARCHAR(20) NOT NULL DEFAULT 'warning',
      source_file TEXT,
      source_line INTEGER,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE regimen_guideline_sources ADD COLUMN IF NOT EXISTS department TEXT`);
  await pool.query(`ALTER TABLE regimen_guideline_sources ADD COLUMN IF NOT EXISTS regimen_id INTEGER REFERENCES regimen_master(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE regimen_guideline_rules ADD COLUMN IF NOT EXISTS regimen_id INTEGER REFERENCES regimen_master(id) ON DELETE SET NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_regimen_guideline_sources_regimen_id ON regimen_guideline_sources (regimen_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_regimen_guideline_rules_regimen_id ON regimen_guideline_rules (regimen_id)`);
}

type GuidelineSourceRow = {
  id: number;
  department?: string | null;
  regimen_name: string;
  regimen_key: string;
  source_file: string | null;
  source_title?: string | null;
  markdown_content: string;
  imported_at: string | null;
};

type DecisionCriterionRow = {
  id: number;
  source_id: number | null;
  regimen_id: number | null;
  department: string | null;
  regimen_name: string;
  regimen_key: string;
  metric_key: string;
  comparator: string;
  threshold_value: string | number;
  threshold_unit: string | null;
  criterion_text: string;
  is_required: boolean;
  section_type: string;
  source_section: string | null;
  sort_order: number;
};

type DecisionDoseLevelRow = {
  id: number;
  source_id: number | null;
  regimen_id: number | null;
  department: string | null;
  regimen_name: string;
  regimen_key: string;
  drug_name: string;
  level_index: number;
  level_label: string;
  dose_text: string;
  dose_unit: string | null;
  per_basis: string | null;
  is_discontinue: boolean;
  section_type: string;
  source_section: string | null;
  sort_order: number;
};

type DecisionToxicityActionRow = {
  id: number;
  source_id: number | null;
  regimen_id: number | null;
  department: string | null;
  regimen_name: string;
  regimen_key: string;
  toxicity_name: string;
  condition_text: string;
  action_text: string;
  level_delta: number;
  hold_flag: boolean;
  discontinue_flag: boolean;
  priority: number;
  section_type: string;
  source_section: string | null;
  sort_order: number;
};

type DecisionSupportSourceMeta = {
  sourceId: number;
  regimenId: number | null;
  department: string | null;
  regimenName: string;
  regimenKey: string;
};

type DecisionSupportPackageInput = {
  criteria: Array<Record<string, unknown>>;
  doseLevels: Array<Record<string, unknown>>;
  toxicityActions: Array<Record<string, unknown>>;
};

const DECISION_SECTION_TYPES: DecisionSectionType[] = [
  'protocol',
  'dose_level',
  'start_criteria',
  'dose_reduction_criteria',
  'hold_stop_criteria',
  'adverse_event',
  'other',
];

function normalizeDecisionSectionType(value: unknown, fallback: DecisionSectionType): DecisionSectionType {
  if (typeof value !== 'string') return fallback;
  const v = value.trim() as DecisionSectionType;
  return DECISION_SECTION_TYPES.includes(v) ? v : fallback;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(lower)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(lower)) return false;
  }
  return fallback;
}

function normalizeNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = Number(value.replace(/,/g, '').trim());
    if (Number.isFinite(normalized)) return normalized;
  }
  return fallback;
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseDecisionSupportPackage(raw: unknown): StructuredDecisionSupport {
  const input = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  const criteriaRaw = Array.isArray(input.criteria) ? input.criteria : [];
  const doseRaw = Array.isArray(input.doseLevels)
    ? input.doseLevels
    : (Array.isArray(input.dose_levels) ? input.dose_levels : []);
  const toxicityRaw = Array.isArray(input.toxicityActions)
    ? input.toxicityActions
    : (Array.isArray(input.toxicity_actions) ? input.toxicity_actions : []);

  const criteria = criteriaRaw
    .map((row) => (row && typeof row === 'object') ? row as Record<string, unknown> : null)
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .map((row) => ({
      metric_key: toText(row.metric_key ?? row.metricKey),
      comparator: toText(row.comparator) || '>=',
      threshold_value: normalizeNumber(row.threshold_value ?? row.thresholdValue, Number.NaN),
      threshold_unit: toText(row.threshold_unit ?? row.thresholdUnit) || null,
      criterion_text: toText(row.criterion_text ?? row.criterionText),
      is_required: normalizeBoolean(row.is_required ?? row.isRequired, true),
      section_type: normalizeDecisionSectionType(row.section_type ?? row.sectionType, 'start_criteria'),
      source_section: toText(row.source_section ?? row.sourceSection) || null,
    }))
    .filter((row) => row.metric_key && Number.isFinite(row.threshold_value) && row.criterion_text);

  const doseLevels = doseRaw
    .map((row) => (row && typeof row === 'object') ? row as Record<string, unknown> : null)
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .map((row) => ({
      drug_name: toText(row.drug_name ?? row.drugName),
      level_index: Math.max(0, Math.trunc(normalizeNumber(row.level_index ?? row.levelIndex, 0))),
      level_label: toText(row.level_label ?? row.levelLabel) || '通常量',
      dose_text: toText(row.dose_text ?? row.doseText),
      dose_unit: toText(row.dose_unit ?? row.doseUnit) || null,
      per_basis: toText(row.per_basis ?? row.perBasis) || null,
      is_discontinue: normalizeBoolean(row.is_discontinue ?? row.isDiscontinue, false),
      section_type: normalizeDecisionSectionType(row.section_type ?? row.sectionType, 'dose_level'),
      source_section: toText(row.source_section ?? row.sourceSection) || null,
    }))
    .filter((row) => row.drug_name && row.dose_text);

  const toxicityActions = toxicityRaw
    .map((row) => (row && typeof row === 'object') ? row as Record<string, unknown> : null)
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .map((row) => ({
      toxicity_name: toText(row.toxicity_name ?? row.toxicityName) || 'その他',
      condition_text: toText(row.condition_text ?? row.conditionText) || '-',
      action_text: toText(row.action_text ?? row.actionText) || '-',
      level_delta: Math.max(0, Math.trunc(normalizeNumber(row.level_delta ?? row.levelDelta, 0))),
      hold_flag: normalizeBoolean(row.hold_flag ?? row.holdFlag, false),
      discontinue_flag: normalizeBoolean(row.discontinue_flag ?? row.discontinueFlag, false),
      priority: Math.trunc(normalizeNumber(row.priority, 100)),
      section_type: normalizeDecisionSectionType(row.section_type ?? row.sectionType, 'adverse_event'),
      source_section: toText(row.source_section ?? row.sourceSection) || null,
    }))
    .filter((row) => row.toxicity_name && row.action_text);

  return { criteria, doseLevels, toxicityActions };
}

async function upsertDecisionSupportBySource(
  client: any,
  source: DecisionSupportSourceMeta,
  parsed: StructuredDecisionSupport,
) {
  await client.query(`DELETE FROM regimen_decision_criteria WHERE source_id = $1`, [source.sourceId]);
  await client.query(`DELETE FROM regimen_decision_dose_levels WHERE source_id = $1`, [source.sourceId]);
  await client.query(`DELETE FROM regimen_decision_toxicity_actions WHERE source_id = $1`, [source.sourceId]);

  let criteriaCount = 0;
  let doseLevelCount = 0;
  let toxicityCount = 0;

  for (let i = 0; i < parsed.criteria.length; i += 1) {
    const row = parsed.criteria[i];
    await client.query(
      `INSERT INTO regimen_decision_criteria
         (source_id, regimen_id, department, regimen_name, regimen_key,
          metric_key, comparator, threshold_value, threshold_unit,
          criterion_text, is_required, section_type, source_section, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        source.sourceId,
        source.regimenId,
        source.department,
        source.regimenName,
        source.regimenKey,
        row.metric_key,
        row.comparator,
        row.threshold_value,
        row.threshold_unit,
        row.criterion_text,
        row.is_required,
        row.section_type ?? 'start_criteria',
        row.source_section ?? null,
        i + 1,
      ]
    );
    criteriaCount += 1;
  }

  for (let i = 0; i < parsed.doseLevels.length; i += 1) {
    const row = parsed.doseLevels[i];
    await client.query(
      `INSERT INTO regimen_decision_dose_levels
         (source_id, regimen_id, department, regimen_name, regimen_key,
          drug_name, level_index, level_label, dose_text, dose_unit,
          per_basis, is_discontinue, section_type, source_section, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        source.sourceId,
        source.regimenId,
        source.department,
        source.regimenName,
        source.regimenKey,
        row.drug_name,
        row.level_index,
        row.level_label,
        row.dose_text,
        row.dose_unit,
        row.per_basis,
        row.is_discontinue,
        row.section_type ?? 'dose_level',
        row.source_section ?? null,
        i + 1,
      ]
    );
    doseLevelCount += 1;
  }

  for (let i = 0; i < parsed.toxicityActions.length; i += 1) {
    const row = parsed.toxicityActions[i];
    await client.query(
      `INSERT INTO regimen_decision_toxicity_actions
         (source_id, regimen_id, department, regimen_name, regimen_key,
          toxicity_name, condition_text, action_text, level_delta,
          hold_flag, discontinue_flag, priority, section_type, source_section, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        source.sourceId,
        source.regimenId,
        source.department,
        source.regimenName,
        source.regimenKey,
        row.toxicity_name,
        row.condition_text,
        row.action_text,
        row.level_delta,
        row.hold_flag,
        row.discontinue_flag,
        row.priority,
        row.section_type ?? 'adverse_event',
        row.source_section ?? null,
        i + 1,
      ]
    );
    toxicityCount += 1;
  }

  return {
    criteria: criteriaCount,
    doseLevels: doseLevelCount,
    toxicityActions: toxicityCount,
  };
}

async function ensureDecisionSupportTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS regimen_decision_criteria (
      id SERIAL PRIMARY KEY,
      source_id INTEGER REFERENCES regimen_guideline_sources(id) ON DELETE CASCADE,
      regimen_id INTEGER REFERENCES regimen_master(id) ON DELETE SET NULL,
      department TEXT,
      regimen_name TEXT NOT NULL,
      regimen_key TEXT NOT NULL,
      metric_key VARCHAR(40) NOT NULL,
      comparator VARCHAR(8) NOT NULL,
      threshold_value NUMERIC(12,4) NOT NULL,
      threshold_unit VARCHAR(40),
      criterion_text TEXT NOT NULL,
      is_required BOOLEAN NOT NULL DEFAULT TRUE,
      section_type VARCHAR(40) NOT NULL DEFAULT 'start_criteria',
      source_section TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS regimen_decision_dose_levels (
      id SERIAL PRIMARY KEY,
      source_id INTEGER REFERENCES regimen_guideline_sources(id) ON DELETE CASCADE,
      regimen_id INTEGER REFERENCES regimen_master(id) ON DELETE SET NULL,
      department TEXT,
      regimen_name TEXT NOT NULL,
      regimen_key TEXT NOT NULL,
      drug_name TEXT NOT NULL,
      level_index INTEGER NOT NULL DEFAULT 0,
      level_label TEXT NOT NULL,
      dose_text TEXT NOT NULL,
      dose_unit VARCHAR(40),
      per_basis VARCHAR(40),
      is_discontinue BOOLEAN NOT NULL DEFAULT FALSE,
      section_type VARCHAR(40) NOT NULL DEFAULT 'dose_level',
      source_section TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS regimen_decision_toxicity_actions (
      id SERIAL PRIMARY KEY,
      source_id INTEGER REFERENCES regimen_guideline_sources(id) ON DELETE CASCADE,
      regimen_id INTEGER REFERENCES regimen_master(id) ON DELETE SET NULL,
      department TEXT,
      regimen_name TEXT NOT NULL,
      regimen_key TEXT NOT NULL,
      toxicity_name TEXT NOT NULL,
      condition_text TEXT NOT NULL,
      action_text TEXT NOT NULL,
      level_delta INTEGER NOT NULL DEFAULT 0,
      hold_flag BOOLEAN NOT NULL DEFAULT FALSE,
      discontinue_flag BOOLEAN NOT NULL DEFAULT FALSE,
      priority INTEGER NOT NULL DEFAULT 100,
      section_type VARCHAR(40) NOT NULL DEFAULT 'adverse_event',
      source_section TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE regimen_decision_criteria ADD COLUMN IF NOT EXISTS section_type VARCHAR(40) NOT NULL DEFAULT 'start_criteria'`);
  await pool.query(`ALTER TABLE regimen_decision_criteria ADD COLUMN IF NOT EXISTS source_section TEXT`);
  await pool.query(`ALTER TABLE regimen_decision_dose_levels ADD COLUMN IF NOT EXISTS section_type VARCHAR(40) NOT NULL DEFAULT 'dose_level'`);
  await pool.query(`ALTER TABLE regimen_decision_dose_levels ADD COLUMN IF NOT EXISTS source_section TEXT`);
  await pool.query(`ALTER TABLE regimen_decision_toxicity_actions ADD COLUMN IF NOT EXISTS section_type VARCHAR(40) NOT NULL DEFAULT 'adverse_event'`);
  await pool.query(`ALTER TABLE regimen_decision_toxicity_actions ADD COLUMN IF NOT EXISTS source_section TEXT`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_regimen_decision_criteria_source_id ON regimen_decision_criteria (source_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_regimen_decision_criteria_regimen_key ON regimen_decision_criteria (regimen_key)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_regimen_decision_dose_levels_source_id ON regimen_decision_dose_levels (source_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_regimen_decision_dose_levels_regimen_key ON regimen_decision_dose_levels (regimen_key)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_regimen_decision_toxicity_actions_source_id ON regimen_decision_toxicity_actions (source_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_regimen_decision_toxicity_actions_regimen_key ON regimen_decision_toxicity_actions (regimen_key)`);
}

async function loadDecisionSupportRows(params: {
  sourceId?: number | null;
  regimenKey?: string | null;
  department?: string | null;
}) {
  await ensureDecisionSupportTables();
  let targetSourceId = params.sourceId && params.sourceId > 0 ? params.sourceId : null;
  const regimenKey = (params.regimenKey || '').trim();
  const department = (params.department || '').trim();

  if (!targetSourceId && regimenKey) {
    const { rows } = await pool.query<{ id: number }>(
      `SELECT id
       FROM regimen_guideline_sources
       WHERE regimen_key = $1
         AND ($2 = '' OR COALESCE(department, '') = $2)
       ORDER BY imported_at DESC, id DESC
       LIMIT 1`,
      [regimenKey, department]
    );
    targetSourceId = rows[0]?.id ?? null;
  }

  const where = targetSourceId
    ? { clause: `source_id = $1`, args: [targetSourceId] as Array<string | number> }
    : {
      clause: `regimen_key = $1 AND ($2 = '' OR COALESCE(department, '') = $2)`,
      args: [regimenKey, department] as Array<string | number>,
    };

  const [criteriaResult, doseLevelResult, toxicityActionResult] = await Promise.all([
    pool.query<DecisionCriterionRow>(
      `SELECT id, source_id, regimen_id, department, regimen_name, regimen_key,
              metric_key, comparator, threshold_value, threshold_unit,
              criterion_text, is_required, section_type, source_section, sort_order
       FROM regimen_decision_criteria
       WHERE ${where.clause}
       ORDER BY sort_order, id`,
      where.args
    ),
    pool.query<DecisionDoseLevelRow>(
      `SELECT id, source_id, regimen_id, department, regimen_name, regimen_key,
              drug_name, level_index, level_label, dose_text, dose_unit, per_basis,
              is_discontinue, section_type, source_section, sort_order
       FROM regimen_decision_dose_levels
       WHERE ${where.clause}
       ORDER BY sort_order, id`,
      where.args
    ),
    pool.query<DecisionToxicityActionRow>(
      `SELECT id, source_id, regimen_id, department, regimen_name, regimen_key,
              toxicity_name, condition_text, action_text, level_delta,
              hold_flag, discontinue_flag, priority, section_type, source_section, sort_order
       FROM regimen_decision_toxicity_actions
       WHERE ${where.clause}
       ORDER BY priority, sort_order, id`,
      where.args
    ),
  ]);

  return {
    sourceId: targetSourceId,
    criteria: criteriaResult.rows.map((row) => ({
      ...row,
      threshold_value: Number(row.threshold_value),
      section_type: row.section_type || 'start_criteria',
    })),
    doseLevels: doseLevelResult.rows.map((row) => ({
      ...row,
      section_type: row.section_type || 'dose_level',
    })),
    toxicityActions: toxicityActionResult.rows.map((row) => ({
      ...row,
      section_type: row.section_type || 'adverse_event',
    })),
  };
}

// 笏笏 GET /api/regimen-check/patients 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
router.get('/patients', async (_req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT p.id, p.patient_no, p.name, p.furigana, p.department, p.doctor,
         p.dob, p.gender,
         (SELECT r.name FROM scheduled_treatments st
          JOIN regimens r ON r.id = st.regimen_id
          WHERE st.patient_id = p.id
          ORDER BY st.scheduled_date DESC LIMIT 1) AS latest_regimen,
         (SELECT COUNT(*)
          FROM regimen_calendar rc2
          WHERE rc2.patient_id = p.id
            AND rc2.audit_status = 'doubt') AS doubt_count,
         (SELECT COUNT(*)
          FROM scheduled_treatments st2
          LEFT JOIN regimen_calendar rc3
            ON rc3.patient_id = st2.patient_id
           AND rc3.regimen_id = st2.regimen_id
           AND rc3.treatment_date = st2.scheduled_date
          WHERE st2.patient_id = p.id
            AND st2.scheduled_date <= CURRENT_DATE
            AND COALESCE(rc3.audit_status, '') NOT IN ('audited', 'doubt')
         ) AS unaudited_count
       FROM patients p
       ORDER BY doubt_count DESC, unaudited_count DESC, p.patient_no`
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /patients error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/guideline-sources', async (_req: AuthRequest, res: Response) => {
  try {
    await ensureGuidelineTables();
    const { rows } = await pool.query(
      `SELECT id,
              department,
              regimen_name,
              regimen_key,
              source_file,
              source_title,
              imported_at::text AS imported_at
       FROM regimen_guideline_sources
       ORDER BY imported_at DESC, id DESC`
    );
    res.json(rows);
  } catch (e: any) {
    if (e?.code === '42P01') {
      res.json([]);
      return;
    }
    console.error('GET /guideline-sources error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/guideline-sources/import-file', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    await ensureGuidelineTables();
    const filePath = String(req.body?.filePath ?? '').trim();
    const department = String(req.body?.department ?? '').trim() || null;
    const overrideRegimenName = String(req.body?.regimenName ?? '').trim();
    if (!filePath) {
      res.status(400).json({ error: 'filePath is required' });
      return;
    }
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'file not found' });
      return;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const titleFromHtml = raw.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.trim() ?? '';
    const titleFromMd = raw.match(/^\s*title:\s*"([^"]+)"/m)?.[1]?.trim() ?? '';
    const sourceTitle = titleFromHtml || titleFromMd || path.basename(filePath);
    const regimenName =
      overrideRegimenName
      || sourceTitle.split('|')[0]?.trim()
      || path.basename(filePath, path.extname(filePath));
    const regimenKey = normalizeRegimenKey(regimenName);

    const { rows } = await pool.query(
      `INSERT INTO regimen_guideline_sources
         (regimen_id, department, regimen_name, regimen_key, source_file, source_title, markdown_content, imported_at)
       VALUES (NULL, $1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (regimen_key, source_file) DO UPDATE SET
         department = EXCLUDED.department,
         regimen_name = EXCLUDED.regimen_name,
         source_title = EXCLUDED.source_title,
         markdown_content = EXCLUDED.markdown_content,
         imported_at = NOW()
       RETURNING id, department, regimen_name, regimen_key, source_file, source_title, imported_at::text AS imported_at`,
      [department, regimenName, regimenKey, filePath, sourceTitle, raw]
    );

    await pool.query(`DELETE FROM regimen_guideline_rules WHERE source_file = $1`, [filePath]);
    res.json({ imported: rows[0], sourceOnly: true });
  } catch (e) {
    console.error('POST /guideline-sources/import-file error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/guideline-sources/import-text', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    await ensureGuidelineTables();
    const regimenName = String(req.body?.regimenName ?? '').trim();
    const department = String(req.body?.department ?? '').trim() || null;
    const sourceName = String(req.body?.sourceName ?? '').trim();
    const content = String(req.body?.content ?? '');
    if (!regimenName || !content.trim()) {
      res.status(400).json({ error: 'regimenName and content are required' });
      return;
    }
    const regimenKey = normalizeRegimenKey(regimenName);
    const sourceFile = `manual:${sourceName || regimenName}:${Date.now()}.txt`;
    const { rows } = await pool.query(
      `INSERT INTO regimen_guideline_sources
         (regimen_id, department, regimen_name, regimen_key, source_file, source_title, markdown_content, imported_at)
       VALUES (NULL, $1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (regimen_key, source_file) DO UPDATE SET
         department = EXCLUDED.department,
         regimen_name = EXCLUDED.regimen_name,
         source_title = EXCLUDED.source_title,
         markdown_content = EXCLUDED.markdown_content,
         imported_at = NOW()
       RETURNING id, department, regimen_name, regimen_key, source_file, source_title, imported_at::text AS imported_at`,
      [department, regimenName, regimenKey, sourceFile, sourceName || regimenName, content]
    );

    await pool.query(`DELETE FROM regimen_guideline_rules WHERE source_file = $1`, [sourceFile]);
    res.json({ imported: rows[0], sourceOnly: true });
  } catch (e) {
    console.error('POST /guideline-sources/import-text error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/guideline-sources/:id', async (req: AuthRequest, res: Response) => {
  try {
    await ensureGuidelineTables();
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const { rows } = await pool.query<GuidelineSourceRow>(
      `SELECT id,
              department,
              regimen_name,
              regimen_key,
              source_file,
              source_title,
              markdown_content,
              imported_at::text AS imported_at
       FROM regimen_guideline_sources
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    if (!rows.length) {
      res.status(404).json({ error: 'source not found' });
      return;
    }
    res.json(rows[0]);
  } catch (e) {
    console.error('GET /guideline-sources/:id error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/guideline-sources/:id', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    await ensureGuidelineTables();
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }

    const { rows: currentRows } = await pool.query<GuidelineSourceRow>(
      `SELECT id, department, regimen_name, regimen_key, source_file, source_title, markdown_content, imported_at::text AS imported_at
       FROM regimen_guideline_sources
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    if (!currentRows.length) {
      res.status(404).json({ error: 'source not found' });
      return;
    }
    const current = currentRows[0];

    const nextDepartment = req.body?.department == null
      ? (current.department ?? null)
      : String(req.body?.department).trim() || null;
    const nextRegimenName = String(req.body?.regimenName ?? current.regimen_name).trim() || current.regimen_name;
    const nextRegimenKey = normalizeRegimenKey(nextRegimenName);
    const nextSourceTitle = req.body?.sourceTitle == null
      ? (current.source_title ?? null)
      : String(req.body?.sourceTitle).trim() || null;
    const nextMarkdownContent = req.body?.markdownContent == null
      ? current.markdown_content
      : String(req.body?.markdownContent);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // If same (source_file, regimen_key) row already exists, merge into it to avoid unique conflicts.
      let targetId = id;
      if (current.source_file) {
        const { rows: conflictRows } = await client.query<{ id: number }>(
          `SELECT id
             FROM regimen_guideline_sources
            WHERE source_file = $1
              AND regimen_key = $2
              AND id <> $3
            LIMIT 1`,
          [current.source_file, nextRegimenKey, id]
        );
        const conflictId = conflictRows[0]?.id ?? null;
        if (conflictId) {
          await client.query(
            `UPDATE regimen_guideline_sources
                SET department = $1,
                    regimen_name = $2,
                    regimen_key = $3,
                    source_title = $4,
                    markdown_content = $5,
                    imported_at = NOW()
              WHERE id = $6`,
            [nextDepartment, nextRegimenName, nextRegimenKey, nextSourceTitle, nextMarkdownContent, conflictId]
          );
          await client.query(`DELETE FROM regimen_guideline_sources WHERE id = $1`, [id]);
          targetId = conflictId;
        }
      }

      if (targetId === id) {
        await client.query(
          `UPDATE regimen_guideline_sources
             SET department = $1,
                 regimen_name = $2,
                 regimen_key = $3,
                 source_title = $4,
                 markdown_content = $5,
                 imported_at = NOW()
           WHERE id = $6`,
          [nextDepartment, nextRegimenName, nextRegimenKey, nextSourceTitle, nextMarkdownContent, id]
        );
      }

      if (current.source_file) {
        await client.query(
          `UPDATE regimen_guideline_rules
           SET regimen_name = $1,
               regimen_key = $2
           WHERE source_file = $3`,
          [nextRegimenName, nextRegimenKey, current.source_file]
        );
      }

      const { rows } = await client.query<GuidelineSourceRow>(
        `SELECT id,
                department,
                regimen_name,
                regimen_key,
                source_file,
                source_title,
                markdown_content,
                imported_at::text AS imported_at
           FROM regimen_guideline_sources
          WHERE id = $1
          LIMIT 1`,
        [targetId]
      );
      await client.query('COMMIT');
      res.json(rows[0]);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('PATCH /guideline-sources/:id error:', e);
    if ((e as any)?.code === '23505') {
      res.status(409).json({ error: '同じソースファイル・レジメンが既に存在します' });
      return;
    }
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/guideline-sources/:id', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    await ensureGuidelineTables();
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const { rows } = await pool.query<{ source_file: string | null }>(
      `DELETE FROM regimen_guideline_sources
       WHERE id = $1
       RETURNING source_file`,
      [id]
    );
    if (!rows.length) {
      res.status(404).json({ error: 'source not found' });
      return;
    }
    const sourceFile = rows[0].source_file;
    if (sourceFile) {
      await pool.query(`DELETE FROM regimen_guideline_rules WHERE source_file = $1`, [sourceFile]);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /guideline-sources/:id error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/guideline-sources/clear', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const client = await pool.connect();
  try {
    await ensureGuidelineTables();
    await ensureDecisionSupportTables();
    await client.query('BEGIN');
    const deletedCriteria = await client.query(`DELETE FROM regimen_decision_criteria`);
    const deletedDoseLevels = await client.query(`DELETE FROM regimen_decision_dose_levels`);
    const deletedToxicityActions = await client.query(`DELETE FROM regimen_decision_toxicity_actions`);
    const deletedRules = await client.query(`DELETE FROM regimen_guideline_rules`);
    const deletedSources = await client.query(`DELETE FROM regimen_guideline_sources`);
    await client.query('COMMIT');
    res.json({
      ok: true,
      deleted: {
        decision_criteria: deletedCriteria.rowCount ?? 0,
        decision_dose_levels: deletedDoseLevels.rowCount ?? 0,
        decision_toxicity_actions: deletedToxicityActions.rowCount ?? 0,
        guideline_sources: deletedSources.rowCount ?? 0,
        guideline_rules: deletedRules.rowCount ?? 0,
      },
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('POST /guideline-sources/clear error:', e);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// 笏笏 GET /api/regimen-check/:patientId/detail 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
router.post('/decision-support/import-package', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;

  try {
    await ensureGuidelineTables();
    await ensureDecisionSupportTables();

    const payload = req.body;
    const rawRecords = Array.isArray(payload)
      ? payload
      : (Array.isArray(payload?.records) ? payload.records : []);

    if (!rawRecords.length) {
      res.status(400).json({ error: 'records is required' });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let importedSources = 0;
      let importedCriteria = 0;
      let importedDoseLevels = 0;
      let importedToxicityActions = 0;
      const skipped: Array<{ index: number; reason: string }> = [];

      for (let i = 0; i < rawRecords.length; i += 1) {
        const record = rawRecords[i];
        if (!record || typeof record !== 'object') {
          skipped.push({ index: i, reason: 'invalid record' });
          continue;
        }
        const row = record as Record<string, unknown>;

        const regimenName = toText(row.regimenName ?? row.regimen_name);
        if (!regimenName) {
          skipped.push({ index: i, reason: 'regimenName is required' });
          continue;
        }
        const regimenKey = normalizeRegimenKey(regimenName);
        const department = toText(row.department) || null;
        const sourceTitle = toText(row.sourceTitle ?? row.source_title) || regimenName;
        const externalId = toText(row.externalId ?? row.external_id);
        const sourceFile = toText(row.sourceFile ?? row.source_file)
          || `external-json:${externalId || regimenKey}:${i + 1}`;
        const markdownContent = String(row.markdownContent ?? row.markdown_content ?? '').trim();

        const { rows: sourceRows } = await client.query<{
          id: number;
          regimen_id: number | null;
          department: string | null;
          regimen_name: string;
          regimen_key: string;
        }>(
          `INSERT INTO regimen_guideline_sources
             (regimen_id, department, regimen_name, regimen_key, source_file, source_title, markdown_content, imported_at)
           VALUES (NULL, $1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (regimen_key, source_file) DO UPDATE SET
             department = EXCLUDED.department,
             regimen_name = EXCLUDED.regimen_name,
             source_title = EXCLUDED.source_title,
             markdown_content = EXCLUDED.markdown_content,
             imported_at = NOW()
           RETURNING id, regimen_id, department, regimen_name, regimen_key`,
          [
            department,
            regimenName,
            regimenKey,
            sourceFile,
            sourceTitle,
            markdownContent || `# ${regimenName}\n`,
          ]
        );
        const source = sourceRows[0];

        let parsed = parseDecisionSupportPackage(row.decisionSupport ?? row.decision_support);
        if (
          parsed.criteria.length === 0
          && parsed.doseLevels.length === 0
          && parsed.toxicityActions.length === 0
          && markdownContent
        ) {
          parsed = parseStructuredDecisionSupport(markdownContent);
        }

        const counts = await upsertDecisionSupportBySource(
          client,
          {
            sourceId: source.id,
            regimenId: source.regimen_id ?? null,
            department: source.department ?? null,
            regimenName: source.regimen_name,
            regimenKey: source.regimen_key,
          },
          parsed,
        );

        importedSources += 1;
        importedCriteria += counts.criteria;
        importedDoseLevels += counts.doseLevels;
        importedToxicityActions += counts.toxicityActions;
      }

      await client.query('COMMIT');
      res.json({
        ok: true,
        importedSources,
        importedCriteria,
        importedDoseLevels,
        importedToxicityActions,
        skipped,
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('POST /decision-support/import-package error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/decision-support/import-from-source/:sourceId', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const sourceId = Number(req.params.sourceId);
  if (!Number.isFinite(sourceId) || sourceId <= 0) {
    res.status(400).json({ error: 'invalid sourceId' });
    return;
  }

  try {
    await ensureGuidelineTables();
    await ensureDecisionSupportTables();

    const { rows: sourceRows } = await pool.query<GuidelineSourceRow & { regimen_id?: number | null }>(
      `SELECT id, regimen_id, department, regimen_name, regimen_key, source_file, source_title, markdown_content, imported_at::text AS imported_at
       FROM regimen_guideline_sources
       WHERE id = $1
       LIMIT 1`,
      [sourceId]
    );
    if (!sourceRows.length) {
      res.status(404).json({ error: 'source not found' });
      return;
    }
    const source = sourceRows[0];
    const parsed = parseStructuredDecisionSupport(source.markdown_content || '');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const counts = await upsertDecisionSupportBySource(
        client,
        {
          sourceId,
          regimenId: source.regimen_id ?? null,
          department: source.department ?? null,
          regimenName: source.regimen_name,
          regimenKey: source.regimen_key,
        },
        parsed,
      );

      await client.query('COMMIT');
      res.json({
        ok: true,
        sourceId,
        counts,
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('POST /decision-support/import-from-source/:sourceId error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/decision-support/source/:sourceId', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const sourceId = Number(req.params.sourceId);
  if (!Number.isFinite(sourceId) || sourceId <= 0) {
    res.status(400).json({ error: 'invalid sourceId' });
    return;
  }

  try {
    await ensureGuidelineTables();
    await ensureDecisionSupportTables();

    const { rows: sourceRows } = await pool.query<GuidelineSourceRow & { regimen_id?: number | null }>(
      `SELECT id, regimen_id, department, regimen_name, regimen_key, source_file, source_title, markdown_content, imported_at::text AS imported_at
       FROM regimen_guideline_sources
       WHERE id = $1
       LIMIT 1`,
      [sourceId]
    );
    if (!sourceRows.length) {
      res.status(404).json({ error: 'source not found' });
      return;
    }
    const source = sourceRows[0];
    const parsed = parseDecisionSupportPackage(req.body);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const counts = await upsertDecisionSupportBySource(
        client,
        {
          sourceId,
          regimenId: source.regimen_id ?? null,
          department: source.department ?? null,
          regimenName: source.regimen_name,
          regimenKey: source.regimen_key,
        },
        parsed,
      );
      await client.query('COMMIT');
      res.json({ ok: true, sourceId, counts });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('PUT /decision-support/source/:sourceId error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/decision-support/:regimenKey', async (req: AuthRequest, res: Response) => {
  try {
    const regimenKey = normalizeRegimenKey(String(req.params.regimenKey || '').trim());
    const sourceId = Number(req.query.sourceId);
    const requestedSourceId = Number.isFinite(sourceId) && sourceId > 0 ? sourceId : null;
    const department = String(req.query.department ?? '').trim();
    if (!regimenKey && !requestedSourceId) {
      res.status(400).json({ error: 'regimenKey or sourceId is required' });
      return;
    }

    const rows = await loadDecisionSupportRows({
      sourceId: requestedSourceId,
      regimenKey,
      department,
    });
    res.json({
      sourceId: rows.sourceId,
      criteria: rows.criteria,
      doseLevels: rows.doseLevels,
      toxicityActions: rows.toxicityActions,
    });
  } catch (e) {
    console.error('GET /decision-support/:regimenKey error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:patientId/detail', async (req: AuthRequest, res: Response) => {
  try {
    const patientId = Number(req.params.patientId);
    const requestedSourceId = Number(req.query.guidelineSourceId);
    const hasRequestedSource = Number.isFinite(requestedSourceId) && requestedSourceId > 0;
    const requestedDepartment = String(req.query.guidelineDepartment ?? '').trim();
    const requestedRegimenName = String(req.query.guidelineRegimen ?? '').trim();
    const requestedRegimenKey = requestedRegimenName ? normalizeRegimenKey(requestedRegimenName) : '';

    const { rows: patRows } = await pool.query(
      `SELECT id, patient_no, name, furigana, department, doctor, diagnosis, dob, gender, patient_comment
       FROM patients WHERE id = $1`,
      [patientId]
    );
    if (!patRows.length) { res.status(404).json({ error: 'Patient not found' }); return; }
    const patient = patRows[0];

    const { rows: vitals } = await pool.query(
      `SELECT measured_date, height_cm, weight_kg
       FROM patient_vitals
       WHERE patient_id = $1
         AND measured_date >= CURRENT_DATE - INTERVAL '13 months'
       ORDER BY measured_date`,
      [patientId]
    );

    const vitalsWithBSA = vitals.map((v: any) => ({
      ...v,
      bsa: (v.height_cm && v.weight_kg)
        ? Math.round(calcBSA(Number(v.height_cm), Number(v.weight_kg)) * 100) / 100
        : null,
    }));

    const latestVital = vitals[vitals.length - 1] || null;

    const { rows: labs } = await pool.query(
      `SELECT lab_date, wbc, anc, plt, hgb, mono, cre, egfr, ast, alt, tbil, crp
       FROM patient_lab_history
       WHERE patient_id = $1
         AND lab_date >= CURRENT_DATE - INTERVAL '13 months'
       ORDER BY lab_date`,
      [patientId]
    );

    const { rows: medHistory } = await pool.query(
      `SELECT id, condition_name, onset_date, end_date, notes
       FROM patient_medical_history
       WHERE patient_id = $1
       ORDER BY onset_date NULLS LAST`,
      [patientId]
    );

    // 譛ｬ譌･縺ｮ繧ｪ繝ｼ繝繝ｼ
    const { rows: todayOrders } = await pool.query(
      `SELECT po.id, po.patient_id, po.order_date, po.drug_name,
         po.dose, po.dose_unit, po.route, po.is_antineoplastic,
         po.bag_no, po.solvent_name, po.solvent_vol_ml, po.bag_order,
         po.rp_no, po.route_label, po.order_no,
         po.regimen_name
       FROM patient_orders po
       WHERE po.patient_id = $1
         AND po.order_date = CURRENT_DATE
       ORDER BY
         COALESCE(po.rp_no, po.bag_no + 1, 999) ASC,
         po.bag_order ASC,
         po.is_antineoplastic DESC,
         po.drug_name`,
      [patientId]
    );

    // 蟆・擂繧ｪ繝ｼ繝繝ｼ
    const { rows: futureOrderDates } = await pool.query(
      `SELECT DISTINCT order_date FROM patient_orders
       WHERE patient_id = $1 AND order_date > CURRENT_DATE
       ORDER BY order_date LIMIT 1`,
      [patientId]
    );
    let futureOrders: any[] = [];
    if (futureOrderDates.length > 0) {
      const futureDate = futureOrderDates[0].order_date;
      const { rows } = await pool.query(
        `SELECT id, patient_id, order_date, drug_name, dose, dose_unit, route, is_antineoplastic,
           bag_no, solvent_name, solvent_vol_ml, bag_order,
           rp_no, route_label, order_no, regimen_name
         FROM patient_orders
         WHERE patient_id = $1 AND order_date = $2
         ORDER BY
           COALESCE(rp_no, bag_no + 1, 999) ASC,
           bag_order ASC,
           is_antineoplastic DESC,
           drug_name`,
        [patientId, futureDate]
      );
      futureOrders = rows;
    }

    // 豐ｻ逋よｭｴ・亥・莉ｶ・・ 譁ｰ縺励＞鬆・↓蜿門ｾ怜ｾ後∬｡ｨ遉ｺ逕ｨ縺ｫ譏・・↓荳ｦ縺ｹ逶ｴ縺・
    const { rows: treatmentHistory } = await pool.query(
      `SELECT * FROM (
         SELECT st.id, st.scheduled_date, st.status, r.name AS regimen_name,
           st.regimen_id,
           rc.id AS calendar_id,
           rc.cycle_no,
           rc.audit_status,
           rc.auditor_name,
           rc.audited_at,
           rc.status AS calendar_status,
            COALESCE(
              (SELECT STRING_AGG(
                 po.drug_name || CASE WHEN po.dose IS NOT NULL
                   THEN ' ' || po.dose::text || COALESCE(po.dose_unit, '') ELSE '' END,
                 E'\n' ORDER BY po.drug_name)
               FROM patient_orders po
               WHERE po.patient_id = st.patient_id
                 AND po.order_date = st.scheduled_date
                 AND po.is_antineoplastic = true),
              ''
            ) AS antineoplastic_drugs,
           COALESCE(
             (SELECT STRING_AGG(
                po.drug_name || CASE WHEN po.dose IS NOT NULL
                  THEN ' ' || po.dose::text || COALESCE(po.dose_unit, '') ELSE '' END,
                ' / ' ORDER BY po.drug_name)
              FROM patient_orders po
               WHERE po.patient_id = st.patient_id
                 AND po.order_date = st.scheduled_date
                 AND po.is_antineoplastic = false),
              ''
            ) AS support_drugs,
            COALESCE(
              (
                SELECT STRING_AGG(
                  CASE
                    WHEN rd.status = 'resolved'
                      THEN '解決: ' || COALESCE(NULLIF(rd.resolution, ''), rd.content)
                    ELSE '未解決: ' || rd.content
                  END,
                  E'\n' ORDER BY rd.created_at DESC
                )
                FROM regimen_doubts rd
                WHERE rd.patient_id = st.patient_id
                  AND rd.regimen_id = st.regimen_id
                  AND rd.treatment_date = st.scheduled_date
              ),
              ''
            ) AS doubt_summary,
            EXISTS (
              SELECT 1
              FROM regimen_doubts rd
              WHERE rd.patient_id = st.patient_id
                AND rd.regimen_id = st.regimen_id
                AND rd.treatment_date = st.scheduled_date
                AND rd.status = 'open'
            ) AS has_open_doubt
          FROM scheduled_treatments st
          JOIN regimens r ON r.id = st.regimen_id
          LEFT JOIN regimen_calendar rc ON rc.patient_id = st.patient_id
            AND rc.regimen_id = st.regimen_id
            AND rc.treatment_date = st.scheduled_date
          WHERE st.patient_id = $1
            AND st.scheduled_date <= CURRENT_DATE
          ORDER BY st.scheduled_date DESC
        ) sub
       ORDER BY scheduled_date ASC`,
      [patientId]
    );

    const { rows: futureSchedule } = await pool.query(
      `SELECT DISTINCT order_date,
         (SELECT STRING_AGG(drug_name || CASE WHEN dose IS NOT NULL
            THEN ' ' || dose::text || COALESCE(dose_unit,'') ELSE '' END, ' / ' ORDER BY drug_name)
          FROM patient_orders po2
          WHERE po2.patient_id = po.patient_id AND po2.order_date = po.order_date AND po2.is_antineoplastic=true
         ) AS antineoplastic_drugs
       FROM patient_orders po
       WHERE patient_id = $1 AND order_date > CURRENT_DATE
       ORDER BY order_date
       LIMIT 5`,
      [patientId]
    );

    const { rows: audits } = await pool.query(
      `SELECT id, audit_date, pharmacist_name, comment, handover_note, created_at
       FROM regimen_audits
       WHERE patient_id = $1
       ORDER BY audit_date DESC, created_at DESC
       LIMIT 20`,
      [patientId]
    );

    const { rows: doubts } = await pool.query(
      `SELECT rd.id, rd.doubt_date, rd.content, rd.status, rd.resolution,
              rd.pharmacist_name, rd.resolved_at, rd.created_at,
              rd.regimen_id, rd.treatment_date, r.name AS regimen_name
       FROM regimen_doubts rd
       LEFT JOIN regimens r ON r.id = rd.regimen_id
       WHERE rd.patient_id = $1
       ORDER BY
         CASE WHEN rd.status = 'open' THEN 0 ELSE 1 END,
         COALESCE(rd.treatment_date, rd.doubt_date) DESC,
         rd.created_at DESC`,
      [patientId]
    );

    // 諢滓沒逞・､懈渊・・est_name 縺斐→縺ｫ譛譁ｰ縺ｮ1莉ｶ・・
    const { rows: infectionLabs } = await pool.query(
      `SELECT DISTINCT ON (test_name)
         test_name, result, test_date
       FROM patient_infection_labs
       WHERE patient_id = $1
       ORDER BY test_name, test_date DESC`,
      [patientId]
    );

    const { rows: periodicLabs } = await pool.query(
      `SELECT DISTINCT ON (test_name)
         test_name, result, test_date
       FROM patient_periodic_labs
       WHERE patient_id = $1
       ORDER BY test_name, test_date DESC`,
      [patientId]
    );

    // 謔｣閠・・迴ｾ蝨ｨ縺ｮ繝ｬ繧ｸ繝｡繝ｳ蜷阪↓蟇ｾ蠢懊☆繧区ｸ幃㍼蝓ｺ貅悶Ν繝ｼ繝ｫ
    // regimens.name 縺ｨ regimen_master.regimen_name 繧貞錐蜑阪〒辣ｧ蜷医☆繧・
    const latestRegimenName = treatmentHistory.length
      ? String(treatmentHistory[treatmentHistory.length - 1].regimen_name || '')
      : '';

    const toxicityRules: Array<{
      toxicity_item: string;
      grade1_action: string;
      grade2_action: string;
      grade3_action: string;
      grade4_action: string;
      regimen_name: string;
    }> = [];

    const regimenKey = requestedRegimenKey || (latestRegimenName ? normalizeRegimenKey(latestRegimenName) : '');
    let guidelineRules: GuidelineRuleRow[] = [];
    let guidelineSource: GuidelineSourceRow | null = null;
    let guidelineSources: GuidelineSourceRow[] = [];
    let decisionSourceId: number | null = null;
    let decisionCriteria: Array<{
      id: number;
      source_id: number | null;
      regimen_id: number | null;
      department: string | null;
      regimen_name: string;
      regimen_key: string;
      metric_key: string;
      comparator: string;
      threshold_value: number;
      threshold_unit: string | null;
      criterion_text: string;
      is_required: boolean;
      section_type: string;
      source_section: string | null;
      sort_order: number;
    }> = [];
    let decisionDoseLevels: DecisionDoseLevelRow[] = [];
    let decisionToxicityActions: DecisionToxicityActionRow[] = [];

    const loadRulesByRegimenKey = async (key: string) => {
      if (!key) return [] as GuidelineRuleRow[];
      const { rows } = await pool.query<GuidelineRuleRow>(
        `SELECT id, regimen_name, regimen_key, rule_type, evaluation_mode,
                metric_key, comparator, threshold_value, threshold_unit,
                condition_text, action_text, severity, source_file, source_line,
                is_active
         FROM regimen_guideline_rules
         WHERE regimen_key = $1
           AND is_active = TRUE
         ORDER BY
           CASE severity WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
           id`,
        [key]
      );
      return rows;
    };

    try {
      await ensureGuidelineTables();

      // 一覧は常に返して選択候補に使う（自動選択はしない）
      const { rows: availableRows } = await pool.query<GuidelineSourceRow>(
        `SELECT id, department, regimen_name, regimen_key, source_file, source_title, markdown_content, imported_at::text AS imported_at
         FROM regimen_guideline_sources
         WHERE ($1 = '' OR COALESCE(department, '') = $1)
         ORDER BY imported_at DESC, id DESC`,
        [requestedDepartment]
      );
      guidelineSources = availableRows;

      // 自動紐付け候補: レジメン名（正規化キー）一致のみ
      let matchedSources: GuidelineSourceRow[] = [];
      if (regimenKey) {
        const { rows: exactRows } = await pool.query<GuidelineSourceRow>(
          `SELECT id, department, regimen_name, regimen_key, source_file, source_title, markdown_content, imported_at::text AS imported_at
           FROM regimen_guideline_sources
           WHERE regimen_key = $1
             AND ($2 = '' OR COALESCE(department, '') = $2)
           ORDER BY imported_at DESC, id DESC`,
          [regimenKey, requestedDepartment]
        );
        matchedSources = exactRows;
      }

      if (hasRequestedSource) {
        guidelineSource = guidelineSources.find((row) => row.id === requestedSourceId) ?? null;
        if (!guidelineSource) {
          const { rows } = await pool.query<GuidelineSourceRow>(
            `SELECT id, department, regimen_name, regimen_key, source_file, source_title, markdown_content, imported_at::text AS imported_at
             FROM regimen_guideline_sources
             WHERE id = $1
             LIMIT 1`,
            [requestedSourceId]
          );
          guidelineSource = rows[0] ?? null;
          if (guidelineSource && !guidelineSources.some((row) => row.id === guidelineSource!.id)) {
            guidelineSources = [guidelineSource, ...guidelineSources];
          }
        }
      } else if (requestedRegimenKey) {
        guidelineSource =
          guidelineSources.find((row) => row.regimen_key === requestedRegimenKey) ??
          matchedSources.find((row) => row.regimen_key === requestedRegimenKey) ??
          null;
      } else {
        // 自動選択は一致候補があるときのみ
        guidelineSource = matchedSources[0] ?? null;
      }

      if (guidelineSource && !guidelineSources.some((row) => row.id === guidelineSource!.id)) {
        guidelineSources = [guidelineSource, ...guidelineSources];
      }

      if (guidelineSource) {
        guidelineRules = await loadRulesByRegimenKey(guidelineSource.regimen_key);
      }

      const decisionRows = await loadDecisionSupportRows({
        sourceId: guidelineSource?.id ?? null,
        regimenKey: guidelineSource ? guidelineSource.regimen_key : '',
        department: requestedDepartment || guidelineSource?.department || '',
      });
      decisionSourceId = decisionRows.sourceId;
      decisionCriteria = decisionRows.criteria.map((row) => ({
        id: row.id,
        source_id: row.source_id,
        regimen_id: row.regimen_id,
        department: row.department,
        regimen_name: row.regimen_name,
        regimen_key: row.regimen_key,
        metric_key: row.metric_key,
        comparator: row.comparator,
        threshold_value: Number(row.threshold_value),
        threshold_unit: row.threshold_unit,
        criterion_text: row.criterion_text,
        is_required: row.is_required,
        section_type: row.section_type,
        source_section: row.source_section,
        sort_order: row.sort_order,
      }));
      decisionDoseLevels = decisionRows.doseLevels;
      decisionToxicityActions = decisionRows.toxicityActions;
    } catch (e: any) {
      if (e?.code !== '42P01') throw e; // undefined_table
    }

    const latestLab = labs.length > 0 ? labs[labs.length - 1] : null;
    const guidelineAlerts = evaluateGuidelineAlerts(guidelineRules, latestLab);
    const decisionCriteriaAlerts = evaluateDecisionCriteria(decisionCriteria as any, latestLab);
    const matchedToxicityActions = evaluateToxicityActions(decisionToxicityActions as any, latestLab);
    const recommendedReductionLevel = recommendReductionLevel(matchedToxicityActions as any);
    const recommendedDoseLevels = pickDoseLevelByReduction(decisionDoseLevels as any, recommendedReductionLevel);

    res.json({
      patient: { ...patient, latest_vital: latestVital },
      vitals: vitalsWithBSA,
      labs,
      medHistory,
      todayOrders,
      futureOrders,
      treatmentHistory,
      futureSchedule,
      audits,
      doubts,
      infectionLabs,
      periodicLabs,
      toxicityRules,
      guidelineRules,
      guidelineAlerts,
      guidelineSource,
      decisionSupport: {
        source_id: decisionSourceId,
        criteria: decisionCriteria,
        doseLevels: decisionDoseLevels,
        toxicityActions: decisionToxicityActions,
        criteriaAlerts: decisionCriteriaAlerts,
        matchedToxicityActions,
        recommendedReductionLevel,
        recommendedDoseLevels,
      },
      guidelineSources: guidelineSources.map((row) => ({
        id: row.id,
        department: row.department ?? null,
        regimen_name: row.regimen_name,
        regimen_key: row.regimen_key,
        source_file: row.source_file,
        source_title: row.source_title ?? null,
        imported_at: row.imported_at,
      })),
    });
  } catch (e) {
    console.error('GET /:patientId/detail error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// 笏笏 POST /api/regimen-check/:patientId/audits 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
router.post('/:patientId/audits', async (req: AuthRequest, res: Response) => {
  try {
    const patientId = Number(req.params.patientId);
    const { audit_date, pharmacist_name, comment, handover_note } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO regimen_audits (patient_id, audit_date, pharmacist_name, comment, handover_note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [patientId, audit_date || new Date().toISOString().split('T')[0], pharmacist_name, comment, handover_note]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error('POST /audits error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// 笏笏 POST /api/regimen-check/:patientId/doubts 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
router.post('/:patientId/doubts', async (req: AuthRequest, res: Response) => {
  try {
    const patientId = Number(req.params.patientId);
    const { doubt_date, content, pharmacist_name, regimen_id, treatment_date } = req.body;
    const regimenId = regimen_id ? Number(regimen_id) : null;
    const treatmentDate = normalizeDateString(treatment_date);
    const doubtDate = normalizeDateString(doubt_date) || new Date().toISOString().split('T')[0];
    const { rows } = await pool.query(
      `INSERT INTO regimen_doubts
         (patient_id, doubt_date, content, pharmacist_name, regimen_id, treatment_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        patientId,
        doubtDate,
        content,
        pharmacist_name,
        regimenId,
        treatmentDate,
      ]
    );

    // 逍醍ｾｩ辣ｧ莨壹ｒ逋ｻ骭ｲ縺励◆繧峨∬ｩｲ蠖捺律縺ｮ逶｣譟ｻ繧ｹ繝・・繧ｿ繧ｹ繧堤桝鄒ｩ荳ｭ縺ｫ縺吶ｋ
    const targetDate = treatmentDate || doubtDate;
    if (targetDate && regimenId) {
      await pool.query(
        `INSERT INTO regimen_calendar (patient_id, regimen_id, treatment_date, status, audit_status, auditor_name, audited_at)
         VALUES ($1, $2, $3::date, 'planned', 'doubt', $4::text, NOW())
         ON CONFLICT (patient_id, regimen_id, treatment_date) DO UPDATE SET
           audit_status = 'doubt',
           auditor_name = COALESCE($4::text, regimen_calendar.auditor_name),
           audited_at = NOW(),
           status = CASE
             WHEN regimen_calendar.status IS NULL OR regimen_calendar.status = ''
               THEN 'planned'
             ELSE regimen_calendar.status
           END`,
        [patientId, regimenId, targetDate, pharmacist_name ?? null]
      );
    } else if (targetDate) {
      await pool.query(
        `UPDATE regimen_calendar
            SET audit_status = 'doubt',
                auditor_name = COALESCE($2::text, auditor_name),
                audited_at = NOW()
          WHERE patient_id = $1
            AND treatment_date = $3::date`,
        [patientId, pharmacist_name ?? null, targetDate]
      );
    }

    res.json(rows[0]);
  } catch (e) {
    console.error('POST /doubts error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// 笏笏 PATCH /api/regimen-check/doubts/:id 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
router.patch('/doubts/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, resolution } = req.body;
    const { rows } = await pool.query(
      `UPDATE regimen_doubts
       SET status = $2::text,
           resolution = $3::text,
           resolved_at = CASE WHEN $2::text = 'resolved' THEN NOW() ELSE NULL END
       WHERE id = $1 RETURNING *`,
      [id, status ?? null, resolution ?? null]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error('PATCH /doubts/:id error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/patients/:id/comment', async (req: AuthRequest, res: Response) => {
  try {
    const patientId = Number(req.params.id);
    if (!patientId) {
      res.status(400).json({ error: 'invalid patient id' });
      return;
    }
    const { patient_comment } = req.body;
    const { rows } = await pool.query(
      `UPDATE patients
       SET patient_comment = $2
       WHERE id = $1
       RETURNING id, patient_comment`,
      [patientId, (patient_comment ?? '').toString().trim() || null]
    );
    if (!rows.length) {
      res.status(404).json({ error: 'Patient not found' });
      return;
    }
    res.json(rows[0]);
  } catch (e) {
    console.error('PATCH /patients/:id/comment error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// 笏笏 PATCH /api/regimen-check/patient-orders/:id 笏笏笏笏笏笏笏笏笏笏笏笏笏笏
router.patch('/patient-orders/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { dose, dose_unit } = req.body;
    const { rows } = await pool.query(
      `UPDATE patient_orders
       SET dose = $2, dose_unit = COALESCE($3, dose_unit)
       WHERE id = $1 RETURNING *`,
      [id, dose, dose_unit]
    );
    if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(rows[0]);
  } catch (e) {
    console.error('PATCH /patient-orders/:id error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// 笏笏 POST /api/regimen-check/calendar/cycle 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
router.post('/calendar/cycle', async (req: AuthRequest, res: Response) => {
  try {
    const { patient_id, regimen_id, treatment_date, cycle_no } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO regimen_calendar (patient_id, regimen_id, treatment_date, cycle_no, status)
       VALUES ($1, $2, $3, $4, 'planned')
       ON CONFLICT (patient_id, regimen_id, treatment_date) DO UPDATE SET
         cycle_no = EXCLUDED.cycle_no
       RETURNING *`,
      [patient_id, regimen_id, treatment_date, cycle_no]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error('POST /calendar/cycle error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// 笏笏 GET /api/regimen-check/calendar 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
router.get('/calendar', async (req: AuthRequest, res: Response) => {
  try {
    const { from, to } = req.query;
    const fromDate = from || (() => {
      const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().split('T')[0];
    })();
    const toDate = to || (() => {
      const d = new Date(); d.setMonth(d.getMonth() + 2); return d.toISOString().split('T')[0];
    })();

    const { rows } = await pool.query(
      `WITH manual AS (
         SELECT rc.id, rc.patient_id, rc.regimen_id, rc.treatment_date,
           rc.cycle_no, rc.status, rc.audit_status, rc.notes
         FROM regimen_calendar rc
         WHERE rc.treatment_date BETWEEN $1 AND $2
       ),
       from_st AS (
         SELECT NULL::int AS id, st.patient_id, st.regimen_id,
           st.scheduled_date AS treatment_date,
           NULL::int AS cycle_no,
           CASE st.status
             WHEN '螳滓命' THEN 'done'
             WHEN '荳ｭ豁｢' THEN 'cancelled'
             WHEN '螟画峩' THEN 'changed'
             ELSE 'planned'
           END AS status,
           NULL::text AS audit_status, NULL::text AS notes
         FROM scheduled_treatments st
         WHERE st.scheduled_date BETWEEN $1 AND $2
           AND NOT EXISTS (
             SELECT 1 FROM manual m
             WHERE m.patient_id = st.patient_id
               AND m.regimen_id = st.regimen_id
               AND m.treatment_date = st.scheduled_date
           )
       ),
       from_orders AS (
         SELECT NULL::int AS id, po.patient_id,
           (SELECT st2.regimen_id FROM scheduled_treatments st2
            WHERE st2.patient_id = po.patient_id
            ORDER BY st2.scheduled_date DESC LIMIT 1) AS regimen_id,
           po.order_date AS treatment_date,
           NULL::int AS cycle_no, 'planned' AS status,
           NULL::text AS audit_status, NULL::text AS notes
         FROM (
           SELECT DISTINCT patient_id, order_date FROM patient_orders
           WHERE order_date > CURRENT_DATE
             AND order_date BETWEEN $1 AND $2
             AND is_antineoplastic = true
         ) po
         WHERE NOT EXISTS (
           SELECT 1 FROM manual m WHERE m.patient_id = po.patient_id AND m.treatment_date = po.order_date
         )
         AND NOT EXISTS (
           SELECT 1 FROM scheduled_treatments st3
           WHERE st3.patient_id = po.patient_id AND st3.scheduled_date = po.order_date
         )
       ),
       combined AS (
         SELECT * FROM manual
         UNION ALL SELECT * FROM from_st
         UNION ALL SELECT * FROM from_orders WHERE regimen_id IS NOT NULL
       )
       SELECT c.id, c.patient_id, c.regimen_id,
         TO_CHAR(c.treatment_date, 'YYYY-MM-DD') AS treatment_date,
         c.cycle_no, c.status, c.audit_status, c.notes,
         p.patient_no, p.name AS patient_name, p.department,
         r.name AS regimen_name
       FROM combined c
       JOIN patients p ON p.id = c.patient_id
       JOIN regimens r ON r.id = c.regimen_id
       ORDER BY p.patient_no, r.name, c.treatment_date`,
      [fromDate, toDate]
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /calendar error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// 笏笏 POST /api/regimen-check/calendar 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
router.post('/calendar', async (req: AuthRequest, res: Response) => {
  try {
    const { patient_id, regimen_id, treatment_date, cycle_no, status, audit_status, notes } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO regimen_calendar (patient_id, regimen_id, treatment_date, cycle_no, status, audit_status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (patient_id, regimen_id, treatment_date) DO UPDATE SET
         status = EXCLUDED.status, audit_status = EXCLUDED.audit_status,
         cycle_no = COALESCE(EXCLUDED.cycle_no, regimen_calendar.cycle_no),
         notes = COALESCE(EXCLUDED.notes, regimen_calendar.notes)
       RETURNING *`,
      [patient_id, regimen_id, treatment_date, cycle_no || null, status || 'planned', audit_status || null, notes || null]
    );
    const { rows: info } = await pool.query(
      `SELECT p.patient_no, p.name AS patient_name, p.department, r.name AS regimen_name
       FROM patients p, regimens r WHERE p.id = $1 AND r.id = $2`,
      [patient_id, regimen_id]
    );
    res.json({ ...rows[0], ...(info[0] || {}) });
  } catch (e) {
    console.error('POST /calendar error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// 笏笏 PATCH /api/regimen-check/calendar/audit-status 笏笏笏笏笏笏笏笏笏笏
// 窶ｻ /calendar/:id 繧医ｊ蠢・★蜑阪↓螳夂ｾｩ縺吶ｋ縺薙→・医Ν繝ｼ繝・ぅ繝ｳ繧ｰ蜆ｪ蜈磯・ｽ搾ｼ・
router.patch('/calendar/audit-status', async (req: AuthRequest, res: Response) => {
  try {
    const { patient_id, regimen_id, treatment_date, audit_status, auditor_name } = req.body;
    if (!patient_id || !regimen_id || !treatment_date) {
      res.status(400).json({ error: 'patient_id, regimen_id, treatment_date required' }); return;
    }
    // treatment_date 繧呈枚蟄怜・縺ｫ豁｣隕丞喧・・ate 繧ｪ繝悶ず繧ｧ繧ｯ繝亥ｯｾ遲厄ｼ・
    const dateStr = typeof treatment_date === 'string'
      ? treatment_date.slice(0, 10)
      : new Date(treatment_date).toISOString().slice(0, 10);
    const { rows } = await pool.query(
      `INSERT INTO regimen_calendar (patient_id, regimen_id, treatment_date, status, audit_status, auditor_name, audited_at)
       VALUES ($1, $2, $3, 'planned', $4::text, $5::text, CASE WHEN $4::text IS NOT NULL THEN NOW() ELSE NULL END)
       ON CONFLICT (patient_id, regimen_id, treatment_date) DO UPDATE SET
         audit_status = $4::text,
         auditor_name = CASE WHEN $4::text IS NOT NULL THEN $5::text ELSE NULL END,
         audited_at   = CASE WHEN $4::text IS NOT NULL THEN NOW() ELSE NULL END,
         status = CASE
           WHEN $4::text = 'audited' AND (regimen_calendar.status IS NULL OR regimen_calendar.status = '')
             THEN 'planned'
           ELSE regimen_calendar.status
         END
       RETURNING *`,
      [patient_id, regimen_id, dateStr, audit_status ?? null, auditor_name ?? null]
    );

    // 監査済にしたとき、同日の未解決疑義照会を自動で解決済みにする
    if (audit_status === 'audited') {
      await pool.query(
        `UPDATE regimen_doubts
            SET status = 'resolved',
                resolved_at = COALESCE(resolved_at, NOW()),
                resolution = COALESCE(NULLIF(resolution, ''), '監査済により自動解決')
          WHERE patient_id = $1
            AND status = 'open'
            AND (regimen_id = $2 OR regimen_id IS NULL)
            AND (
              (treatment_date IS NOT NULL AND treatment_date = $3::date)
              OR (treatment_date IS NULL AND doubt_date = $3::date)
            )`,
        [patient_id, regimen_id, dateStr]
      );
    }

    res.json(rows[0]);
  } catch (e) {
    console.error('PATCH /calendar/audit-status error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// 笏笏 PATCH /api/regimen-check/calendar/:id 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
router.patch('/calendar/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, audit_status, notes, cycle_no } = req.body;
    const { rows } = await pool.query(
      `UPDATE regimen_calendar
       SET status = COALESCE($2, status),
           audit_status = COALESCE($3, audit_status),
           notes = COALESCE($4, notes),
           cycle_no = COALESCE($5, cycle_no)
       WHERE id = $1 RETURNING *`,
      [id, status, audit_status, notes, cycle_no ?? null]
    );
    if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }
    const { rows: info } = await pool.query(
      `SELECT p.patient_no, p.name AS patient_name, p.department, r.name AS regimen_name
       FROM regimen_calendar rc
       JOIN patients p ON p.id = rc.patient_id
       JOIN regimens r ON r.id = rc.regimen_id
       WHERE rc.id = $1`,
      [id]
    );
    res.json({ ...rows[0], ...(info[0] || {}) });
  } catch (e) {
    console.error('PATCH /calendar/:id error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// 笏笏 PATCH /api/regimen-check/regimens/:id 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
router.patch('/regimens/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name?.trim()) { res.status(400).json({ error: 'name required' }); return; }
    const { rows } = await pool.query(
      `UPDATE regimens SET name = $2 WHERE id = $1 RETURNING *`,
      [id, name.trim()]
    );
    if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(rows[0]);
  } catch (e) {
    console.error('PATCH /regimens/:id error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// 笏笏 GET /api/regimen-check/calendar/audit-detail 笏笏笏笏笏笏笏笏笏笏笏笏笏
router.get('/calendar/audit-detail', async (req: AuthRequest, res: Response) => {
  try {
    const patient_id = Number(req.query.patient_id);
    const date = req.query.date as string;
    if (!patient_id || !date) {
      res.status(400).json({ error: 'patient_id and date required' }); return;
    }
    const [patRes, auditRes, doubtRes, calRes] = await Promise.all([
      pool.query(
        `SELECT id, patient_no, name, department FROM patients WHERE id = $1`,
        [patient_id]
      ),
      pool.query(
        `SELECT id, audit_date, pharmacist_name, comment, handover_note, created_at
         FROM regimen_audits
         WHERE patient_id = $1 AND audit_date = $2
         ORDER BY created_at DESC`,
        [patient_id, date]
      ),
      pool.query(
        `SELECT rd.id, rd.doubt_date, rd.content, rd.status, rd.resolution, rd.pharmacist_name,
                rd.regimen_id, rd.treatment_date, r.name AS regimen_name
         FROM regimen_doubts rd
         LEFT JOIN regimens r ON r.id = rd.regimen_id
         WHERE rd.patient_id = $1 AND (rd.status = 'open' OR rd.doubt_date = $2 OR rd.treatment_date = $2)
         ORDER BY
           CASE WHEN rd.status = 'open' THEN 0 ELSE 1 END,
           COALESCE(rd.treatment_date, rd.doubt_date) DESC`,
        [patient_id, date]
      ),
      pool.query(
        `SELECT rc.id, rc.status, rc.audit_status, rc.cycle_no, r.name AS regimen_name
         FROM regimen_calendar rc
         JOIN regimens r ON r.id = rc.regimen_id
         WHERE rc.patient_id = $1 AND rc.treatment_date = $2
         ORDER BY r.name`,
        [patient_id, date]
      ),
    ]);
    res.json({
      patient: patRes.rows[0] ?? null,
      audits: auditRes.rows,
      doubts: doubtRes.rows,
      calendar: calRes.rows,
    });
  } catch (e) {
    console.error('GET /calendar/audit-detail error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// 笏笏 GET /api/regimen-check/calendar/patients 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
router.get('/calendar/patients', async (_req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id AS patient_id, p.patient_no, p.name AS patient_name,
         p.department, r.name AS regimen_name,
         ARRAY_AGG(DISTINCT r.id ORDER BY r.id) AS regimen_ids
       FROM (
         SELECT patient_id, regimen_id FROM regimen_calendar
         UNION
         SELECT patient_id, regimen_id FROM scheduled_treatments
       ) src
       JOIN patients p ON p.id = src.patient_id
       JOIN regimens r ON r.id = src.regimen_id
       GROUP BY p.id, p.patient_no, p.name, p.department, r.name
       ORDER BY p.patient_no, r.name`
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /calendar/patients error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// 笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武
// 繝ｬ繧ｸ繝｡繝ｳ繝槭せ繧ｿ CRUD
// 笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武笊絶武

router.post('/regimen-master/clear', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const client = await pool.connect();
  try {
    await ensureGuidelineTables();
    await client.query('BEGIN');
    const guidelineRules = await client.query(`DELETE FROM regimen_guideline_rules`);
    const guidelineSources = await client.query(`DELETE FROM regimen_guideline_sources`);
    const drugs = await client.query(`DELETE FROM regimen_drugs`);
    const tox = await client.query(`DELETE FROM regimen_toxicity_rules`);
    const master = await client.query(`DELETE FROM regimen_master`);
    await client.query('COMMIT');
    res.json({
      ok: true,
      deleted: {
        regimen_master: master.rowCount ?? 0,
        regimen_drugs: drugs.rowCount ?? 0,
        regimen_toxicity_rules: tox.rowCount ?? 0,
        regimen_guideline_sources: guidelineSources.rowCount ?? 0,
        regimen_guideline_rules: guidelineRules.rowCount ?? 0,
      },
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('POST /regimen-master/clear error:', e);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// 笏笏 GET /api/regimen-check/regimen-master 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
router.get('/regimen-master', async (_req: AuthRequest, res: Response) => {
  try {
    const { rows: masters } = await pool.query(
      `SELECT id, regimen_name, category, cycle_days, description, is_active, created_at, updated_at
       FROM regimen_master
       ORDER BY category NULLS LAST, regimen_name`
    );
    const { rows: drugs } = await pool.query(
      `SELECT id, regimen_id, sort_order, drug_name, drug_type, base_dose, dose_unit,
         dose_per, solvent_name, solvent_volume, route, drip_time, notes
       FROM regimen_drugs
       ORDER BY regimen_id, sort_order`
    );
    const { rows: toxicity } = await pool.query(
      `SELECT id, regimen_id, toxicity_item, grade1_action, grade2_action, grade3_action, grade4_action, notes
       FROM regimen_toxicity_rules
       ORDER BY regimen_id, toxicity_item`
    );
    res.json({ masters, drugs, toxicity });
  } catch (e) {
    console.error('GET /regimen-master error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// 笏笏 POST /api/regimen-check/regimen-master 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
router.post('/regimen-master', async (req: AuthRequest, res: Response) => {
  try {
    const { regimen_name, category, cycle_days, description, is_active } = req.body;
    if (!regimen_name?.trim()) { res.status(400).json({ error: 'regimen_name required' }); return; }
    const { rows } = await pool.query(
      `INSERT INTO regimen_master (regimen_name, category, cycle_days, description, is_active)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [regimen_name.trim(), category || null, cycle_days || 21, description || null, is_active !== false]
    );
    res.json(rows[0]);
  } catch (e: any) {
    if (e.code === '23505') { res.status(409).json({ error: 'duplicate regimen_name' }); return; }
    console.error('POST /regimen-master error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// 笏笏 PATCH /api/regimen-check/regimen-master/:id 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
router.patch('/regimen-master/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { regimen_name, category, cycle_days, description, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE regimen_master
       SET regimen_name = COALESCE($2, regimen_name),
           category     = COALESCE($3, category),
           cycle_days   = COALESCE($4, cycle_days),
           description  = COALESCE($5, description),
           is_active    = COALESCE($6, is_active),
           updated_at   = NOW()
       WHERE id = $1 RETURNING *`,
      [id, regimen_name || null, category || null, cycle_days || null, description || null, is_active ?? null]
    );
    if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(rows[0]);
  } catch (e: any) {
    if (e.code === '23505') { res.status(409).json({ error: 'duplicate regimen_name' }); return; }
    console.error('PATCH /regimen-master/:id error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// 笏笏 DELETE /api/regimen-check/regimen-master/:id 笏笏笏笏笏笏笏笏笏笏笏笏笏笏
router.delete('/regimen-master/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM regimen_master WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /regimen-master/:id error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// 笏笏 POST /api/regimen-check/regimen-master/:id/drugs 笏笏笏笏笏笏笏笏笏
router.post('/regimen-master/:id/drugs', async (req: AuthRequest, res: Response) => {
  try {
    const regimenId = Number(req.params.id);
    const { sort_order, drug_name, drug_type, base_dose, dose_unit, dose_per,
            solvent_name, solvent_volume, route, drip_time, notes } = req.body;
    if (!drug_name?.trim()) { res.status(400).json({ error: 'drug_name required' }); return; }
    const { rows } = await pool.query(
      `INSERT INTO regimen_drugs
         (regimen_id, sort_order, drug_name, drug_type, base_dose, dose_unit, dose_per,
          solvent_name, solvent_volume, route, drip_time, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [regimenId, sort_order || 1, drug_name.trim(), drug_type || 'antineoplastic',
       base_dose || null, dose_unit || null, dose_per || 'BSA',
       solvent_name || null, solvent_volume || null, route || null, drip_time || null, notes || null]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error('POST /regimen-master/:id/drugs error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// 笏笏 PATCH /api/regimen-check/regimen-master/drugs/:drugId 笏笏笏笏
router.patch('/regimen-master/drugs/:drugId', async (req: AuthRequest, res: Response) => {
  try {
    const { drugId } = req.params;
    const { sort_order, drug_name, drug_type, base_dose, dose_unit, dose_per,
            solvent_name, solvent_volume, route, drip_time, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE regimen_drugs
       SET sort_order    = COALESCE($2, sort_order),
           drug_name     = COALESCE($3, drug_name),
           drug_type     = COALESCE($4, drug_type),
           base_dose     = COALESCE($5, base_dose),
           dose_unit     = COALESCE($6, dose_unit),
           dose_per      = COALESCE($7, dose_per),
           solvent_name  = COALESCE($8, solvent_name),
           solvent_volume= COALESCE($9, solvent_volume),
           route         = COALESCE($10, route),
           drip_time     = COALESCE($11, drip_time),
           notes         = COALESCE($12, notes)
       WHERE id = $1 RETURNING *`,
      [drugId, sort_order||null, drug_name||null, drug_type||null, base_dose||null,
       dose_unit||null, dose_per||null, solvent_name||null, solvent_volume||null,
       route||null, drip_time||null, notes||null]
    );
    if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(rows[0]);
  } catch (e) {
    console.error('PATCH /regimen-master/drugs/:drugId error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// 笏笏 DELETE /api/regimen-check/regimen-master/drugs/:drugId 笏笏笏
router.delete('/regimen-master/drugs/:drugId', async (req: AuthRequest, res: Response) => {
  try {
    await pool.query(`DELETE FROM regimen_drugs WHERE id = $1`, [req.params.drugId]);
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /regimen-master/drugs/:drugId error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// 笏笏 POST /api/regimen-check/regimen-master/:id/toxicity 笏笏笏笏笏笏
router.post('/regimen-master/:id/toxicity', async (req: AuthRequest, res: Response) => {
  try {
    const regimenId = Number(req.params.id);
    const { toxicity_item, grade1_action, grade2_action, grade3_action, grade4_action, notes } = req.body;
    if (!toxicity_item?.trim()) { res.status(400).json({ error: 'toxicity_item required' }); return; }
    const { rows } = await pool.query(
      `INSERT INTO regimen_toxicity_rules
         (regimen_id, toxicity_item, grade1_action, grade2_action, grade3_action, grade4_action, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (regimen_id, toxicity_item) DO UPDATE SET
         grade1_action = EXCLUDED.grade1_action,
         grade2_action = EXCLUDED.grade2_action,
         grade3_action = EXCLUDED.grade3_action,
         grade4_action = EXCLUDED.grade4_action,
         notes         = EXCLUDED.notes
       RETURNING *`,
      [regimenId, toxicity_item.trim(),
       grade1_action || '継続',
       grade2_action || '減量検討',
       grade3_action || '休薬・減量',
       grade4_action || '投与中止',
       notes || null]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error('POST /regimen-master/:id/toxicity error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// 笏笏 PATCH /api/regimen-check/regimen-master/toxicity/:ruleId 笏
router.patch('/regimen-master/toxicity/:ruleId', async (req: AuthRequest, res: Response) => {
  try {
    const { ruleId } = req.params;
    const { toxicity_item, grade1_action, grade2_action, grade3_action, grade4_action, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE regimen_toxicity_rules
       SET toxicity_item  = COALESCE($2, toxicity_item),
           grade1_action  = COALESCE($3, grade1_action),
           grade2_action  = COALESCE($4, grade2_action),
           grade3_action  = COALESCE($5, grade3_action),
           grade4_action  = COALESCE($6, grade4_action),
           notes          = COALESCE($7, notes)
       WHERE id = $1 RETURNING *`,
      [ruleId, toxicity_item||null, grade1_action||null, grade2_action||null,
       grade3_action||null, grade4_action||null, notes||null]
    );
    if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(rows[0]);
  } catch (e) {
    console.error('PATCH /regimen-master/toxicity/:ruleId error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// 笏笏 DELETE /api/regimen-check/regimen-master/toxicity/:ruleId
router.delete('/regimen-master/toxicity/:ruleId', async (req: AuthRequest, res: Response) => {
  try {
    await pool.query(`DELETE FROM regimen_toxicity_rules WHERE id = $1`, [req.params.ruleId]);
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /regimen-master/toxicity/:ruleId error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// 隨渉隨渉 GET /api/regimen-check/guideline-rules?regimen=xxx 隨渉隨渉
router.get('/guideline-rules', async (req: AuthRequest, res: Response) => {
  try {
    const regimen = String(req.query.regimen || '').trim();
    if (!regimen) {
      res.status(400).json({ error: 'regimen required' });
      return;
    }
    const regimenKey = normalizeRegimenKey(regimen);
    const { rows } = await pool.query(
      `SELECT id, regimen_name, rule_type, evaluation_mode, metric_key,
              comparator, threshold_value, threshold_unit, condition_text,
              action_text, severity, source_file, source_line, is_active
       FROM regimen_guideline_rules
       WHERE regimen_key = $1
       ORDER BY
         CASE severity WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
         id`,
      [regimenKey]
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /guideline-rules error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// 隨渉隨渉 POST /api/regimen-check/guideline-rules/import 隨渉隨渉
router.post('/guideline-rules/import', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;

  try {
    const bodyPaths = Array.isArray(req.body?.filePaths)
      ? req.body.filePaths.filter((v: unknown) => typeof v === 'string')
      : [];
    const rawRegimenNameMap = req.body?.regimenNameMap;
    const regimenNameMap: Record<string, string> =
      rawRegimenNameMap && typeof rawRegimenNameMap === 'object' && !Array.isArray(rawRegimenNameMap)
        ? (rawRegimenNameMap as Record<string, string>)
        : {};

    const defaultDir = 'P:\\MyObsidian\\_config\\Clippings\\2025';
    const filePaths = bodyPaths.length > 0
      ? bodyPaths
      : fs
        .readdirSync(defaultDir)
        .filter((name: string) => name.endsWith('HOKUTO.md'))
        .map((name: string) => `${defaultDir}\\${name}`);

    if (!filePaths.length) {
      res.status(400).json({ error: 'no markdown files found' });
      return;
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS regimen_guideline_sources (
        id SERIAL PRIMARY KEY,
        regimen_id INTEGER REFERENCES regimen_master(id) ON DELETE SET NULL,
        department TEXT,
        regimen_name TEXT NOT NULL,
        regimen_key TEXT NOT NULL,
        source_file TEXT NOT NULL,
        source_title TEXT,
        markdown_content TEXT NOT NULL,
        imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (regimen_key, source_file)
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS regimen_guideline_rules (
        id SERIAL PRIMARY KEY,
        regimen_id INTEGER REFERENCES regimen_master(id) ON DELETE SET NULL,
        regimen_name TEXT NOT NULL,
        regimen_key TEXT NOT NULL,
        rule_type VARCHAR(40) NOT NULL,
        evaluation_mode VARCHAR(20) NOT NULL DEFAULT 'condition',
        metric_key VARCHAR(40),
        comparator VARCHAR(8),
        threshold_value NUMERIC(12,4),
        threshold_unit VARCHAR(40),
        condition_text TEXT NOT NULL,
        action_text TEXT NOT NULL,
        severity VARCHAR(20) NOT NULL DEFAULT 'warning',
        source_file TEXT,
        source_line INTEGER,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`ALTER TABLE regimen_guideline_sources ADD COLUMN IF NOT EXISTS department TEXT`);
    await pool.query(`ALTER TABLE regimen_guideline_sources ADD COLUMN IF NOT EXISTS regimen_id INTEGER REFERENCES regimen_master(id) ON DELETE SET NULL`);
    await pool.query(`ALTER TABLE regimen_guideline_rules ADD COLUMN IF NOT EXISTS regimen_id INTEGER REFERENCES regimen_master(id) ON DELETE SET NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_regimen_guideline_sources_regimen_id ON regimen_guideline_sources (regimen_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_regimen_guideline_rules_regimen_id ON regimen_guideline_rules (regimen_id)`);

    const client = await pool.connect();
    let importedFiles = 0;
    let importedRules = 0;
    let sourceOnlyFiles = 0;
    let masterLinkedFiles = 0;
    const skipped: Array<{ file: string; reason: string }> = [];
    const unmatchedMaster: Array<{ file: string; parsedRegimen: string }> = [];
    try {
      await client.query('BEGIN');
      const masterEntries: Array<{ id: number; regimenName: string; regimenKey: string }> = [];
      const masterByKey = new Map<string, { id: number; regimenName: string; regimenKey: string }>();
      const resolveMasterLink = (filePath: string, parsedRegimenName: string, parsedRegimenKey: string) => {
        const overrideRegimenName = [
          regimenNameMap[filePath],
          regimenNameMap[path.basename(filePath)],
          regimenNameMap[parsedRegimenName],
          regimenNameMap[parsedRegimenKey],
        ].find((v) => typeof v === 'string' && v.trim().length > 0)?.trim();
        const targetRegimenName = overrideRegimenName || parsedRegimenName;
        return {
          linkedMaster: null,
          targetRegimenId: null,
          targetRegimenName,
          targetRegimenKey: normalizeRegimenKey(targetRegimenName),
        };
      };

      for (const filePath of filePaths) {
        try {
          if (/^https?:\/\//i.test(filePath)) {
            const response = await fetch(filePath);
            if (!response.ok) {
              skipped.push({ file: filePath, reason: `url fetch failed: ${response.status}` });
              continue;
            }
            const html = await response.text();
            const sourceTitle = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.trim() ?? filePath;
            const parsedRegimenName = sourceTitle.split('|')[0]?.trim() || filePath;
            const parsedRegimenKey = normalizeRegimenKey(parsedRegimenName);

            const resolved = resolveMasterLink(filePath, parsedRegimenName, parsedRegimenKey);
            const { linkedMaster, targetRegimenId, targetRegimenName, targetRegimenKey } = resolved;
            if (linkedMaster) {
              masterLinkedFiles += 1;
            }

            await client.query(`DELETE FROM regimen_guideline_sources WHERE source_file = $1`, [filePath]);
            await client.query(
              `INSERT INTO regimen_guideline_sources
                 (regimen_id, department, regimen_name, regimen_key, source_file, source_title, markdown_content, imported_at)
               VALUES ($1, NULL, $2, $3, $4, $5, $6, NOW())
               ON CONFLICT (regimen_key, source_file) DO UPDATE SET
                 regimen_id = EXCLUDED.regimen_id,
                 department = EXCLUDED.department,
                 regimen_name = EXCLUDED.regimen_name,
                 source_title = EXCLUDED.source_title,
                 markdown_content = EXCLUDED.markdown_content,
                 imported_at = NOW()`,
              [targetRegimenId, targetRegimenName, targetRegimenKey, filePath, sourceTitle, html]
            );
            await client.query(`DELETE FROM regimen_guideline_rules WHERE source_file = $1`, [filePath]);
            importedFiles += 1;
            sourceOnlyFiles += 1;
            skipped.push({ file: filePath, reason: 'source-only imported: url html' });
            continue;
          }

          const parsed = parseGuidelineMarkdown(filePath);

          const resolved = resolveMasterLink(filePath, parsed.regimenName, parsed.regimenKey);
          const { linkedMaster, targetRegimenId, targetRegimenName, targetRegimenKey } = resolved;
          if (linkedMaster) {
            masterLinkedFiles += 1;
          }

          await client.query(
            `DELETE FROM regimen_guideline_sources
             WHERE source_file = $1`,
            [parsed.sourceFile]
          );

          await client.query(
            `INSERT INTO regimen_guideline_sources
               (regimen_id, department, regimen_name, regimen_key, source_file, source_title, markdown_content, imported_at)
             VALUES ($1, NULL, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT (regimen_key, source_file) DO UPDATE SET
               regimen_id = EXCLUDED.regimen_id,
               department = EXCLUDED.department,
               regimen_name = EXCLUDED.regimen_name,
               source_title = EXCLUDED.source_title,
               markdown_content = EXCLUDED.markdown_content,
               imported_at = NOW()`,
            [targetRegimenId, targetRegimenName, targetRegimenKey, parsed.sourceFile, parsed.sourceTitle, parsed.markdownContent]
          );

          await client.query(
            `DELETE FROM regimen_guideline_rules
             WHERE source_file = $1`,
            [parsed.sourceFile]
          );

          if (!parsed.rules.length) {
            importedFiles += 1;
            sourceOnlyFiles += 1;
            skipped.push({ file: filePath, reason: 'source-only imported: no parsable rules' });
            continue;
          }

          for (const rule of parsed.rules) {
            await client.query(
              `INSERT INTO regimen_guideline_rules
                 (regimen_id, regimen_name, regimen_key, rule_type, evaluation_mode, metric_key,
                  comparator, threshold_value, threshold_unit, condition_text, action_text,
                  severity, source_file, source_line, is_active)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,TRUE)`,
              [
                targetRegimenId,
                targetRegimenName,
                targetRegimenKey,
                rule.rule_type,
                rule.evaluation_mode,
                rule.metric_key,
                rule.comparator,
                rule.threshold_value,
                rule.threshold_unit,
                rule.condition_text,
                rule.action_text,
                rule.severity,
                rule.source_file,
                rule.source_line,
              ]
            );
            importedRules += 1;
          }
          importedFiles += 1;
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          if (/^https?:\/\//i.test(filePath)) {
            skipped.push({ file: filePath, reason: `url import failed: ${message}` });
            continue;
          }
          try {
            const markdownContent = fs.readFileSync(filePath, 'utf8');
            const sourceTitleMatch = markdownContent.match(/^\s*title:\s*"([^"]+)"/m);
            const sourceTitle = sourceTitleMatch?.[1] ?? null;
            const fallbackName = (sourceTitle?.split('|')[0]?.trim())
              || path.basename(filePath, '.md').split('  繝ｬ繧ｸ繝｡繝ｳ')[0]?.trim()
              || path.basename(filePath, '.md');
            const fallbackKey = normalizeRegimenKey(fallbackName);
            const resolved = resolveMasterLink(filePath, fallbackName, fallbackKey);
            const { linkedMaster, targetRegimenId, targetRegimenName, targetRegimenKey } = resolved;
            if (linkedMaster) {
              masterLinkedFiles += 1;
            }

            await client.query(
              `DELETE FROM regimen_guideline_sources
               WHERE source_file = $1`,
              [filePath]
            );
            await client.query(
              `INSERT INTO regimen_guideline_sources
                 (regimen_id, department, regimen_name, regimen_key, source_file, source_title, markdown_content, imported_at)
               VALUES ($1, NULL, $2, $3, $4, $5, $6, NOW())
               ON CONFLICT (regimen_key, source_file) DO UPDATE SET
                 regimen_id = EXCLUDED.regimen_id,
                 department = EXCLUDED.department,
                 regimen_name = EXCLUDED.regimen_name,
                 source_title = EXCLUDED.source_title,
                 markdown_content = EXCLUDED.markdown_content,
                 imported_at = NOW()`,
              [targetRegimenId, targetRegimenName, targetRegimenKey, filePath, sourceTitle, markdownContent]
            );
            await client.query(
              `DELETE FROM regimen_guideline_rules
               WHERE source_file = $1`,
              [filePath]
            );
            importedFiles += 1;
            sourceOnlyFiles += 1;
            skipped.push({ file: filePath, reason: `source-only imported: ${message}` });
          } catch (fallbackError) {
            console.error('guideline import parse error:', filePath, e);
            const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
            skipped.push({ file: filePath, reason: `parse failed: ${message}; source import failed: ${fallbackMessage}` });
          }
        }
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.json({ importedFiles, importedRules, sourceOnlyFiles, masterLinkedFiles, unmatchedMaster, skipped });
  } catch (e) {
    console.error('POST /guideline-rules/import error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

