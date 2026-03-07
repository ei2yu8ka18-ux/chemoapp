-- =====================================================================
-- Migration 011: テストデータ全補充
-- 対象: scheduled_treatments(本日), 患者追加, ユーザー追加,
--       interventions, blood_results, work_diaries, pre_consult_departments
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. レジメン追加
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO regimens (id, name, description) VALUES
  (8,  'CHOP',              'シクロ+ドキソ+ビンクリ+プレドニゾロン'),
  (9,  'R-CHOP',            'リツキシマブ+CHOP'),
  (10, 'GEM+nab-PTX',       'ゲムシタビン+ナブパクリタキセル'),
  (11, 'TC',                'パクリタキセル+カルボプラチン'),
  (12, 'CBDCA+PEM',         'カルボプラチン+ペメトレキセド'),
  (13, 'BEP',               'ブレオ+エトポシド+シスプラチン'),
  (14, 'トラスツズマブ単剤', 'ハーセプチン単剤療法')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 2. ユーザー追加
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO users (username, password_hash, display_name, role) VALUES
  ('ph03',    '$2b$10$dummy.hash.for.test.data.ph03xxxxxxxxxxxxx', '田中 正雄',   'pharmacist'),
  ('ph04',    '$2b$10$dummy.hash.for.test.data.ph04xxxxxxxxxxxxx', '木村 陽子',   'pharmacist'),
  ('ph05',    '$2b$10$dummy.hash.for.test.data.ph05xxxxxxxxxxxxx', '中村 拓也',   'pharmacist'),
  ('nurse02', '$2b$10$dummy.hash.for.test.data.nurse02xxxxxxxxxx', '佐藤 みゆき', 'nurse'),
  ('nurse03', '$2b$10$dummy.hash.for.test.data.nurse03xxxxxxxxxx', '高橋 里奈',   'nurse')
ON CONFLICT (username) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 3. 患者追加（計15名体制）
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO patients (id, patient_no, name, furigana, department, doctor, diagnosis, dob, gender) VALUES
  ( 8, '4012345', '橋本 悠樹',  'ハシモト ユウキ',  '外科',   '田村', '胃Cancer術後',       '1958-11-03', 'M'),
  ( 9, '4023456', '伊藤 春菜',  'イトウ ハルナ',    '呼吸器', '松本', '肺腺癌 stage IVA',   '1965-04-22', 'F'),
  (10, '4034567', '渡辺 康雄',  'ワタナベ ヤスオ',  '血液内', '坂本', '悪性リンパ腫 DLBCL', '1952-08-15', 'M'),
  (11, '4045678', '田村 知恵子','タムラ チエコ',    '婦人科', '古川', '卵巣Cancer stage III','1970-02-28', 'F'),
  (12, '4056789', '松本 健司',  'マツモト ケンジ',  '頭頸部', '西田', '中咽頭Cancer',       '1961-09-10', 'M'),
  (13, '4067890', '小林 幸子',  'コバヤシ サチコ',  '乳腺科', '西江', '乳Cancer HER2(+)',   '1975-06-14', 'F'),
  (14, '4078901', '加藤 浩二',  'カトウ コウジ',    '消化内', '黄',  '大腸Cancer stage III','1963-01-25', 'M'),
  (15, '4089012', '斎藤 奈緒',  'サイトウ ナオ',    '腫瘍内', '山口','膵Cancer',           '1968-12-05', 'F')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 4. 既存患者の診断名を補完
-- ─────────────────────────────────────────────────────────────────────
UPDATE patients SET diagnosis = '前立腺Cancer',      dob = '1957-03-18', gender = 'M' WHERE id = 3 AND (diagnosis IS NULL OR diagnosis = '');
UPDATE patients SET diagnosis = '乳Cancer HER2(+)',  dob = '1972-07-09', gender = 'F' WHERE id = 4 AND (diagnosis IS NULL OR diagnosis = '');
UPDATE patients SET diagnosis = 'リウマチ性関節炎',  dob = '1955-10-22', gender = 'M' WHERE id = 6 AND (diagnosis IS NULL OR diagnosis = '');

-- ─────────────────────────────────────────────────────────────────────
-- 5. 本日（CURRENT_DATE）の scheduled_treatments
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO scheduled_treatments (patient_id, regimen_id, scheduled_date, status, scheduled_time, prescription_received) VALUES
  (1,  1,  CURRENT_DATE, 'done',      '09:00', true),
  (2,  2,  CURRENT_DATE, 'done',      '09:30', true),
  (3,  3,  CURRENT_DATE, 'pending',   '10:00', false),
  (4,  4,  CURRENT_DATE, 'done',      '10:30', true),
  (5,  5,  CURRENT_DATE, 'pending',   '11:00', false),
  (6,  6,  CURRENT_DATE, 'cancelled', NULL,    false),
  (7,  7,  CURRENT_DATE, 'pending',   '13:00', false),
  (8,  1,  CURRENT_DATE, 'done',      '09:15', true),
  (9,  12, CURRENT_DATE, 'pending',   '10:15', false),
  (10, 9,  CURRENT_DATE, 'done',      '11:30', true),
  (11, 11, CURRENT_DATE, 'pending',   '13:30', false),
  (13, 14, CURRENT_DATE, 'done',      '09:45', true),
  (14, 1,  CURRENT_DATE, 'pending',   '14:00', false),
  (15, 10, CURRENT_DATE, 'pending',   '14:30', false)
ON CONFLICT DO NOTHING;

-- 1週後
INSERT INTO scheduled_treatments (patient_id, regimen_id, scheduled_date, status, prescription_received) VALUES
  (1,  1,  CURRENT_DATE + 7,  'planned', false),
  (3,  3,  CURRENT_DATE + 7,  'planned', false),
  (5,  5,  CURRENT_DATE + 7,  'planned', false),
  (7,  7,  CURRENT_DATE + 7,  'planned', false),
  (9,  12, CURRENT_DATE + 7,  'planned', false),
  (11, 11, CURRENT_DATE + 7,  'planned', false),
  (14, 1,  CURRENT_DATE + 7,  'planned', false)
ON CONFLICT DO NOTHING;

