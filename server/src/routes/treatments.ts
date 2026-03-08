import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticateToken);

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
      COALESCE(st.treatment_category, '注射') AS treatment_category,
      p.patient_no,
      p.name AS patient_name,
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

  res.json(rows);
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
      `UPDATE regimen_calendar
       SET status = $1, updated_at = NOW()
       WHERE patient_id = $2
         AND regimen_id = $3
         AND treatment_date = $4`,
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

// 注射/内服区分更新
router.patch('/:id/category', async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { treatment_category } = req.body;

  if (!['注射', '内服'].includes(treatment_category)) {
    res.status(400).json({ error: 'invalid treatment_category' });
    return;
  }

  const { rows } = await pool.query(
    `UPDATE scheduled_treatments
     SET treatment_category = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, treatment_category`,
    [treatment_category, id]
  );
  res.json(rows[0] ?? { id, treatment_category });
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
