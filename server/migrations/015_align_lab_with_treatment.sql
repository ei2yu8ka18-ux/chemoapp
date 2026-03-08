-- =====================================================================
-- Migration 015: 採血データ日付を投与日に合わせ / グラフ治療マーク用
-- patient_lab_history の日付が scheduled_treatments と一致するように
-- ① 採血日と同じ日付の scheduled_treatments がない場合に挿入
-- ② 採血日と同じ日付の patient_orders がない場合に今日のオーダーをコピー
-- ③ 過去の scheduled_treatments に regimen_calendar エントリを自動生成
-- =====================================================================

-- ── ① 採血日に対応する過去 scheduled_treatments を挿入 ───────────────
INSERT INTO scheduled_treatments
  (patient_id, regimen_id, scheduled_date, status, prescription_received)
SELECT DISTINCT
  plh.patient_id,
  (
    SELECT regimen_id FROM scheduled_treatments st2
    WHERE st2.patient_id = plh.patient_id
    ORDER BY st2.scheduled_date DESC LIMIT 1
  ) AS regimen_id,
  plh.lab_date  AS scheduled_date,
  'done'        AS status,
  TRUE          AS prescription_received
FROM patient_lab_history plh
WHERE plh.lab_date < CURRENT_DATE
  AND NOT EXISTS (
    SELECT 1 FROM scheduled_treatments st
    WHERE st.patient_id = plh.patient_id
      AND st.scheduled_date = plh.lab_date
  )
  AND EXISTS (
    SELECT 1 FROM scheduled_treatments st3
    WHERE st3.patient_id = plh.patient_id
  )
ON CONFLICT DO NOTHING;

-- ── ② 過去の採血日に patient_orders をコピー（今日のオーダーベース） ───
INSERT INTO patient_orders
  (patient_id, order_date, order_no, drug_name, dose, dose_unit,
   route, days, regimen_name, order_type, is_antineoplastic)
SELECT
  po.patient_id,
  plh.lab_date        AS order_date,
  NULL                AS order_no,
  po.drug_name,
  po.dose,
  po.dose_unit,
  po.route,
  po.days,
  po.regimen_name,
  po.order_type,
  po.is_antineoplastic
FROM patient_orders po
JOIN patient_lab_history plh
  ON plh.patient_id = po.patient_id
  AND plh.lab_date < CURRENT_DATE
WHERE po.order_date = CURRENT_DATE
  AND NOT EXISTS (
    SELECT 1 FROM patient_orders po2
    WHERE po2.patient_id = plh.patient_id
      AND po2.order_date = plh.lab_date
      AND po2.drug_name = po.drug_name
  )
ON CONFLICT DO NOTHING;

-- ── ③ 過去の scheduled_treatments に regimen_calendar を自動生成 ───────
INSERT INTO regimen_calendar
  (patient_id, regimen_id, treatment_date, status, cycle_no)
SELECT DISTINCT
  st.patient_id,
  st.regimen_id,
  st.scheduled_date,
  'done'  AS status,
  ROW_NUMBER() OVER (
    PARTITION BY st.patient_id, st.regimen_id
    ORDER BY st.scheduled_date
  ) AS cycle_no
FROM scheduled_treatments st
WHERE st.scheduled_date < CURRENT_DATE
  AND st.status = 'done'
  AND NOT EXISTS (
    SELECT 1 FROM regimen_calendar rc
    WHERE rc.patient_id = st.patient_id
      AND rc.regimen_id = st.regimen_id
      AND rc.treatment_date = st.scheduled_date
  )
ON CONFLICT (patient_id, regimen_id, treatment_date) DO NOTHING;