-- 2週後
INSERT INTO scheduled_treatments (patient_id, regimen_id, scheduled_date, status, prescription_received) VALUES
  (2,  2,  CURRENT_DATE + 14, 'planned', false),
  (4,  4,  CURRENT_DATE + 14, 'planned', false),
  (8,  1,  CURRENT_DATE + 14, 'planned', false),
  (10, 9,  CURRENT_DATE + 14, 'planned', false),
  (13, 14, CURRENT_DATE + 14, 'planned', false),
  (15, 10, CURRENT_DATE + 14, 'planned', false)
ON CONFLICT DO NOTHING;

-- 3週後
INSERT INTO scheduled_treatments (patient_id, regimen_id, scheduled_date, status, prescription_received) VALUES
  (1,  1,  CURRENT_DATE + 21, 'planned', false),
  (3,  3,  CURRENT_DATE + 21, 'planned', false),
  (5,  5,  CURRENT_DATE + 21, 'planned', false),
  (11, 11, CURRENT_DATE + 21, 'planned', false),
  (14, 1,  CURRENT_DATE + 21, 'planned', false)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 6. blood_results（本日 scheduled_treatments の ID を取得して挿入）
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_id INTEGER;
BEGIN
  -- 患者1 本日
  SELECT id INTO v_id FROM scheduled_treatments WHERE patient_id=1 AND scheduled_date=CURRENT_DATE LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO blood_results (treatment_id, wbc, anc, plt, hgb, mono, cre, egfr, ast, alt, tbil, crp)
    VALUES (v_id, 5.2, 3.1, 198, 11.8, 0.52, 0.72, 72, 22, 18, 0.7, 0.3) ON CONFLICT DO NOTHING;
  END IF;
  -- 患者2 本日
  SELECT id INTO v_id FROM scheduled_treatments WHERE patient_id=2 AND scheduled_date=CURRENT_DATE LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO blood_results (treatment_id, wbc, anc, plt, hgb, mono, cre, egfr, ast, alt, tbil, crp)
    VALUES (v_id, 4.8, 2.8, 185, 12.1, 0.48, 0.65, 80, 18, 15, 0.6, 0.5) ON CONFLICT DO NOTHING;
  END IF;
  -- 患者3 本日
  SELECT id INTO v_id FROM scheduled_treatments WHERE patient_id=3 AND scheduled_date=CURRENT_DATE LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO blood_results (treatment_id, wbc, anc, plt, hgb, mono, cre, egfr, ast, alt, tbil, crp)
    VALUES (v_id, 3.2, 1.5, 120, 10.5, 0.38, 0.98, 58, 28, 24, 0.9, 1.2) ON CONFLICT DO NOTHING;
  END IF;
  -- 患者4 本日
  SELECT id INTO v_id FROM scheduled_treatments WHERE patient_id=4 AND scheduled_date=CURRENT_DATE LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO blood_results (treatment_id, wbc, anc, plt, hgb, mono, cre, egfr, ast, alt, tbil, crp)
    VALUES (v_id, 6.1, 3.8, 220, 13.2, 0.61, 0.58, 88, 20, 17, 0.5, 0.2) ON CONFLICT DO NOTHING;
  END IF;
  -- 患者5 本日
  SELECT id INTO v_id FROM scheduled_treatments WHERE patient_id=5 AND scheduled_date=CURRENT_DATE LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO blood_results (treatment_id, wbc, anc, plt, hgb, mono, cre, egfr, ast, alt, tbil, crp)
    VALUES (v_id, 2.8, 1.1, 98, 9.8, 0.28, 1.12, 48, 35, 30, 1.1, 2.4) ON CONFLICT DO NOTHING;
  END IF;
  -- 患者8 本日
  SELECT id INTO v_id FROM scheduled_treatments WHERE patient_id=8 AND scheduled_date=CURRENT_DATE LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO blood_results (treatment_id, wbc, anc, plt, hgb, mono, cre, egfr, ast, alt, tbil, crp)
    VALUES (v_id, 5.8, 3.5, 210, 12.5, 0.58, 0.68, 75, 25, 20, 0.8, 0.4) ON CONFLICT DO NOTHING;
  END IF;
  -- 患者10 本日
  SELECT id INTO v_id FROM scheduled_treatments WHERE patient_id=10 AND scheduled_date=CURRENT_DATE LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO blood_results (treatment_id, wbc, anc, plt, hgb, mono, cre, egfr, ast, alt, tbil, crp)
    VALUES (v_id, 3.5, 1.8, 145, 10.2, 0.35, 0.85, 62, 32, 28, 0.9, 1.8) ON CONFLICT DO NOTHING;
  END IF;
  -- 患者13 本日
  SELECT id INTO v_id FROM scheduled_treatments WHERE patient_id=13 AND scheduled_date=CURRENT_DATE LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO blood_results (treatment_id, wbc, anc, plt, hgb, mono, cre, egfr, ast, alt, tbil, crp)
    VALUES (v_id, 7.2, 4.5, 240, 13.8, 0.72, 0.62, 82, 19, 16, 0.6, 0.3) ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 7. interventions（介入記録）
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_id INTEGER;
  v_date DATE;
