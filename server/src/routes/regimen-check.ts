import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticateToken);

// DuBois BSA formula: BSA(m²) = 0.007184 × H(cm)^0.725 × W(kg)^0.425
function calcBSA(heightCm: number, weightKg: number): number {
  return 0.007184 * Math.pow(heightCm, 0.725) * Math.pow(weightKg, 0.425);
}

// ── GET /api/regimen-check/patients ──────────────────────────
// 患者一覧（当日予定患者 + 全患者）
router.get('/patients', async (_req: AuthRequest, res: Response) => {
  const { rows } = await pool.query(
    `SELECT DISTINCT p.id, p.patient_no, p.name, p.furigana, p.department, p.doctor,
       p.dob, p.gender,
       (SELECT r.name FROM scheduled_treatments st
        JOIN regimens r ON r.id = st.regimen_id
        WHERE st.patient_id = p.id
        ORDER BY st.scheduled_date DESC LIMIT 1) AS latest_regimen,
       (SELECT st.scheduled_date FROM scheduled_treatments st
        WHERE st.patient_id = p.id
        ORDER BY st.scheduled_date DESC LIMIT 1) AS last_treatment_date,
       (SELECT COUNT(*) FROM regimen_audits ra WHERE ra.patient_id = p.id) AS audit_count
     FROM patients p
     ORDER BY p.patient_no`
  );
  res.json(rows);
});

// ── GET /api/regimen-check/:patientId/detail ─────────────────
router.get('/:patientId/detail', async (req: AuthRequest, res: Response) => {
  const patientId = Number(req.params.patientId);

  // 患者基本情報
  const { rows: patRows } = await pool.query(
    `SELECT id, patient_no, name, furigana, department, doctor, diagnosis, dob, gender
     FROM patients WHERE id = $1`,
    [patientId]
  );
  if (!patRows.length) { res.status(404).json({ error: 'Patient not found' }); return; }
  const patient = patRows[0];

  // 体格履歴（過去13ヶ月）
  const { rows: vitals } = await pool.query(
    `SELECT measured_date, height_cm, weight_kg
     FROM patient_vitals
     WHERE patient_id = $1
       AND measured_date >= CURRENT_DATE - INTERVAL '13 months'
     ORDER BY measured_date`,
    [patientId]
  );

  // BSA 計算付き体格履歴
  const vitalsWithBSA = vitals.map((v: any) => ({
    ...v,
    bsa: (v.height_cm && v.weight_kg)
      ? Math.round(calcBSA(Number(v.height_cm), Number(v.weight_kg)) * 100) / 100
      : null,
  }));

  // 最新身長（最新レコードから）
  const latestVital = vitals[vitals.length - 1] || null;

  // 検査値履歴（過去13ヶ月）
  const { rows: labs } = await pool.query(
    `SELECT lab_date, wbc, anc, plt, hgb, mono, cre, egfr, ast, alt, tbil, crp
     FROM patient_lab_history
     WHERE patient_id = $1
       AND lab_date >= CURRENT_DATE - INTERVAL '13 months'
     ORDER BY lab_date`,
    [patientId]
  );

  // 既往歴
  const { rows: medHistory } = await pool.query(
    `SELECT id, condition_name, onset_date, end_date, notes
     FROM patient_medical_history
     WHERE patient_id = $1
     ORDER BY onset_date NULLS LAST`,
    [patientId]
  );

  // 本日のオーダー
  const { rows: todayOrders } = await pool.query(
    `SELECT po.*, r.name AS regimen_name
     FROM patient_orders po
     LEFT JOIN regimens r ON r.id = (
       SELECT st.regimen_id FROM scheduled_treatments st
       WHERE st.patient_id = po.patient_id
         AND st.scheduled_date = CURRENT_DATE
       LIMIT 1
     )
     WHERE po.patient_id = $1
       AND po.order_date = CURRENT_DATE
     ORDER BY po.is_antineoplastic DESC, po.drug_name`,
    [patientId]
  );

  // 直近将来オーダー（今日以降最初の日付）
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
      `SELECT * FROM patient_orders
       WHERE patient_id = $1 AND order_date = $2
       ORDER BY is_antineoplastic DESC, drug_name`,
      [patientId, futureDate]
    );
    futureOrders = rows;
  }

  // scheduled_treatments から本日のレジメン情報
  const { rows: todayTreatments } = await pool.query(
    `SELECT st.id, st.scheduled_date, st.scheduled_time, st.status,
       r.name AS regimen_name, st.treatment_category,
       st.memo, st.prescription_received
     FROM scheduled_treatments st
     JOIN regimens r ON r.id = st.regimen_id
     WHERE st.patient_id = $1
       AND st.scheduled_date = CURRENT_DATE
     ORDER BY st.scheduled_time NULLS LAST`,
    [patientId]
  );

  // 直近の過去3回の scheduled_treatments（履歴）
  const { rows: recentTreatments } = await pool.query(
    `SELECT st.id, st.scheduled_date, st.status,
       r.name AS regimen_name
     FROM scheduled_treatments st
     JOIN regimens r ON r.id = st.regimen_id
     WHERE st.patient_id = $1
       AND st.scheduled_date < CURRENT_DATE
     ORDER BY st.scheduled_date DESC LIMIT 6`,
    [patientId]
  );

  // 監査記録
  const { rows: audits } = await pool.query(
    `SELECT id, audit_date, pharmacist_name, comment, handover_note, created_at
     FROM regimen_audits
     WHERE patient_id = $1
     ORDER BY audit_date DESC, created_at DESC
     LIMIT 20`,
    [patientId]
  );

  // 疑義照会
  const { rows: doubts } = await pool.query(
    `SELECT id, doubt_date, content, status, resolution, pharmacist_name, resolved_at, created_at
     FROM regimen_doubts
     WHERE patient_id = $1
     ORDER BY
       CASE WHEN status = 'open' THEN 0 ELSE 1 END,
       doubt_date DESC`,
    [patientId]
  );

  res.json({
    patient: { ...patient, latest_vital: latestVital },
    vitals: vitalsWithBSA,
    labs,
    medHistory,
    todayOrders,
    futureOrders,
    todayTreatments,
    recentTreatments,
    audits,
    doubts,
  });
});

