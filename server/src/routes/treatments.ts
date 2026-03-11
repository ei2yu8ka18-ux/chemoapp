import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { normalizeRegimenKey } from '../lib/regimen-guideline';
import {
  DecisionCriterion,
  DecisionLabSnapshot,
  evaluateDecisionCriteria,
} from '../lib/regimen-decision-support';

const router = Router();
router.use(authenticateToken);

type StartCriteriaSourceRow = {
  regimen_key: string;
  department: string | null;
  metric_key: string;
  comparator: string;
  threshold_value: string | number;
  threshold_unit: string | null;
  criterion_text: string;
  section_type: string;
  source_section: string | null;
};

type DecisionCriteriaAlertRow = {
  metric_key: string;
  comparator: string;
  threshold_value: number;
  threshold_unit: string | null;
  current_value: number | null;
  criterion_text: string;
};

type TreatmentRowWithLab = {
  regimen_name: string;
  department: string | null;
  anc?: number | null;
  plt?: number | null;
  hgb?: number | null;
  cre?: number | null;
  egfr?: number | null;
  ast?: number | null;
  alt?: number | null;
  tbil?: number | null;
  [key: string]: any;
};

function toLabSnapshot(row: TreatmentRowWithLab): DecisionLabSnapshot {
  return {
    anc: row.anc ?? null,
    plt: row.plt ?? null,
    hgb: row.hgb ?? null,
    cre: row.cre ?? null,
    egfr: row.egfr ?? null,
    ast: row.ast ?? null,
    alt: row.alt ?? null,
    tbil: row.tbil ?? null,
  };
}

function normalizeDepartment(value: string | null | undefined): string {
  return String(value || '').trim();
}