BEGIN
  -- 2026-03-04 の治療に対する介入
  SELECT st.id, st.scheduled_date INTO v_id, v_date
  FROM scheduled_treatments st WHERE patient_id=1 AND scheduled_date='2026-03-04' LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO interventions (treatment_id, record_id, intervention_type, consultation_timing,
      calc_cancer_guidance, calc_pre_consultation, intervention_category, intervention_detail,
      intervention_content, pharmacist_name)
    VALUES (v_id, 'INT-2026030401', '提案', '前', true, false, '副作用対応', '制吐剤追加',
      'グレード2の悪心あり。メトクロプラミド追加を提案。医師了承。', '山田 薬子') ON CONFLICT DO NOTHING;
  END IF;

  SELECT st.id INTO v_id FROM scheduled_treatments st WHERE patient_id=2 AND scheduled_date='2026-03-04' LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO interventions (treatment_id, record_id, intervention_type, consultation_timing,
      calc_cancer_guidance, calc_pre_consultation, intervention_category, intervention_detail,
      intervention_content, pharmacist_name)
    VALUES (v_id, 'INT-2026030402', '疑義', '前', false, true, '用量確認', 'BSA再計算',
      '体重変動によりBSA再計算。用量調整について医師に疑義照会。増量なしで継続。', '鈴木 花子') ON CONFLICT DO NOTHING;
  END IF;

  SELECT st.id INTO v_id FROM scheduled_treatments st WHERE patient_id=5 AND scheduled_date='2026-03-04' LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO interventions (treatment_id, record_id, intervention_type, consultation_timing,
      calc_cancer_guidance, calc_pre_consultation, intervention_category, intervention_detail,
      intervention_content, pharmacist_name, prescription_changed)
    VALUES (v_id, 'INT-2026030405', '提案', '後', false, false, '相互作用', '併用薬確認',
      '新規処方薬との相互作用を確認。CYP3A4阻害薬あり。主治医に報告し用量減量に変更。', '山田 薬子', true) ON CONFLICT DO NOTHING;
  END IF;

  -- 2026-03-06 の治療に対する介入
  SELECT st.id INTO v_id FROM scheduled_treatments st WHERE patient_id=1 AND scheduled_date='2026-03-06' LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO interventions (treatment_id, record_id, intervention_type, consultation_timing,
      calc_cancer_guidance, calc_pre_consultation, intervention_category, intervention_detail,
      intervention_content, pharmacist_name)
    VALUES (v_id, 'INT-2026030601', '問い合わせ', '前', true, true, '患者指導', 'セルフケア指導',
      '口腔内ケアの指導実施。口内炎予防のうがい方法を指導。', '田中 正雄') ON CONFLICT DO NOTHING;
  END IF;

  SELECT st.id INTO v_id FROM scheduled_treatments st WHERE patient_id=2 AND scheduled_date='2026-03-06' LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO interventions (treatment_id, record_id, intervention_type, consultation_timing,
      calc_cancer_guidance, calc_pre_consultation, intervention_category, intervention_detail,
      intervention_content, pharmacist_name)
    VALUES (v_id, 'INT-2026030602', '提案', '前', true, false, '副作用対応', '支持療法追加',
      '末梢神経障害グレード1。ビタミンB6投与を提案。', '木村 陽子') ON CONFLICT DO NOTHING;
  END IF;

  SELECT st.id INTO v_id FROM scheduled_treatments st WHERE patient_id=3 AND scheduled_date='2026-03-06' LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO interventions (treatment_id, record_id, intervention_type, consultation_timing,
      calc_cancer_guidance, calc_pre_consultation, intervention_category, intervention_detail,
      intervention_content, pharmacist_name)
    VALUES (v_id, 'INT-2026030603', '疑義', '前', false, false, 'レジメン確認', '投与スケジュール',
      '投与日誤りを発見。スケジュール修正を依頼。', '山田 薬子') ON CONFLICT DO NOTHING;
  END IF;

  -- 本日の介入
  SELECT st.id INTO v_id FROM scheduled_treatments st WHERE patient_id=1 AND scheduled_date=CURRENT_DATE LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO interventions (treatment_id, record_id, intervention_type, consultation_timing,
      calc_cancer_guidance, calc_pre_consultation, intervention_category, intervention_detail,
      intervention_content, pharmacist_name)
    VALUES (v_id, 'INT-TODAY-01', '提案', '前', true, true, '副作用対応', '制吐剤',
      '前回の悪心に対しプレメドの変更を提案。オンダンセトロンからパロノセトロンへ変更。', '山田 薬子') ON CONFLICT DO NOTHING;
  END IF;

  SELECT st.id INTO v_id FROM scheduled_treatments st WHERE patient_id=4 AND scheduled_date=CURRENT_DATE LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO interventions (treatment_id, record_id, intervention_type, consultation_timing,
      calc_cancer_guidance, calc_pre_consultation, intervention_category, intervention_detail,
      intervention_content, pharmacist_name)
    VALUES (v_id, 'INT-TODAY-04', '問い合わせ', '前', true, false, '患者指導', '初回説明',
      '初回投与。レジメン説明、副作用説明、手帳記載指導を実施。', '鈴木 花子') ON CONFLICT DO NOTHING;
  END IF;

  SELECT st.id INTO v_id FROM scheduled_treatments st WHERE patient_id=10 AND scheduled_date=CURRENT_DATE LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO interventions (treatment_id, record_id, intervention_type, consultation_timing,
      calc_cancer_guidance, calc_pre_consultation, intervention_category, intervention_detail,
      intervention_content, pharmacist_name)
    VALUES (v_id, 'INT-TODAY-10', '提案', '後', false, false, '副作用対応', '骨髄抑制対応',
      'G3好中球減少。次サイクルの用量減量（75%）を提案。G-CSF予防投与も検討。', '田中 正雄') ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 8. work_diaries + work_diary_pharmacists（過去3ヶ月分）
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO work_diaries (diary_date, patient_counseling, first_visit_counseling, allergy_stop,
  regimen_check, regimen_operation, oral_scheduled, oral_done, oral_cancelled, oral_changed,
  oral_patient_counseling, oral_first_visit, oral_doubt, oral_propose, oral_inquiry, notes)
VALUES
-- 2025年12月
  ('2025-12-02', 8, 1, 0, 6, 2, 3, 2, 1, 0, 1, 0, 0, 1, 0, NULL),
  ('2025-12-03', 10, 2, 1, 8, 3, 4, 3, 0, 1, 2, 1, 1, 2, 1, 'アナフィラキシー1件対応'),
  ('2025-12-04', 7, 0, 0, 5, 1, 2, 2, 0, 0, 1, 0, 0, 0, 0, NULL),
  ('2025-12-05', 9, 1, 0, 7, 2, 3, 3, 1, 0, 1, 0, 1, 1, 0, NULL),
  ('2025-12-08', 6, 0, 0, 5, 1, 2, 1, 1, 0, 0, 0, 0, 1, 0, NULL),
  ('2025-12-09', 11, 2, 0, 9, 3, 4, 4, 0, 0, 2, 1, 0, 2, 1, NULL),
  ('2025-12-10', 8, 1, 1, 6, 2, 3, 2, 0, 1, 1, 0, 0, 1, 0, NULL),
  ('2025-12-11', 9, 0, 0, 7, 2, 3, 3, 1, 0, 1, 0, 1, 0, 0, NULL),
  ('2025-12-12', 7, 1, 0, 6, 1, 2, 2, 0, 0, 1, 0, 0, 1, 0, NULL),
  ('2025-12-15', 10, 2, 0, 8, 3, 4, 3, 1, 0, 2, 1, 0, 2, 0, NULL),
  ('2025-12-16', 8, 1, 0, 6, 2, 3, 2, 1, 0, 1, 0, 0, 1, 1, NULL),
  ('2025-12-17', 9, 0, 1, 7, 2, 3, 3, 0, 0, 1, 0, 1, 0, 0, '年末調整'),
  ('2025-12-18', 7, 1, 0, 5, 1, 2, 2, 0, 0, 1, 0, 0, 0, 0, NULL),
  ('2025-12-19', 8, 0, 0, 6, 2, 3, 2, 1, 0, 1, 0, 0, 1, 0, NULL),
  ('2025-12-22', 6, 1, 0, 5, 1, 2, 1, 1, 0, 0, 0, 0, 0, 0, NULL),
  ('2025-12-24', 5, 0, 0, 4, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, '年末短縮業務'),
  ('2025-12-25', 4, 0, 0, 3, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, '年末短縮業務'),
  ('2025-12-26', 4, 0, 0, 3, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, NULL),
