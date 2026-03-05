import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticateToken);

// GET /monthly?year=2025&month=3
router.get('/', async (req: AuthRequest, res: Response) => {
  const year  = parseInt(req.query.year  as string) || new Date().getFullYear();
  const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
  const from  = `${year}-${String(month).padStart(2,'0')}-01`;
  // 月末日
  const lastDay = new Date(year, month, 0).getDate();
  const to    = `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;

  const [injR, diaryR, intR, catR, phR, catDetailR] = await Promise.all([

    // 1. 注射集計（scheduled_treatments）
    pool.query(`
      SELECT
        COUNT(*)::int                                            AS inj_total,
        COUNT(*) FILTER (WHERE status = 'done')::int            AS inj_done,
        COUNT(*) FILTER (WHERE status = 'cancelled')::int       AS inj_cancelled,
        COUNT(*) FILTER (WHERE status = 'changed')::int         AS inj_changed
      FROM scheduled_treatments
      WHERE scheduled_date BETWEEN $1 AND $2
    `, [from, to]),

    // 2. 業務日誌集計（内服・手動入力）
    pool.query(`
      SELECT
        COALESCE(SUM(oral_scheduled)::int,         0) AS oral_scheduled,
        COALESCE(SUM(oral_done)::int,              0) AS oral_done,
        COALESCE(SUM(oral_cancelled)::int,         0) AS oral_cancelled,
        COALESCE(SUM(oral_changed)::int,           0) AS oral_changed,
        COALESCE(SUM(oral_patient_counseling)::int,0) AS oral_patient_counseling,
        COALESCE(SUM(oral_first_visit)::int,       0) AS oral_first_visit,
        COALESCE(SUM(oral_doubt)::int,             0) AS oral_doubt,
        COALESCE(SUM(oral_propose)::int,           0) AS oral_propose,
        COALESCE(SUM(oral_inquiry)::int,           0) AS oral_inquiry,
        COALESCE(SUM(patient_counseling)::int,     0) AS patient_counseling,
        COALESCE(SUM(first_visit_counseling)::int, 0) AS first_visit_counseling,
        COALESCE(SUM(allergy_stop)::int,           0) AS allergy_stop,
        COALESCE(SUM(regimen_check)::int,          0) AS regimen_check,
        COALESCE(SUM(regimen_operation)::int,      0) AS regimen_operation,
        COUNT(*)::int                                  AS diary_days
      FROM work_diaries
      WHERE diary_date BETWEEN $1 AND $2
    `, [from, to]),

    // 3. 注射介入集計
    pool.query(`
      SELECT
        COUNT(*)::int                                                  AS total,
        COUNT(*) FILTER (WHERE i.intervention_type = '疑義')::int      AS doubt_count,
        COUNT(*) FILTER (WHERE i.intervention_type = '提案')::int       AS propose_count,
        COUNT(*) FILTER (WHERE i.intervention_type = '問い合わせ')::int AS inquiry_count,
        COUNT(*) FILTER (WHERE i.prescription_changed = true)::int     AS presc_changed,
        COUNT(*) FILTER (WHERE i.proxy_prescription = true)::int       AS proxy_presc,
        COUNT(*) FILTER (WHERE i.case_candidate = true)::int           AS case_candidate,
        COUNT(*) FILTER (WHERE i.calc_cancer_guidance = true)::int     AS cancer_guidance,
        COUNT(*) FILTER (WHERE i.calc_pre_consultation = true)::int    AS pre_consultation
      FROM interventions i
      JOIN scheduled_treatments st ON st.id = i.treatment_id
      WHERE st.scheduled_date BETWEEN $1 AND $2
    `, [from, to]),

    // 4. 介入分類別件数
    pool.query(`
      SELECT
        i.intervention_category AS category,
        COUNT(*)::int           AS cnt
      FROM interventions i
      JOIN scheduled_treatments st ON st.id = i.treatment_id
      WHERE st.scheduled_date BETWEEN $1 AND $2
        AND i.intervention_category IS NOT NULL AND i.intervention_category <> ''
      GROUP BY i.intervention_category
      ORDER BY COUNT(*) DESC
    `, [from, to]),

    // 5. 薬剤師勤務時間（曜日別担当日数）
    pool.query(`
      SELECT
        wdp.pharmacist_name,
        COUNT(DISTINCT CASE WHEN EXTRACT(DOW FROM wd.diary_date) = 1 THEN wd.diary_date END)::int AS mon,
        COUNT(DISTINCT CASE WHEN EXTRACT(DOW FROM wd.diary_date) = 2 THEN wd.diary_date END)::int AS tue,
        COUNT(DISTINCT CASE WHEN EXTRACT(DOW FROM wd.diary_date) = 3 THEN wd.diary_date END)::int AS wed,
        COUNT(DISTINCT CASE WHEN EXTRACT(DOW FROM wd.diary_date) = 4 THEN wd.diary_date END)::int AS thu,
        COUNT(DISTINCT CASE WHEN EXTRACT(DOW FROM wd.diary_date) = 5 THEN wd.diary_date END)::int AS fri,
        COUNT(DISTINCT wd.diary_date)::int AS days,
        COALESCE(SUM(
          EXTRACT(EPOCH FROM (wdp.end_time::time - wdp.start_time::time)) / 60
          - CASE WHEN wdp.has_lunch THEN wdp.lunch_minutes ELSE 0 END
        )::int, 0) AS total_minutes
      FROM work_diary_pharmacists wdp
      JOIN work_diaries wd ON wd.id = wdp.diary_id
      WHERE wd.diary_date BETWEEN $1 AND $2
        AND wdp.pharmacist_name IS NOT NULL AND wdp.pharmacist_name <> ''
        AND wdp.start_time IS NOT NULL AND wdp.end_time IS NOT NULL
      GROUP BY wdp.pharmacist_name
      ORDER BY days DESC, wdp.pharmacist_name
    `, [from, to]),

    // 6. 介入分類×詳細 件数（drug_route別）
    pool.query(`
      SELECT
        i.intervention_category                AS category,
        i.intervention_detail                  AS detail,
        COALESCE(i.drug_route, '注射')         AS drug_route,
        COUNT(*)::int                          AS cnt
      FROM interventions i
      JOIN scheduled_treatments st ON st.id = i.treatment_id
      WHERE st.scheduled_date BETWEEN $1 AND $2
        AND i.intervention_category IS NOT NULL AND i.intervention_category <> ''
      GROUP BY i.intervention_category, i.intervention_detail, COALESCE(i.drug_route, '注射')
      ORDER BY COALESCE(i.drug_route, '注射'), i.intervention_category, i.intervention_detail
    `, [from, to]),
  ]);

  res.json({
    period:         { year, month, from, to },
    injection:      injR.rows[0]      || {},
    diary:          diaryR.rows[0]    || {},
    intervention:   intR.rows[0]      || {},
    categories:     catR.rows,
    pharmacists:    phR.rows,
    categoryDetails: catDetailR.rows,
  });
});

export default router;