function buildCriteriaMap(rows: StartCriteriaSourceRow[]): Map<string, StartCriteriaSourceRow[]> {
  const map = new Map<string, StartCriteriaSourceRow[]>();
  for (const row of rows) {
    const key = normalizeRegimenKey(row.regimen_key || '');
    if (!key) continue;
    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

function pickCriteriaByDepartment(
  allRows: StartCriteriaSourceRow[],
  department: string,
): DecisionCriterion[] {
  if (!allRows.length) return [];
  const dept = normalizeDepartment(department);
  const general = allRows.filter((row) => !normalizeDepartment(row.department));
  const exact = dept
    ? allRows.filter((row) => normalizeDepartment(row.department) === dept)
    : [];
  const source = exact.length ? [...general, ...exact] : (general.length ? general : allRows);
  return source.map((row) => ({
    metric_key: row.metric_key,
    comparator: row.comparator,
    threshold_value: Number(row.threshold_value),
    threshold_unit: row.threshold_unit,
    criterion_text: row.criterion_text,
    is_required: true,
    section_type: 'start_criteria',
    source_section: row.source_section,
  }));
}

async function attachStartCriteriaWarnings(rows: TreatmentRowWithLab[]): Promise<TreatmentRowWithLab[]> {
  if (!rows.length) return rows;
  const regimenKeys = Array.from(new Set(
    rows
      .map((row) => normalizeRegimenKey(row.regimen_name || ''))
      .filter(Boolean),
  ));
  if (!regimenKeys.length) return rows;

  let criteriaRows: StartCriteriaSourceRow[] = [];
  try {
    const result = await pool.query<StartCriteriaSourceRow>(
      `SELECT regimen_key,
              department,
              metric_key,
              comparator,
              threshold_value,
              threshold_unit,
              criterion_text,
              section_type,
              source_section
         FROM regimen_decision_criteria
        WHERE regimen_key = ANY($1::text[])
          AND section_type = 'start_criteria'
        ORDER BY sort_order, id`,
      [regimenKeys],
    );
    criteriaRows = result.rows;
  } catch (e: any) {
    if (e?.code === '42P01') {
      return rows;
    }
    throw e;
  }

  if (!criteriaRows.length) return rows;
  const criteriaMap = buildCriteriaMap(criteriaRows);

  return rows.map((row) => {
    const key = normalizeRegimenKey(row.regimen_name || '');
    const list = criteriaMap.get(key) || [];
    if (!list.length) {
      return {
        ...row,
        has_start_criteria_warning: false,
        start_criteria_warning_count: 0,
        start_criteria_alerts: [],
      };
    }

    const criteria = pickCriteriaByDepartment(list, normalizeDepartment(row.department));
    const alerts = evaluateDecisionCriteria(criteria, toLabSnapshot(row));
    const normalizedAlerts: DecisionCriteriaAlertRow[] = alerts.map((alert) => ({
      metric_key: alert.metric_key,
      comparator: alert.comparator,
      threshold_value: alert.threshold_value,
      threshold_unit: alert.threshold_unit,
      current_value: alert.current_value,
      criterion_text: alert.criterion_text,
    }));
    return {
      ...row,
      has_start_criteria_warning: normalizedAlerts.length > 0,
      start_criteria_warning_count: normalizedAlerts.length,
      start_criteria_alerts: normalizedAlerts.slice(0, 5),
    };
  });
}

// 治療スケジュール一覧取得（日付指定）
router.get('/', async (req: AuthRequest, res: Response) => {
  const date = (req.query.date as string) || new Date().toISOString().split('T')[0];

  const { rows } = await pool.query(
    `SELECT
      st.id,
      st.scheduled_date,
      st.scheduled_time,
      st.status,
      st.memo,
      st.prescription_received,
      st.prescription_type,
      st.prescription_info,
      '注射' AS treatment_category,
      p.patient_no,
      p.name AS patient_name,
      p.patient_comment,
      p.furigana,
      p.department,
      p.doctor,
      p.diagnosis,
      r.name AS regimen_name,
      st.status_changed_at,
      st.status_note,
      br.wbc, br.hgb, br.plt, br.anc, br.mono,
      br.cre, br.egfr, br.ast, br.alt, br.tbil,
      br.crp, br.ca, br.mg, br.up, br.upcr,
      (
        SELECT COUNT(*)::int
        FROM interventions i2
        JOIN scheduled_treatments st2 ON st2.id = i2.treatment_id
        WHERE st2.patient_id = st.patient_id
          AND i2.calc_pre_consultation = true
          AND DATE_TRUNC('month', st2.scheduled_date) = DATE_TRUNC('month', $1::date)
      ) AS pre_consultation_this_month
    FROM scheduled_treatments st
    JOIN patients p ON p.id = st.patient_id
    JOIN regimens r ON r.id = st.regimen_id
    LEFT JOIN blood_results br ON br.treatment_id = st.id
    WHERE st.scheduled_date = $1
    ORDER BY st.scheduled_time NULLS LAST, st.id`,
    [date]
  );

  const withWarnings = await attachStartCriteriaWarnings(rows);
  res.json(withWarnings);
});

// ステータス更新（実施 / 変更 / 中止）
router.patch('/:id/status', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status, note } = req.body;

  const allowed = ['pending', 'done', 'changed', 'cancelled'];
  if (!allowed.includes(status)) {
    res.status(400).json({ error: 'invalid status' });
    return;
  }

  const { rows } = await pool.query(
    `UPDATE scheduled_treatments
     SET status = $1,
         status_note = COALESCE($2, status_note),
         status_changed_at = NOW(),
         updated_at = NOW()
     WHERE id = $3
     RETURNING id, patient_id, regimen_id, scheduled_date, status, status_note, status_changed_at`,
    [status, note ?? null, id]
  );

  if (rows[0]) {
    // レジメンカレンダーにも連動: done→● changed→▲ cancelled→× pending→○(planned)
    const calStatus = status === 'pending' ? 'planned' : status;
    await pool.query(
      `INSERT INTO regimen_calendar (patient_id, regimen_id, treatment_date, status)
       VALUES ($2, $3, $4, $1)
       ON CONFLICT (patient_id, regimen_id, treatment_date) DO UPDATE SET
         status = EXCLUDED.status`,
      [calStatus, rows[0].patient_id, rows[0].regimen_id, rows[0].scheduled_date]
    );
  }

  res.json(rows[0]);
});

// 備考更新
router.patch('/:id/memo', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { memo } = req.body;

  const { rows } = await pool.query(
    `UPDATE scheduled_treatments SET memo = $1, updated_at = NOW()
     WHERE id = $2 RETURNING id, memo`,
    [memo ?? null, id]
  );
  res.json(rows[0] ?? { id, memo });
});

// 注射/内服区分更新（treatment_category列が存在しないため、現状は常に'注射'を返す）
router.patch('/:id/category', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { treatment_category } = req.body;

  if (!['注射', '内服'].includes(treatment_category)) {
    res.status(400).json({ error: 'invalid treatment_category' });
    return;
  }

  // treatment_category列がDBに存在しないため、更新はスキップし固定値を返す
  res.json({ id: Number(id), treatment_category: '注射' });
});

// 採血結果保存
router.put('/:id/blood-results', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const fields = ['wbc','hgb','plt','anc','mono','cre','egfr','ast','alt','tbil','crp','ca','mg','up','upcr'];

  const values = fields.map(f => req.body[f] ?? null);

  await pool.query(
    `INSERT INTO blood_results (treatment_id, ${fields.join(', ')}, updated_at)
     VALUES ($1, ${fields.map((_, i) => `$${i + 2}`).join(', ')}, NOW())
     ON CONFLICT (treatment_id) DO UPDATE SET
       ${fields.map((f, i) => `${f} = $${i + 2}`).join(', ')},
       updated_at = NOW()`,
    [id, ...values]
  );

  res.json({ ok: true });
});

export default router;