-- 2026年1月
  ('2026-01-05', 8, 2, 0, 6, 2, 3, 2, 1, 0, 1, 1, 0, 1, 0, '年始'),
  ('2026-01-06', 10, 1, 0, 8, 2, 4, 3, 0, 1, 2, 0, 1, 1, 0, NULL),
  ('2026-01-07', 9, 0, 1, 7, 3, 3, 3, 1, 0, 1, 0, 0, 2, 1, NULL),
  ('2026-01-08', 8, 1, 0, 6, 2, 3, 2, 0, 1, 1, 0, 0, 1, 0, NULL),
  ('2026-01-09', 7, 0, 0, 5, 1, 2, 2, 0, 0, 0, 0, 0, 0, 0, NULL),
  ('2026-01-13', 11, 2, 0, 9, 3, 5, 4, 0, 1, 2, 1, 0, 2, 1, NULL),
  ('2026-01-14', 9, 1, 0, 7, 2, 3, 3, 1, 0, 1, 0, 1, 1, 0, NULL),
  ('2026-01-15', 10, 0, 0, 8, 2, 4, 3, 0, 1, 2, 0, 0, 1, 0, NULL),
  ('2026-01-16', 8, 1, 1, 6, 2, 3, 2, 1, 0, 1, 0, 0, 1, 0, NULL),
  ('2026-01-19', 9, 0, 0, 7, 2, 3, 3, 0, 0, 1, 0, 0, 0, 0, NULL),
  ('2026-01-20', 10, 2, 0, 8, 3, 4, 3, 1, 0, 2, 1, 0, 2, 1, NULL),
  ('2026-01-21', 8, 1, 0, 6, 2, 3, 2, 0, 1, 1, 0, 1, 1, 0, NULL),
  ('2026-01-22', 7, 0, 0, 5, 1, 2, 2, 0, 0, 0, 0, 0, 0, 0, NULL),
  ('2026-01-23', 9, 1, 0, 7, 2, 3, 3, 1, 0, 1, 0, 0, 1, 0, NULL),
  ('2026-01-26', 10, 0, 0, 8, 2, 4, 3, 0, 1, 2, 0, 0, 0, 1, NULL),
  ('2026-01-27', 8, 1, 1, 6, 2, 3, 2, 1, 0, 1, 0, 0, 1, 0, NULL),
  ('2026-01-28', 9, 0, 0, 7, 2, 3, 3, 0, 0, 1, 0, 1, 0, 0, NULL),
  ('2026-01-29', 7, 1, 0, 5, 1, 2, 2, 0, 0, 0, 0, 0, 0, 0, NULL),
  ('2026-01-30', 8, 0, 0, 6, 2, 3, 2, 1, 0, 1, 0, 0, 1, 0, NULL),
-- 2026年2月
  ('2026-02-02', 9, 1, 0, 7, 2, 3, 3, 0, 1, 1, 0, 0, 1, 0, NULL),
  ('2026-02-03', 10, 2, 0, 8, 3, 4, 3, 1, 0, 2, 1, 0, 2, 1, NULL),
  ('2026-02-04', 8, 0, 1, 6, 2, 3, 2, 0, 1, 1, 0, 0, 1, 0, NULL),
  ('2026-02-05', 7, 1, 0, 5, 1, 2, 2, 1, 0, 0, 0, 0, 0, 0, NULL),
  ('2026-02-06', 9, 0, 0, 7, 2, 3, 3, 0, 0, 1, 0, 1, 0, 0, NULL),
  ('2026-02-09', 11, 2, 0, 9, 3, 5, 4, 0, 1, 2, 1, 0, 2, 1, NULL),
  ('2026-02-10', 9, 1, 0, 7, 2, 3, 3, 1, 0, 1, 0, 0, 1, 0, NULL),
  ('2026-02-12', 8, 0, 0, 6, 2, 3, 2, 0, 1, 1, 0, 0, 0, 0, NULL),
  ('2026-02-13', 9, 1, 1, 7, 2, 3, 3, 1, 0, 1, 0, 1, 1, 0, NULL),
  ('2026-02-16', 10, 0, 0, 8, 2, 4, 3, 0, 1, 2, 0, 0, 1, 0, NULL),
  ('2026-02-17', 8, 2, 0, 6, 2, 3, 2, 1, 0, 1, 1, 0, 2, 1, NULL),
  ('2026-02-18', 9, 1, 0, 7, 2, 3, 3, 0, 0, 1, 0, 0, 1, 0, NULL),
  ('2026-02-19', 7, 0, 0, 5, 1, 2, 2, 0, 0, 0, 0, 0, 0, 0, NULL),
  ('2026-02-20', 8, 1, 0, 6, 2, 3, 2, 1, 0, 1, 0, 0, 1, 0, NULL),
  ('2026-02-23', 10, 0, 0, 8, 2, 4, 3, 0, 1, 2, 0, 0, 0, 1, NULL),
  ('2026-02-24', 9, 1, 1, 7, 2, 3, 3, 1, 0, 1, 0, 1, 1, 0, NULL),
  ('2026-02-25', 8, 0, 0, 6, 2, 3, 2, 0, 0, 1, 0, 0, 0, 0, NULL),
  ('2026-02-26', 7, 1, 0, 5, 1, 2, 2, 1, 0, 0, 0, 0, 0, 0, NULL),
  ('2026-02-27', 9, 0, 0, 7, 2, 3, 3, 0, 1, 1, 0, 0, 1, 0, NULL),
