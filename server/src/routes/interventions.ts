import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticateToken);

// 患者情報をJOINした基本クエリ
const FULL_SELECT = `
  SELECT
    i.*,
    p.patient_no,
    p.name    AS patient_name,
    p.department,
    p.doctor,
    p.diagnosis,
    r.name    AS regimen_name,
    st.scheduled_date,
    st.scheduled_date AS treatment_date
  FROM interventions i
  JOIN scheduled_treatments st ON st.id = i.treatment_id
  JOIN patients p ON p.id = st.patient_id
  JOIN regimens r ON r.id = st.regimen_id
`;

// ── 月次介入報告書（分類・詳細でソート）────────────────────
router.get('/report', async (req: AuthRequest, res: Response) => {
  const year  = parseInt(req.query.year  as string) || new Date().getFullYear();
  const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
  const from  = `${year}-${String(month).padStart(2,'0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to    = `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;

  const { rows } = await pool.query(
    FULL_SELECT +
    `WHERE st.scheduled_date BETWEEN $1 AND $2
     ORDER BY i.intervention_category NULLS LAST, i.intervention_detail NULLS LAST, st.scheduled_date, i.recorded_at`,
    [from, to]
  );
  res.json(rows);
});

// 一覧取得（treatmentId / date / dateFrom・dateTo / 全件）
router.get('/', async (req: AuthRequest, res: Response) => {
  const { treatmentId, date, dateFrom, dateTo } = req.query;
  const params: (string | number)[] = [];

  if (treatmentId) {
    const { rows } = await pool.query(
      FULL_SELECT + ` WHERE i.treatment_id = $1 ORDER BY i.recorded_at DESC`,
      [Number(treatmentId)]
    );
    return res.json(rows);
  }

  if (date) {
    const { rows } = await pool.query(
      FULL_SELECT + ` WHERE st.scheduled_date = $1 ORDER BY i.recorded_at`,
      [date as string]
    );
    return res.json(rows);
  }

  const conditions: string[] = [];
  if (dateFrom) { params.push(dateFrom as string); conditions.push(`st.scheduled_date >= $${params.length}`); }
  if (dateTo)   { params.push(dateTo   as string); conditions.push(`st.scheduled_date <= $${params.length}`); }

  const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    FULL_SELECT + where + ` ORDER BY st.scheduled_date DESC, i.recorded_at DESC LIMIT 1000`,
    params
  );
  res.json(rows);
});

// 介入記録登録
router.post('/', async (req: AuthRequest, res: Response) => {
  const {
    treatment_id, record_id,
    intervention_type, consultation_timing,
    calc_cancer_guidance, calc_pre_consultation,
    intervention_category, intervention_detail,
    intervention_content, pharmacist_name, memo,
    prescription_changed, proxy_prescription, case_candidate,
    drug_route,
  } = req.body;

  const finalRecordId = record_id || (() => {
    const n = new Date();
    return `${n.getFullYear()}${String(n.getMonth()+1).padStart(2,'0')}${String(n.getDate()).padStart(2,'0')}${String(n.getHours()).padStart(2,'0')}${String(n.getMinutes()).padStart(2,'0')}${String(n.getSeconds()).padStart(2,'0')}`;
  })();

  const { rows } = await pool.query(
    `INSERT INTO interventions (
       treatment_id, record_id,
       intervention_type, consultation_timing,
       calc_cancer_guidance, calc_pre_consultation,
       intervention_category, intervention_detail,
       intervention_content, pharmacist_name, memo,
       prescription_changed, proxy_prescription, case_candidate,
       drug_route
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (record_id) DO NOTHING
     RETURNING *`,
    [
      treatment_id, finalRecordId,
      intervention_type || null, consultation_timing || null,
      calc_cancer_guidance || false, calc_pre_consultation || false,
      intervention_category || null, intervention_detail || null,
      intervention_content || null, pharmacist_name || null, memo || null,
      prescription_changed || false, proxy_prescription || false, case_candidate || false,
      drug_route || '注射',
    ]
  );
  res.json(rows[0] ?? {});
});

export default router;