// ── POST /api/regimen-check/:patientId/audits ────────────────
router.post('/:patientId/audits', async (req: AuthRequest, res: Response) => {
  const patientId = Number(req.params.patientId);
  const { audit_date, pharmacist_name, comment, handover_note } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO regimen_audits (patient_id, audit_date, pharmacist_name, comment, handover_note)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [patientId, audit_date || 'CURRENT_DATE', pharmacist_name, comment, handover_note]
  );
  res.json(rows[0]);
});

// ── GET /api/regimen-check/:patientId/doubts ─────────────────
router.get('/:patientId/doubts', async (req: AuthRequest, res: Response) => {
  const patientId = Number(req.params.patientId);
  const { rows } = await pool.query(
    `SELECT * FROM regimen_doubts WHERE patient_id = $1
     ORDER BY CASE WHEN status='open' THEN 0 ELSE 1 END, doubt_date DESC`,
    [patientId]
  );
  res.json(rows);
});

// ── POST /api/regimen-check/:patientId/doubts ────────────────
router.post('/:patientId/doubts', async (req: AuthRequest, res: Response) => {
  const patientId = Number(req.params.patientId);
  const { doubt_date, content, pharmacist_name } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO regimen_doubts (patient_id, doubt_date, content, pharmacist_name)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [patientId, doubt_date || new Date().toISOString().split('T')[0], content, pharmacist_name]
  );
  res.json(rows[0]);
});

// ── PATCH /api/regimen-check/doubts/:id ──────────────────────
router.patch('/doubts/:id', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status, resolution } = req.body;
  const { rows } = await pool.query(
    `UPDATE regimen_doubts
     SET status = $2,
         resolution = $3,
         resolved_at = CASE WHEN $2 = 'resolved' THEN NOW() ELSE NULL END
     WHERE id = $1 RETURNING *`,
    [id, status, resolution]
  );
  res.json(rows[0]);
});

// ── GET /api/regimen-check/calendar ─────────────────────────
router.get('/calendar', async (req: AuthRequest, res: Response) => {
  const { from, to } = req.query;
  const fromDate = from || (() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().split('T')[0];
  })();
  const toDate = to || (() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().split('T')[0];
  })();

  const { rows } = await pool.query(
    `SELECT rc.id, rc.patient_id, rc.regimen_id, rc.treatment_date,
       rc.cycle_no, rc.status, rc.audit_status, rc.notes, rc.scheduled_treatment_id,
       p.patient_no, p.name AS patient_name, p.department, p.doctor,
       r.name AS regimen_name
     FROM regimen_calendar rc
     JOIN patients p ON p.id = rc.patient_id
     JOIN regimens r ON r.id = rc.regimen_id
     WHERE rc.treatment_date BETWEEN $1 AND $2
     ORDER BY p.patient_no, r.name, rc.treatment_date`,
    [fromDate, toDate]
  );
  res.json(rows);
});

// ── POST /api/regimen-check/calendar ────────────────────────
router.post('/calendar', async (req: AuthRequest, res: Response) => {
  const { patient_id, regimen_id, treatment_date, cycle_no, status, audit_status, notes } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO regimen_calendar (patient_id, regimen_id, treatment_date, cycle_no, status, audit_status, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (patient_id, regimen_id, treatment_date) DO UPDATE SET
       status = EXCLUDED.status, audit_status = EXCLUDED.audit_status,
       cycle_no = EXCLUDED.cycle_no, notes = EXCLUDED.notes
     RETURNING *`,
    [patient_id, regimen_id, treatment_date, cycle_no || 1, status || 'planned', audit_status || null, notes || null]
  );
  res.json(rows[0]);
});

// ── PATCH /api/regimen-check/calendar/:id ───────────────────
router.patch('/calendar/:id', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status, audit_status, notes } = req.body;
  const { rows } = await pool.query(
    `UPDATE regimen_calendar
     SET status = COALESCE($2, status),
         audit_status = $3,
         notes = COALESCE($4, notes)
     WHERE id = $1 RETURNING *`,
    [id, status, audit_status, notes]
  );
  if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(rows[0]);
});

// ── GET /api/regimen-check/calendar/patients ──────────────────
// カレンダー表示用の患者×レジメン一覧
router.get('/calendar/patients', async (_req: AuthRequest, res: Response) => {
  const { rows } = await pool.query(
    `SELECT DISTINCT p.id AS patient_id, p.patient_no, p.name AS patient_name,
       p.department, r.id AS regimen_id, r.name AS regimen_name
     FROM regimen_calendar rc
     JOIN patients p ON p.id = rc.patient_id
     JOIN regimens r ON r.id = rc.regimen_id
     ORDER BY p.patient_no, r.name`
  );
  res.json(rows);
});

export default router;