-- 2026年3月（今週まで）
  ('2026-03-02', 10, 2, 0, 8, 3, 4, 3, 0, 1, 2, 1, 0, 2, 1, NULL),
  ('2026-03-03', 9, 1, 0, 7, 2, 3, 3, 1, 0, 1, 0, 0, 1, 0, NULL),
  ('2026-03-04', 11, 0, 1, 9, 3, 5, 4, 0, 1, 2, 0, 1, 2, 0, NULL),
  ('2026-03-05', 8, 1, 0, 6, 2, 3, 2, 1, 0, 1, 0, 0, 1, 0, NULL),
  ('2026-03-06', 10, 2, 0, 8, 2, 4, 3, 0, 1, 2, 1, 1, 2, 1, NULL),
  (CURRENT_DATE, 12, 2, 0, 10, 3, 5, 4, 1, 1, 2, 1, 1, 2, 1, '本日')
ON CONFLICT (diary_date) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 9. work_diary_pharmacists（薬剤師担当）
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_diary_id INTEGER;
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, diary_date FROM work_diaries
    WHERE diary_date >= '2025-12-01'
    ORDER BY diary_date
  LOOP
    -- 日付によって薬剤師を割り振り
    IF EXTRACT(DOW FROM r.diary_date) IN (1, 3) THEN  -- 月・水: 山田+鈴木
      INSERT INTO work_diary_pharmacists (diary_id, sort_order, pharmacist_name, start_time, end_time, has_lunch, lunch_minutes)
      VALUES (r.id, 1, '山田 薬子',  '08:30', '17:15', true, 45),
             (r.id, 2, '鈴木 花子', '08:30', '17:15', true, 45)
      ON CONFLICT DO NOTHING;
    ELSIF EXTRACT(DOW FROM r.diary_date) IN (2, 4) THEN  -- 火・木: 田中+木村
      INSERT INTO work_diary_pharmacists (diary_id, sort_order, pharmacist_name, start_time, end_time, has_lunch, lunch_minutes)
      VALUES (r.id, 1, '田中 正雄',  '08:30', '17:15', true, 45),
             (r.id, 2, '木村 陽子', '08:30', '17:15', true, 45)
      ON CONFLICT DO NOTHING;
    ELSE  -- 金: 山田+中村
      INSERT INTO work_diary_pharmacists (diary_id, sort_order, pharmacist_name, start_time, end_time, has_lunch, lunch_minutes)
      VALUES (r.id, 1, '山田 薬子',  '08:30', '17:15', true, 45),
             (r.id, 2, '中村 拓也', '08:30', '17:15', true, 45)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- 10. pre_consult_departments を全有効化
-- ─────────────────────────────────────────────────────────────────────
UPDATE pre_consult_departments SET is_enabled = true;

-- ─────────────────────────────────────────────────────────────────────
-- 11. 新規患者の patient_vitals（体格）
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO patient_vitals (patient_id, measured_date, height_cm, weight_kg) VALUES
-- 患者8 橋本悠樹
  (8, CURRENT_DATE - INTERVAL '12 months', 172.0, 72.5),
  (8, CURRENT_DATE - INTERVAL '9 months',  172.0, 70.8),
  (8, CURRENT_DATE - INTERVAL '6 months',  172.0, 69.2),
  (8, CURRENT_DATE - INTERVAL '3 months',  172.0, 68.0),
  (8, CURRENT_DATE - INTERVAL '1 month',   172.0, 67.5),
  (8, CURRENT_DATE,                         172.0, 67.0),
-- 患者9 伊藤春菜
  (9, CURRENT_DATE - INTERVAL '12 months', 158.5, 52.0),
  (9, CURRENT_DATE - INTERVAL '9 months',  158.5, 51.0),
  (9, CURRENT_DATE - INTERVAL '6 months',  158.5, 50.5),
  (9, CURRENT_DATE - INTERVAL '3 months',  158.5, 49.8),
  (9, CURRENT_DATE - INTERVAL '1 month',   158.5, 49.2),
  (9, CURRENT_DATE,                         158.5, 49.0),
-- 患者10 渡辺康雄
  (10, CURRENT_DATE - INTERVAL '12 months', 165.0, 60.0),
  (10, CURRENT_DATE - INTERVAL '9 months',  165.0, 58.5),
  (10, CURRENT_DATE - INTERVAL '6 months',  165.0, 57.0),
  (10, CURRENT_DATE - INTERVAL '3 months',  165.0, 56.0),
  (10, CURRENT_DATE - INTERVAL '1 month',   165.0, 55.5),
  (10, CURRENT_DATE,                         165.0, 55.0),
-- 患者11 田村知恵子
  (11, CURRENT_DATE - INTERVAL '12 months', 160.0, 58.0),
  (11, CURRENT_DATE - INTERVAL '9 months',  160.0, 57.5),
  (11, CURRENT_DATE - INTERVAL '6 months',  160.0, 56.8),
  (11, CURRENT_DATE - INTERVAL '3 months',  160.0, 56.0),
  (11, CURRENT_DATE - INTERVAL '1 month',   160.0, 55.5),
  (11, CURRENT_DATE,                         160.0, 55.2),
-- 患者12 松本健司
  (12, CURRENT_DATE - INTERVAL '12 months', 175.0, 78.0),
  (12, CURRENT_DATE - INTERVAL '9 months',  175.0, 76.5),
  (12, CURRENT_DATE - INTERVAL '6 months',  175.0, 75.0),
  (12, CURRENT_DATE - INTERVAL '3 months',  175.0, 74.0),
  (12, CURRENT_DATE - INTERVAL '1 month',   175.0, 73.5),
  (12, CURRENT_DATE,                         175.0, 73.0),
-- 患者13 小林幸子
  (13, CURRENT_DATE - INTERVAL '12 months', 155.0, 50.0),
  (13, CURRENT_DATE - INTERVAL '9 months',  155.0, 49.5),
  (13, CURRENT_DATE - INTERVAL '6 months',  155.0, 49.0),
  (13, CURRENT_DATE - INTERVAL '3 months',  155.0, 48.8),
  (13, CURRENT_DATE - INTERVAL '1 month',   155.0, 48.5),
  (13, CURRENT_DATE,                         155.0, 48.5),
-- 患者14 加藤浩二
  (14, CURRENT_DATE - INTERVAL '12 months', 170.0, 68.0),
  (14, CURRENT_DATE - INTERVAL '9 months',  170.0, 66.5),
  (14, CURRENT_DATE - INTERVAL '6 months',  170.0, 65.0),
  (14, CURRENT_DATE - INTERVAL '3 months',  170.0, 64.0),
  (14, CURRENT_DATE - INTERVAL '1 month',   170.0, 63.5),
  (14, CURRENT_DATE,                         170.0, 63.0),
