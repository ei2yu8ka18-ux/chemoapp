import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticateToken);

function calcBSA(heightCm: number, weightKg: number): number {
  return 0.007184 * Math.pow(heightCm, 0.725) * Math.pow(weightKg, 0.425);
}

// ── GET /api/regimen-check/patients ──────────────────────────
router.get('/patients', async (_req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT p.id, p.patient_no, p.name, p.furigana, p.department, p.doctor,
         p.dob, p.gender,
         (SELECT r.name FROM scheduled_treatments st
          JOIN regimens r ON r.id = st.regimen_id
          WHERE st.patient_id = p.id
          ORDER BY st.scheduled_date DESC LIMIT 1) AS latest_regimen,
         (SELECT COUNT(*) FROM regimen_audits ra WHERE ra.patient_id = p.id) AS audit_count
       FROM patients p
       ORDER BY p.patient_no`
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /patients error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/regimen-check/:patientId/detail ─────────────────
router.get('/:patientId/detail', async (req: AuthRequest, res: Response) => {
  try {
    const patientId = Number(req.params.patientId);

    const { rows: patRows } = await pool.query(
      `SELECT id, patient_no, name, furigana, department, doctor, diagnosis, dob, gender
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

    // 本日のオーダー
    const { rows: todayOrders } = await pool.query(
      `SELECT po.id, po.patient_id, po.order_date, po.drug_name,
         po.dose, po.dose_unit, po.route, po.is_antineoplastic
       FROM patient_orders po
       WHERE po.patient_id = $1
         AND po.order_date = CURRENT_DATE
       ORDER BY po.is_antineoplastic DESC, po.drug_name`,
      [patientId]
    );

    // 将来オーダー
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
        `SELECT id, patient_id, order_date, drug_name, dose, dose_unit, route, is_antineoplastic
         FROM patient_orders
         WHERE patient_id = $1 AND order_date = $2
         ORDER BY is_antineoplastic DESC, drug_name`,
        [patientId, futureDate]
      );
      futureOrders = rows;
    }

    // 治療歴（直近30件）: calendar_id も返す
    const { rows: treatmentHistory } = await pool.query(
      `SELECT st.id, st.scheduled_date, st.status, r.name AS regimen_name,
         st.regimen_id,
         rc.id AS calendar_id,
         rc.cycle_no,
         rc.audit_status,
         rc.status AS calendar_status,
         COALESCE(
           (SELECT STRING_AGG(
              po.drug_name || CASE WHEN po.dose IS NOT NULL
                THEN ' ' || po.dose::text || COALESCE(po.dose_unit, '') ELSE '' END,
              ' / ' ORDER BY po.drug_name)
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
         ) AS support_drugs
       FROM scheduled_treatments st
       JOIN regimens r ON r.id = st.regimen_id
       LEFT JOIN regimen_calendar rc ON rc.patient_id = st.patient_id
         AND rc.regimen_id = st.regimen_id
         AND rc.treatment_date = st.scheduled_date
       WHERE st.patient_id = $1
       ORDER BY st.scheduled_date DESC
       LIMIT 30`,
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
      treatmentHistory,
      futureSchedule,
      audits,
      doubts,
    });
  } catch (e) {
    console.error('GET /:patientId/detail error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/regimen-check/:patientId/audits ────────────────
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

// ── POST /api/regimen-check/:patientId/doubts ─────────────────
router.post('/:patientId/doubts', async (req: AuthRequest, res: Response) => {
  try {
    const patientId = Number(req.params.patientId);
    const { doubt_date, content, pharmacist_name } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO regimen_doubts (patient_id, doubt_date, content, pharmacist_name)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [patientId, doubt_date || new Date().toISOString().split('T')[0], content, pharmacist_name]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error('POST /doubts error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/regimen-check/doubts/:id ──────────────────────
router.patch('/doubts/:id', async (req: AuthRequest, res: Response) => {
  try {
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
  } catch (e) {
    console.error('PATCH /doubts/:id error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/regimen-check/patient-orders/:id ──────────────
// 投与量手入力
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

// ── POST /api/regimen-check/calendar/cycle ───────────────────
// Cycle番号のupsert（治療歴から編集）
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

// ── GET /api/regimen-check/calendar ─────────────────────────
// regimen_calendar + scheduled_treatments を統合して返す
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
             WHEN '実施' THEN 'done'
             WHEN '中止' THEN 'cancelled'
             WHEN '変更' THEN 'changed'
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
       SELECT c.id, c.patient_id, c.regimen_id, c.treatment_date,
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

// ── POST /api/regimen-check/calendar ────────────────────────
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
    // 患者情報を付与して返す
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

// ── PATCH /api/regimen-check/calendar/:id ───────────────────
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
    // 患者情報を付与
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

// ── PATCH /api/regimen-check/regimens/:id ────────────────────
// レジメン名変更
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

// ── PATCH /api/regimen-check/calendar/audit-status ──────────
// 監査ステータスの設定（監査済 → カレンダーに○を自動セット）
router.patch('/calendar/audit-status', async (req: AuthRequest, res: Response) => {
  try {
    const { patient_id, regimen_id, treatment_date, audit_status } = req.body;
    if (!patient_id || !regimen_id || !treatment_date) {
      res.status(400).json({ error: 'patient_id, regimen_id, treatment_date required' }); return;
    }
    const { rows } = await pool.query(
      `INSERT INTO regimen_calendar (patient_id, regimen_id, treatment_date, status, audit_status)
       VALUES ($1, $2, $3, 'planned', $4)
       ON CONFLICT (patient_id, regimen_id, treatment_date) DO UPDATE SET
         audit_status = $4,
         status = CASE
           WHEN $4 = 'audited' AND (regimen_calendar.status IS NULL OR regimen_calendar.status = '')
             THEN 'planned'
           ELSE regimen_calendar.status
         END
       RETURNING *`,
      [patient_id, regimen_id, treatment_date, audit_status]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error('PATCH /calendar/audit-status error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/regimen-check/calendar/audit-detail ─────────────
// 右クリック監査記録ポップアップ用
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
        `SELECT id, doubt_date, content, status, resolution, pharmacist_name
         FROM regimen_doubts
         WHERE patient_id = $1 AND (status = 'open' OR doubt_date = $2)
         ORDER BY CASE WHEN status = 'open' THEN 0 ELSE 1 END, doubt_date DESC`,
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

// ── GET /api/regimen-check/calendar/patients ─────────────────
// (patient_id, regimen_name) でグループ化して返す
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

export default router;
