import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticateToken);

// ── DBから自動集計 ─────────────────────────────────────────
async function calcAutoStats(date: string) {
  // 注射件数（treatment_category 列なし → 全件を注射として扱う）
  const { rows: statusRows } = await pool.query(
    `SELECT status, COUNT(*) AS cnt FROM scheduled_treatments
     WHERE scheduled_date = $1
     GROUP BY status`,
    [date]
  );
  const statusMap: Record<string, number> = {};
  statusRows.forEach((r: any) => { statusMap[r.status] = Number(r.cnt); });

  // 内服件数（treatment_category 列なし → 常に0）
  const oa: Record<string, number> = {};

  const { rows: intRows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE i.calc_cancer_guidance = true)      AS cancer_guidance,
       COUNT(*) FILTER (WHERE i.calc_pre_consultation = true)     AS pre_consultation,
       COUNT(*) FILTER (WHERE i.intervention_type = '疑義')      AS doubt,
       COUNT(*) FILTER (WHERE i.intervention_type = '提案')      AS propose,
       COUNT(*) FILTER (WHERE i.intervention_type = '問い合わせ') AS inquiry,
       COUNT(*) FILTER (WHERE i.prescription_changed = true)     AS presc_changed
     FROM interventions i
     JOIN scheduled_treatments st ON st.id = i.treatment_id
     WHERE st.scheduled_date = $1`,
    [date]
  );
  const ia = intRows[0] || {};

  return {
    inj_done:       statusMap['done']      || 0,
    inj_cancelled:  statusMap['cancelled'] || 0,
    inj_changed:    statusMap['changed']   || 0,
    inj_total:      (statusMap['done'] || 0) + (statusMap['cancelled'] || 0)
                  + (statusMap['changed'] || 0) + (statusMap['pending'] || 0),
    oral_total:     Number(oa.oral_total)     || 0,
    oral_done:      Number(oa.oral_done)      || 0,
    oral_cancelled: Number(oa.oral_cancelled) || 0,
    oral_changed:   Number(oa.oral_changed)   || 0,
    oral_scheduled: Number(oa.oral_pending)   || 0,
    cancer_guidance_count:  Number(ia.cancer_guidance)  || 0,
    pre_consultation_count: Number(ia.pre_consultation) || 0,
    doubt_count:   Number(ia.doubt)         || 0,
    propose_count: Number(ia.propose)       || 0,
    inquiry_count: Number(ia.inquiry)       || 0,
    presc_changed_count: Number(ia.presc_changed) || 0,
  };
}

// ── GET /workdiaries  → 日誌一覧 ─────────────────────────
router.get('/', async (_req: AuthRequest, res: Response) => {
  // 保存済み日誌を全件取得（薬剤師名も結合）
  const { rows } = await pool.query(
    `SELECT
       d.id, d.diary_date,
       d.patient_counseling, d.first_visit_counseling,
       d.oral_scheduled, d.oral_done, d.notes,
       COALESCE(
         string_agg(ph.pharmacist_name, '・' ORDER BY ph.sort_order, ph.id)
         FILTER (WHERE ph.pharmacist_name IS NOT NULL), ''
       ) AS pharmacist_names
     FROM work_diaries d
     LEFT JOIN work_diary_pharmacists ph ON ph.diary_id = d.id
     GROUP BY d.id
     ORDER BY d.diary_date DESC`
  );

  // 各日付の自動集計（介入数・注射実施数）も付加
  const results = await Promise.all(rows.map(async (r: any) => {
    const dateStr = r.diary_date instanceof Date
      ? r.diary_date.toISOString().split('T')[0]
      : String(r.diary_date).split('T')[0];

    const { rows: injRows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'done') AS inj_done,
         COUNT(*) AS inj_total
       FROM scheduled_treatments
       WHERE scheduled_date = $1`,
      [dateStr]
    );
    const { rows: intCntRows } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM interventions i
       JOIN scheduled_treatments st ON st.id = i.treatment_id
       WHERE st.scheduled_date = $1`,
      [dateStr]
    );
    return {
      ...r,
      diary_date: dateStr,
      inj_done:   Number(injRows[0]?.inj_done)  || 0,
      inj_total:  Number(injRows[0]?.inj_total) || 0,
      int_count:  Number(intCntRows[0]?.cnt)    || 0,
    };
  }));

  res.json(results);
});

// ── GET /workdiaries/:date ────────────────────────────────
router.get('/:date', async (req: AuthRequest, res: Response) => {
  const { date } = req.params;

  const auto = await calcAutoStats(date);

  const { rows: diaryRows } = await pool.query(
    `SELECT * FROM work_diaries WHERE diary_date = $1`, [date]
  );
  const diary = diaryRows[0] || null;

  let pharmacists: any[] = [];

  if (diary) {
    // 保存済み薬剤師一覧
    const { rows: phRows } = await pool.query(
      `SELECT * FROM work_diary_pharmacists WHERE diary_id = $1 ORDER BY sort_order, id`,
      [diary.id]
    );
    pharmacists = phRows;
  } else {
    // 未保存 → ユーザーの主担当・副担当曜日から自動設定
    const dayOfWeek = new Date(date).getDay(); // 0=日 1=月 ... 6=土

    const { rows: primaryUsers } = await pool.query(
      `SELECT display_name FROM users
       WHERE is_active = true AND role = 'pharmacist'
         AND $1 = ANY(primary_days)
       ORDER BY id`,
      [dayOfWeek]
    );
    const { rows: secondaryUsers } = await pool.query(
      `SELECT display_name FROM users
       WHERE is_active = true AND role = 'pharmacist'
         AND $1 = ANY(secondary_days)
       ORDER BY id`,
      [dayOfWeek]
    );

    let order = 0;
    for (const u of primaryUsers) {
      pharmacists.push({
        sort_order: order++,
        pharmacist_name: u.display_name,
        start_time: '08:30',
        end_time: '17:30',
        has_lunch: true,
        lunch_minutes: 60,
        is_primary: true,
      });
    }
    for (const u of secondaryUsers) {
      pharmacists.push({
        sort_order: order++,
        pharmacist_name: u.display_name,
        start_time: '08:30',
        end_time: '17:30',
        has_lunch: true,
        lunch_minutes: 60,
        is_primary: false,
      });
    }
  }

  // 介入記録一覧
  const { rows: interventions } = await pool.query(
    `SELECT i.*,
       p.patient_no, p.name AS patient_name, p.department, p.doctor,
       r.name AS regimen_name
     FROM interventions i
     JOIN scheduled_treatments st ON st.id = i.treatment_id
     JOIN patients p ON p.id = st.patient_id
     JOIN regimens r ON r.id = st.regimen_id
     WHERE st.scheduled_date = $1
     ORDER BY i.recorded_at`,
    [date]
  );

  res.json({ diary, pharmacists, auto, interventions });
});

// ── PATCH /workdiaries/:date/increment ───────────────────────
// delta=1（デフォルト）でカウントアップ、delta=-1でデクリメント
router.patch('/:date/increment', async (req: AuthRequest, res: Response) => {
  const { date } = req.params;
  const { field } = req.body;
  const delta = typeof req.body.delta === 'number' ? req.body.delta : 1;

  const ALLOWED: string[] = [
    'regimen_operation', 'allergy_stop', 'regimen_check',
    'patient_counseling', 'first_visit_counseling',
  ];
  if (!ALLOWED.includes(field)) {
    res.status(400).json({ error: 'Invalid field' });
    return;
  }

  // UPSERT して delta 分加算（最小0）
  const { rows } = await pool.query(
    `INSERT INTO work_diaries (diary_date, "${field}")
     VALUES ($1, GREATEST(0, $2::int))
     ON CONFLICT (diary_date) DO UPDATE
     SET "${field}" = GREATEST(0, COALESCE(work_diaries."${field}", 0) + $2::int),
         updated_at = NOW()
     RETURNING "${field}" AS new_value`,
    [date, delta]
  );
  res.json({ field, new_value: Number(rows[0].new_value) });
});

// ── PUT /workdiaries/:date ─────────────────────────────────
router.put('/:date', async (req: AuthRequest, res: Response) => {
  const { date } = req.params;
  const {
    patient_counseling, first_visit_counseling, allergy_stop,
    regimen_check, regimen_operation,
    oral_scheduled, oral_done, oral_cancelled, oral_changed,
    oral_patient_counseling, oral_first_visit,
    oral_doubt, oral_propose, oral_inquiry,
    notes, pharmacists,
  } = req.body;

  const { rows } = await pool.query(
    `INSERT INTO work_diaries (
       diary_date,
       patient_counseling, first_visit_counseling, allergy_stop,
       regimen_check, regimen_operation,
       oral_scheduled, oral_done, oral_cancelled, oral_changed,
       oral_patient_counseling, oral_first_visit,
       oral_doubt, oral_propose, oral_inquiry,
       notes, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
     ON CONFLICT (diary_date) DO UPDATE SET
       patient_counseling     = EXCLUDED.patient_counseling,
       first_visit_counseling = EXCLUDED.first_visit_counseling,
       allergy_stop           = EXCLUDED.allergy_stop,
       regimen_check          = EXCLUDED.regimen_check,
       regimen_operation      = EXCLUDED.regimen_operation,
       oral_scheduled         = EXCLUDED.oral_scheduled,
       oral_done              = EXCLUDED.oral_done,
       oral_cancelled         = EXCLUDED.oral_cancelled,
       oral_changed           = EXCLUDED.oral_changed,
       oral_patient_counseling= EXCLUDED.oral_patient_counseling,
       oral_first_visit       = EXCLUDED.oral_first_visit,
       oral_doubt             = EXCLUDED.oral_doubt,
       oral_propose           = EXCLUDED.oral_propose,
       oral_inquiry           = EXCLUDED.oral_inquiry,
       notes                  = EXCLUDED.notes,
       updated_at             = NOW()
     RETURNING id`,
    [
      date,
      patient_counseling || 0, first_visit_counseling || 0, allergy_stop || 0,
      regimen_check || 0, regimen_operation || 0,
      oral_scheduled || 0, oral_done || 0, oral_cancelled || 0, oral_changed || 0,
      oral_patient_counseling || 0, oral_first_visit || 0,
      oral_doubt || 0, oral_propose || 0, oral_inquiry || 0,
      notes || null,
    ]
  );
  const diaryId = rows[0].id;

  await pool.query(`DELETE FROM work_diary_pharmacists WHERE diary_id = $1`, [diaryId]);
  if (Array.isArray(pharmacists) && pharmacists.length > 0) {
    for (const ph of pharmacists) {
      await pool.query(
        `INSERT INTO work_diary_pharmacists
           (diary_id, sort_order, pharmacist_name, start_time, end_time, has_lunch, lunch_minutes)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          diaryId, ph.sort_order ?? 0,
          ph.pharmacist_name || null,
          ph.start_time || null, ph.end_time || null,
          ph.has_lunch ?? false, ph.lunch_minutes ?? 60,
        ]
      );
    }
  }

  res.json({ ok: true, id: diaryId });
});

export default router;