-- 患者15 斎藤奈緒
  (15, CURRENT_DATE - INTERVAL '12 months', 163.0, 55.0),
  (15, CURRENT_DATE - INTERVAL '9 months',  163.0, 54.0),
  (15, CURRENT_DATE - INTERVAL '6 months',  163.0, 53.5),
  (15, CURRENT_DATE - INTERVAL '3 months',  163.0, 53.0),
  (15, CURRENT_DATE - INTERVAL '1 month',   163.0, 52.5),
  (15, CURRENT_DATE,                         163.0, 52.0)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 12. 新規患者の patient_lab_history（検査値）
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO patient_lab_history (patient_id, lab_date, wbc, anc, plt, hgb, mono, cre, egfr, ast, alt, tbil, crp) VALUES
-- 患者8 橋本悠樹
  (8, CURRENT_DATE - 180, 6.2, 3.8, 210, 13.0, 0.62, 0.70, 74, 24, 20, 0.8, 0.3),
  (8, CURRENT_DATE - 150, 5.8, 3.5, 198, 12.5, 0.58, 0.72, 72, 26, 22, 0.8, 0.4),
  (8, CURRENT_DATE - 120, 5.5, 3.2, 205, 12.8, 0.55, 0.68, 76, 23, 19, 0.7, 0.3),
  (8, CURRENT_DATE - 90,  5.2, 3.0, 195, 12.2, 0.52, 0.71, 73, 27, 23, 0.9, 0.5),
  (8, CURRENT_DATE - 60,  5.8, 3.5, 210, 12.5, 0.58, 0.68, 76, 25, 21, 0.8, 0.4),
  (8, CURRENT_DATE - 30,  5.5, 3.3, 200, 12.3, 0.55, 0.70, 74, 24, 20, 0.8, 0.4),
  (8, CURRENT_DATE,       5.2, 3.1, 198, 11.8, 0.52, 0.72, 72, 22, 18, 0.7, 0.3),
-- 患者9 伊藤春菜
  (9, CURRENT_DATE - 180, 5.0, 2.8, 180, 11.5, 0.50, 0.60, 85, 20, 16, 0.6, 0.8),
  (9, CURRENT_DATE - 150, 4.5, 2.4, 165, 11.0, 0.45, 0.62, 82, 22, 18, 0.7, 1.2),
  (9, CURRENT_DATE - 120, 4.8, 2.6, 175, 11.2, 0.48, 0.59, 86, 21, 17, 0.6, 0.9),
  (9, CURRENT_DATE - 90,  3.8, 1.9, 148, 10.5, 0.38, 0.63, 80, 25, 22, 0.8, 1.5),
  (9, CURRENT_DATE - 60,  4.5, 2.5, 170, 11.0, 0.45, 0.61, 84, 22, 18, 0.7, 1.0),
  (9, CURRENT_DATE - 30,  4.8, 2.7, 175, 11.2, 0.48, 0.60, 85, 21, 17, 0.6, 0.8),
  (9, CURRENT_DATE,       4.8, 2.8, 185, 12.1, 0.48, 0.65, 80, 18, 15, 0.6, 0.5),
-- 患者10 渡辺康雄
  (10, CURRENT_DATE - 180, 5.5, 3.0, 180, 12.0, 0.55, 0.82, 65, 30, 26, 0.9, 0.8),
  (10, CURRENT_DATE - 150, 4.8, 2.5, 160, 11.5, 0.48, 0.85, 62, 35, 30, 1.0, 1.2),
  (10, CURRENT_DATE - 120, 3.5, 1.6, 130, 10.2, 0.35, 0.88, 60, 38, 33, 1.1, 2.0),
  (10, CURRENT_DATE - 90,  4.2, 2.0, 145, 10.8, 0.42, 0.85, 62, 34, 28, 1.0, 1.5),
  (10, CURRENT_DATE - 60,  4.8, 2.5, 162, 11.2, 0.48, 0.83, 64, 32, 27, 0.9, 1.2),
  (10, CURRENT_DATE - 30,  4.5, 2.3, 155, 10.9, 0.45, 0.84, 63, 33, 28, 0.9, 1.4),
  (10, CURRENT_DATE,       3.5, 1.8, 145, 10.2, 0.35, 0.85, 62, 32, 28, 0.9, 1.8),
-- 患者11 田村知恵子
  (11, CURRENT_DATE - 180, 6.5, 4.0, 225, 13.5, 0.65, 0.58, 90, 18, 14, 0.5, 0.2),
  (11, CURRENT_DATE - 150, 5.8, 3.5, 210, 13.0, 0.58, 0.60, 88, 20, 16, 0.6, 0.3),
  (11, CURRENT_DATE - 120, 5.2, 3.0, 198, 12.8, 0.52, 0.59, 89, 19, 15, 0.5, 0.3),
  (11, CURRENT_DATE - 90,  5.5, 3.2, 205, 12.5, 0.55, 0.61, 87, 21, 17, 0.6, 0.4),
  (11, CURRENT_DATE - 60,  5.8, 3.5, 215, 12.8, 0.58, 0.59, 90, 20, 16, 0.6, 0.3),
  (11, CURRENT_DATE - 30,  6.0, 3.7, 220, 13.0, 0.60, 0.60, 88, 19, 15, 0.5, 0.3),
  (11, CURRENT_DATE,       6.1, 3.8, 220, 13.2, 0.61, 0.58, 88, 20, 17, 0.5, 0.2),
-- 患者13 小林幸子
  (13, CURRENT_DATE - 180, 7.0, 4.5, 245, 14.0, 0.70, 0.61, 84, 18, 14, 0.5, 0.2),
  (13, CURRENT_DATE - 150, 6.8, 4.2, 238, 13.8, 0.68, 0.62, 83, 19, 15, 0.6, 0.3),
  (13, CURRENT_DATE - 120, 6.5, 4.0, 230, 13.5, 0.65, 0.60, 85, 18, 14, 0.5, 0.2),
  (13, CURRENT_DATE - 90,  7.0, 4.3, 240, 14.0, 0.70, 0.62, 83, 20, 16, 0.6, 0.3),
  (13, CURRENT_DATE - 60,  6.8, 4.2, 238, 13.8, 0.68, 0.61, 84, 19, 15, 0.5, 0.2),
  (13, CURRENT_DATE - 30,  7.0, 4.4, 242, 13.9, 0.70, 0.62, 83, 19, 15, 0.6, 0.3),
  (13, CURRENT_DATE,       7.2, 4.5, 240, 13.8, 0.72, 0.62, 82, 19, 16, 0.6, 0.3),
