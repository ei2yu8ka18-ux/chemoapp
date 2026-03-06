import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticateToken);

// GET /annual?year=2025
router.get('/', async (req: AuthRequest, res: Response) => {
  const year = parseInt(req.query.year as string) || new Date().getFullYear();

  const [injR, diaryR, intR, deptR, catR, regR] = await Promise.all([

    // 1. 月別注射集計（scheduled_treatments）
    pool.query(`
      SELECT
        EXTRACT(MONTH FROM scheduled_date)::int          AS month,
        COUNT(*)::int                                    AS inj_total,
        COUNT(*) FILTER (WHERE status = 'done')::int     AS inj_done,
        COUNT(*) FILTER (WHERE status = 'cancelled')::int AS inj_cancelled,
        COUNT(*) FILTER (WHERE status = 'changed')::int  AS inj_changed,
        COUNT(*) FILTER (WHERE status = 'pending')::int  AS inj_pending
      FROM scheduled_treatments
      WHERE EXTRACT(YEAR FROM scheduled_date) = $1
      GROUP BY month
      ORDER BY month
    `, [year]),

    // 2. 月別内服集計（業務日誌）
    pool.query(`
      SELECT
        EXTRACT(MONTH FROM diary_date)::int              AS month,
        COALESCE(SUM(oral_scheduled)::int,  0)          AS oral_scheduled,
        COALESCE(SUM(oral_done)::int,       0)          AS oral_done,
        COALESCE(SUM(oral_cancelled)::int,  0)          AS oral_cancelled,
        COALESCE(SUM(oral_changed)::int,    0)          AS oral_changed
      FROM work_diaries
      WHERE EXTRACT(YEAR FROM diary_date) = $1
      GROUP BY month
      ORDER BY month
    `, [year]),

    // 3. 月別介入集計
    pool.query(`
      SELECT
        EXTRACT(MONTH FROM st.scheduled_date)::int                     AS month,
        COUNT(*)::int                                                   AS total,
        COUNT(*) FILTER (WHERE i.intervention_type = '提案')::int       AS propose_count,
        COUNT(*) FILTER (WHERE i.intervention_type = '疑義')::int       AS doubt_count,
        COUNT(*) FILTER (WHERE i.intervention_type = '問い合わせ')::int AS inquiry_count,
        COUNT(*) FILTER (WHERE i.prescription_changed = true)::int     AS presc_changed,
        COUNT(*) FILTER (WHERE i.calc_cancer_guidance = true)::int     AS cancer_guidance,
        COUNT(*) FILTER (WHERE i.calc_pre_consultation = true)::int    AS pre_consultation
      FROM interventions i
      JOIN scheduled_treatments st ON st.id = i.treatment_id
      WHERE EXTRACT(YEAR FROM st.scheduled_date) = $1
      GROUP BY month
      ORDER BY month
    `, [year]),

    // 4. 診療科×月別実施件数
    pool.query(`
      SELECT
        COALESCE(NULLIF(TRIM(p.department), ''), '（未設定）') AS department,
        EXTRACT(MONTH FROM st.scheduled_date)::int             AS month,
        COUNT(*)::int                                          AS total,
        COUNT(*) FILTER (WHERE st.status = 'done')::int        AS done
      FROM scheduled_treatments st
      JOIN patients p ON st.patient_id = p.id
      WHERE EXTRACT(YEAR FROM st.scheduled_date) = $1
      GROUP BY p.department, month
      ORDER BY p.department, month
    `, [year]),

    // 5. 介入分類別年間集計
    pool.query(`
      SELECT
        i.intervention_category AS category,
        COUNT(*)::int           AS cnt
      FROM interventions i
      JOIN scheduled_treatments st ON st.id = i.treatment_id
      WHERE EXTRACT(YEAR FROM st.scheduled_date) = $1
        AND i.intervention_category IS NOT NULL
        AND i.intervention_category <> ''
      GROUP BY i.intervention_category
      ORDER BY cnt DESC
    `, [year]),

    // 6. 主要レジメン年間実施件数（上位25）
    pool.query(`
      SELECT
        r.name   AS regimen_name,
        COUNT(*) ::int AS done_count
      FROM scheduled_treatments st
      JOIN regimens r ON st.regimen_id = r.id
      WHERE EXTRACT(YEAR FROM st.scheduled_date) = $1
        AND st.status = 'done'
      GROUP BY r.name
      ORDER BY done_count DESC
      LIMIT 25
    `, [year]),
  ]);

  res.json({
    year,
    months_inj:   injR.rows,
    months_diary: diaryR.rows,
    months_int:   intR.rows,
    departments:  deptR.rows,
    categories:   catR.rows,
    regimens:     regR.rows,
  });
});

export default router;
