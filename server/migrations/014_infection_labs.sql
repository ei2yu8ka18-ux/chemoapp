-- =====================================================================
-- Migration 014: 感染症検査データ列追加 + テストデータ
-- 対象: patient_lab_history に HBs抗原/HBs抗体/HBc抗体/HBVDNA定量を追加
-- =====================================================================

-- ── 感染症検査列の追加 ──────────────────────────────────────────────
ALTER TABLE patient_lab_history
  ADD COLUMN IF NOT EXISTS hbs_ag       VARCHAR(20) DEFAULT NULL,   -- HBs抗原  (陽性/陰性/定量値)
  ADD COLUMN IF NOT EXISTS hbs_ag_date  DATE        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hbs_ab       VARCHAR(20) DEFAULT NULL,   -- HBs抗体
  ADD COLUMN IF NOT EXISTS hbs_ab_date  DATE        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hbc_ab       VARCHAR(20) DEFAULT NULL,   -- HBc抗体
  ADD COLUMN IF NOT EXISTS hbc_ab_date  DATE        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hbv_dna      VARCHAR(40) DEFAULT NULL,   -- HBVDNA定量 (例: '2.1 LogIU/mL' / '検出せず')
  ADD COLUMN IF NOT EXISTS hbv_dna_date DATE        DEFAULT NULL;

-- ── 感染症検査専用テーブル（最終結果のみ保持） ───────────────────────
-- patient_lab_history には時系列の採血データが入るが、
-- HBs/HBV は頻度が少ないので別テーブルに最新値を保持する
CREATE TABLE IF NOT EXISTS patient_infection_labs (
  id           SERIAL PRIMARY KEY,
  patient_id   INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  test_name    VARCHAR(30) NOT NULL,   -- 'HBs抗原' / 'HBs抗体' / 'HBc抗体' / 'HBVDNA定量'
  result       VARCHAR(60) NOT NULL,   -- '陰性' / '陽性' / '2.1 LogIU/mL' / '検出せず' 等
  test_date    DATE        NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (patient_id, test_name, test_date)
);

-- ── テストデータ ──────────────────────────────────────────────────
INSERT INTO patient_infection_labs (patient_id, test_name, result, test_date) VALUES
  -- 患者1
  (1, 'HBs抗原',    '陰性',           CURRENT_DATE - INTERVAL '180 days'),
  (1, 'HBs抗体',    '陽性',           CURRENT_DATE - INTERVAL '180 days'),
  (1, 'HBc抗体',    '陰性',           CURRENT_DATE - INTERVAL '180 days'),
  (1, 'HBVDNA定量', '検出せず',       CURRENT_DATE - INTERVAL '180 days'),
  -- 患者2
  (2, 'HBs抗原',    '陰性',           CURRENT_DATE - INTERVAL '90 days'),
  (2, 'HBs抗体',    '陰性',           CURRENT_DATE - INTERVAL '90 days'),
  (2, 'HBc抗体',    '陽性',           CURRENT_DATE - INTERVAL '90 days'),
  (2, 'HBVDNA定量', '検出せず',       CURRENT_DATE - INTERVAL '90 days'),
  -- 患者3（HBs抗原陽性例）
  (3, 'HBs抗原',    '陽性',           CURRENT_DATE - INTERVAL '60 days'),
  (3, 'HBs抗体',    '陰性',           CURRENT_DATE - INTERVAL '60 days'),
  (3, 'HBc抗体',    '陽性',           CURRENT_DATE - INTERVAL '60 days'),
  (3, 'HBVDNA定量', '2.8 LogIU/mL',  CURRENT_DATE - INTERVAL '60 days'),
  -- 患者4
  (4, 'HBs抗原',    '陰性',           CURRENT_DATE - INTERVAL '120 days'),
  (4, 'HBs抗体',    '陽性',           CURRENT_DATE - INTERVAL '120 days'),
  (4, 'HBc抗体',    '陰性',           CURRENT_DATE - INTERVAL '120 days'),
  -- 患者5
  (5, 'HBs抗原',    '陰性',           CURRENT_DATE - INTERVAL '150 days'),
  (5, 'HBs抗体',    '陰性',           CURRENT_DATE - INTERVAL '150 days'),
  (5, 'HBc抗体',    '陰性',           CURRENT_DATE - INTERVAL '150 days'),
  (5, 'HBVDNA定量', '検出せず',       CURRENT_DATE - INTERVAL '150 days')
ON CONFLICT (patient_id, test_name, test_date) DO NOTHING;