-- 患者14 加藤浩二
  (14, CURRENT_DATE - 180, 5.5, 3.2, 195, 13.2, 0.55, 0.75, 70, 25, 21, 0.8, 0.4),
  (14, CURRENT_DATE - 150, 4.8, 2.8, 182, 12.8, 0.48, 0.78, 67, 28, 24, 0.9, 0.6),
  (14, CURRENT_DATE - 120, 5.0, 3.0, 188, 13.0, 0.50, 0.76, 69, 26, 22, 0.8, 0.5),
  (14, CURRENT_DATE - 90,  4.5, 2.5, 175, 12.5, 0.45, 0.79, 66, 29, 25, 0.9, 0.7),
  (14, CURRENT_DATE - 60,  5.0, 3.0, 188, 12.8, 0.50, 0.77, 68, 27, 23, 0.8, 0.5),
  (14, CURRENT_DATE - 30,  5.2, 3.1, 192, 12.9, 0.52, 0.76, 69, 26, 22, 0.8, 0.5),
  (14, CURRENT_DATE,       5.2, 3.1, 192, 12.8, 0.52, 0.76, 69, 26, 22, 0.8, 0.5),
-- 患者15 斎藤奈緒
  (15, CURRENT_DATE - 180, 5.2, 3.0, 190, 12.0, 0.52, 0.70, 74, 22, 18, 0.7, 0.8),
  (15, CURRENT_DATE - 150, 4.5, 2.5, 172, 11.5, 0.45, 0.72, 72, 25, 21, 0.8, 1.2),
  (15, CURRENT_DATE - 120, 4.8, 2.8, 180, 11.8, 0.48, 0.71, 73, 23, 19, 0.7, 0.9),
  (15, CURRENT_DATE - 90,  3.8, 1.8, 145, 10.8, 0.38, 0.75, 70, 28, 24, 0.9, 1.8),
  (15, CURRENT_DATE - 60,  4.5, 2.6, 175, 11.5, 0.45, 0.72, 72, 24, 20, 0.8, 1.0),
  (15, CURRENT_DATE - 30,  5.0, 3.0, 188, 12.0, 0.50, 0.71, 73, 23, 19, 0.7, 0.8),
  (15, CURRENT_DATE,       5.0, 3.0, 188, 12.0, 0.50, 0.71, 73, 23, 19, 0.7, 0.8)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 13. 新規患者の patient_medical_history（既往歴）
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO patient_medical_history (patient_id, condition_name, onset_date, notes) VALUES
  (8,  '胃Cancer',           '2024-06-01', '胃全摘術施行'),
  (8,  '高血圧',             '2015-04-01', 'アムロジピン5mg内服中'),
  (8,  '糖尿病',             '2018-09-01', 'メトホルミン内服中'),
  (9,  '肺腺癌',             '2025-01-15', 'stage IVA EGFR変異(-) ALK(-)'),
  (9,  '気管支喘息',         '2010-03-01', '吸入ステロイド使用中'),
  (10, '悪性リンパ腫 DLBCL', '2025-08-20', 'CHOP→R-CHOP移行'),
  (10, '高血圧',             '2012-05-01', 'カルシウム拮抗薬内服中'),
  (11, '卵巣Cancer',         '2024-11-10', 'stage IIIC 減量手術後'),
  (11, '子宮筋腫',           '2019-06-01', '保存的加療'),
  (12, '中咽頭Cancer',       '2025-03-05', 'HPV関連 stage III'),
  (13, '乳Cancer',           '2025-05-20', 'HER2(3+) ER(-) PgR(-) stage IIB'),
  (13, '甲状腺機能低下症',   '2020-01-01', 'レボチロキシン内服中'),
  (14, '大腸Cancer',         '2024-09-15', 'S状結腸 stage III 腹腔鏡手術後'),
  (14, '高血圧',             '2010-03-01', 'ARB内服中'),
  (14, '高脂血症',           '2012-07-01', 'スタチン内服中'),
  (15, '膵Cancer',           '2025-11-01', 'stage IVA 切除不能')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 14. 新規患者の patient_orders（本日・将来）
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO patient_orders (patient_id, order_date, drug_name, dose, dose_unit, route, is_antineoplastic) VALUES
-- 患者8 橋本悠樹 オキバイド+5FU/LV 本日
  (8, CURRENT_DATE,      'オキサリプラチン', 85,    'mg/m²', '点滴', true),
  (8, CURRENT_DATE,      '5-FU',             2400,  'mg/m²', '点滴', true),
  (8, CURRENT_DATE,      'レボホリナート',   200,   'mg/m²', '点滴', true),
  (8, CURRENT_DATE,      'アプレピタント',   125,   'mg',    '内服', false),
  (8, CURRENT_DATE,      'グラニセトロン',   1,     'mg',    '点滴', false),
  (8, CURRENT_DATE,      'デキサメタゾン',   9.9,   'mg',    '点滴', false),
-- 患者9 伊藤春菜 CBDCA+PEM 本日
  (9, CURRENT_DATE,      'カルボプラチン',   5,     'AUC',   '点滴', true),
  (9, CURRENT_DATE,      'ペメトレキセド',   500,   'mg/m²', '点滴', true),
  (9, CURRENT_DATE,      'デキサメタゾン',   9.9,   'mg',    '点滴', false),
  (9, CURRENT_DATE,      'グラニセトロン',   1,     'mg',    '点滴', false),
  (9, CURRENT_DATE,      '葉酸',             1,     'mg',    '内服', false),
-- 患者10 渡辺康雄 R-CHOP 本日
  (10, CURRENT_DATE,     'リツキシマブ',     375,   'mg/m²', '点滴', true),
  (10, CURRENT_DATE,     'シクロホスファミド',750,  'mg/m²', '点滴', true),
  (10, CURRENT_DATE,     'ドキソルビシン',   50,    'mg/m²', '点滴', true),
  (10, CURRENT_DATE,     'ビンクリスチン',   1.4,   'mg/m²', '点滴', true),
  (10, CURRENT_DATE,     'プレドニゾロン',   100,   'mg',    '内服', false),
  (10, CURRENT_DATE,     'グラニセトロン',   1,     'mg',    '点滴', false),
-- 患者11 田村知恵子 TC 本日
  (11, CURRENT_DATE,     'パクリタキセル',   175,   'mg/m²', '点滴', true),
  (11, CURRENT_DATE,     'カルボプラチン',   6,     'AUC',   '点滴', true),
  (11, CURRENT_DATE,     'アプレピタント',   125,   'mg',    '内服', false),
  (11, CURRENT_DATE,     'グラニセトロン',   1,     'mg',    '点滴', false),
  (11, CURRENT_DATE,     'デキサメタゾン',   9.9,   'mg',    '点滴', false),
-- 患者13 小林幸子 トラスツズマブ単剤 本日
  (13, CURRENT_DATE,     'トラスツズマブ',   6,     'mg/kg', '点滴', true),
-- 患者14 加藤浩二 オキバイド+5FU/LV 本日
  (14, CURRENT_DATE,     'オキサリプラチン', 85,    'mg/m²', '点滴', true),
  (14, CURRENT_DATE,     '5-FU',             2400,  'mg/m²', '点滴', true),
  (14, CURRENT_DATE,     'レボホリナート',   200,   'mg/m²', '点滴', true),
  (14, CURRENT_DATE,     'グラニセトロン',   1,     'mg',    '点滴', false),
  (14, CURRENT_DATE,     'デキサメタゾン',   9.9,   'mg',    '点滴', false),
-- 患者15 斎藤奈緒 GEM+nab-PTX 本日
  (15, CURRENT_DATE,     'ゲムシタビン',     1000,  'mg/m²', '点滴', true),
  (15, CURRENT_DATE,     'ナブパクリタキセル',125,  'mg/m²', '点滴', true),
  (15, CURRENT_DATE,     'グラニセトロン',   1,     'mg',    '点滴', false),
-- 将来オーダー (1週後)
  (8,  CURRENT_DATE + 7, 'オキサリプラチン', 85,    'mg/m²', '点滴', true),
  (8,  CURRENT_DATE + 7, '5-FU',             2400,  'mg/m²', '点滴', true),
  (9,  CURRENT_DATE + 7, 'カルボプラチン',   5,     'AUC',   '点滴', true),
  (9,  CURRENT_DATE + 7, 'ペメトレキセド',   500,   'mg/m²', '点滴', true),
  (10, CURRENT_DATE + 7, 'リツキシマブ',     375,   'mg/m²', '点滴', true),
  (11, CURRENT_DATE + 7, 'パクリタキセル',   175,   'mg/m²', '点滴', true),
  (14, CURRENT_DATE + 7, 'オキサリプラチン', 85,    'mg/m²', '点滴', true),
  (15, CURRENT_DATE + 7, 'ゲムシタビン',     1000,  'mg/m²', '点滴', true),
-- 将来オーダー (2週後)
  (8,  CURRENT_DATE + 14,'オキサリプラチン', 85,    'mg/m²', '点滴', true),
  (8,  CURRENT_DATE + 14,'5-FU',             2400,  'mg/m²', '点滴', true),
  (13, CURRENT_DATE + 14,'トラスツズマブ',   6,     'mg/kg', '点滴', true),
  (15, CURRENT_DATE + 14,'ゲムシタビン',     1000,  'mg/m²', '点滴', true)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 15. regimen_calendar に新規患者分を追加
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO regimen_calendar (patient_id, regimen_id, treatment_date, cycle_no, status, audit_status) VALUES
  (8,  1,  CURRENT_DATE,         1, 'done',    'audited'),
  (8,  1,  CURRENT_DATE + 7,     2, 'planned', null),
  (8,  1,  CURRENT_DATE + 14,    3, 'planned', null),
  (8,  1,  CURRENT_DATE + 21,    4, 'planned', null),
  (9,  12, CURRENT_DATE,         1, 'planned', null),
  (9,  12, CURRENT_DATE + 7,     2, 'planned', null),
  (9,  12, CURRENT_DATE + 14,    3, 'planned', null),
  (10, 9,  CURRENT_DATE,         3, 'done',    'audited'),
  (10, 9,  CURRENT_DATE + 7,     4, 'planned', null),
  (10, 9,  CURRENT_DATE + 14,    5, 'planned', null),
  (11, 11, CURRENT_DATE,         2, 'planned', null),
  (11, 11, CURRENT_DATE + 7,     3, 'planned', null),
  (11, 11, CURRENT_DATE + 21,    4, 'planned', null),
  (13, 14, CURRENT_DATE,         5, 'done',    'audited'),
  (13, 14, CURRENT_DATE + 14,    6, 'planned', null),
  (14, 1,  CURRENT_DATE,         2, 'planned', null),
  (14, 1,  CURRENT_DATE + 7,     3, 'planned', null),
  (14, 1,  CURRENT_DATE + 21,    4, 'planned', null),
  (15, 10, CURRENT_DATE,         1, 'planned', null),
  (15, 10, CURRENT_DATE + 14,    2, 'planned', null)
ON CONFLICT (patient_id, regimen_id, treatment_date) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 結果確認
-- ─────────────────────────────────────────────────────────────────────
SELECT 'patients'              AS tbl, COUNT(*) FROM patients
UNION ALL SELECT 'users',               COUNT(*) FROM users
UNION ALL SELECT 'regimens',            COUNT(*) FROM regimens
UNION ALL SELECT 'scheduled_treatments',COUNT(*) FROM scheduled_treatments
UNION ALL SELECT 'scheduled TODAY',     COUNT(*) FROM scheduled_treatments WHERE scheduled_date=CURRENT_DATE
UNION ALL SELECT 'patient_vitals',      COUNT(*) FROM patient_vitals
UNION ALL SELECT 'patient_lab_history', COUNT(*) FROM patient_lab_history
UNION ALL SELECT 'patient_orders',      COUNT(*) FROM patient_orders
UNION ALL SELECT 'regimen_calendar',    COUNT(*) FROM regimen_calendar
UNION ALL SELECT 'interventions',       COUNT(*) FROM interventions
UNION ALL SELECT 'work_diaries',        COUNT(*) FROM work_diaries
UNION ALL SELECT 'work_diary_pharmacists',COUNT(*) FROM work_diary_pharmacists
UNION ALL SELECT 'pre_consult_deps enabled',COUNT(*) FROM pre_consult_departments WHERE is_enabled=true
ORDER BY 1;
