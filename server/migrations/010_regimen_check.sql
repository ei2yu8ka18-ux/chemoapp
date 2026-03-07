-- =====================================================
-- Migration 010: レジメン監査機能 (新テーブル + テストデータ)
-- =====================================================

-- ── 患者テーブル拡張 ──────────────────────────────────────────
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS dob    DATE,
  ADD COLUMN IF NOT EXISTS gender VARCHAR(10); -- 男性/女性

-- ── 体格履歴（DWHから取得 → 本DBにキャッシュ） ───────────────
CREATE TABLE IF NOT EXISTS patient_vitals (
  id            SERIAL PRIMARY KEY,
  patient_id    INTEGER REFERENCES patients(id),
  measured_date DATE NOT NULL,
  height_cm     NUMERIC(5,1),
  weight_kg     NUMERIC(5,1),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(patient_id, measured_date)
);

-- ── 検査値履歴（DWHから取得） ──────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_lab_history (
  id         SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id),
  lab_date   DATE NOT NULL,
  wbc        NUMERIC(6,2),   -- ×10³/μL
  anc        NUMERIC(6,2),   -- ×10³/μL
  plt        NUMERIC(6,1),   -- ×10³/μL
  hgb        NUMERIC(5,1),   -- g/dL
  mono       NUMERIC(5,2),   -- ×10³/μL
  cre        NUMERIC(5,2),   -- mg/dL
  egfr       NUMERIC(5,1),   -- mL/min/1.73m²
  ast        INTEGER,        -- U/L
  alt        INTEGER,        -- U/L
  tbil       NUMERIC(4,2),   -- mg/dL
  crp        NUMERIC(5,2),   -- mg/dL
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(patient_id, lab_date)
);

-- ── 既往歴（DWHから取得） ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_medical_history (
  id             SERIAL PRIMARY KEY,
  patient_id     INTEGER REFERENCES patients(id),
  condition_name VARCHAR(200) NOT NULL,
  onset_date     DATE,
  end_date       DATE,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── オーダー履歴（DWHから取得） ───────────────────────────────
CREATE TABLE IF NOT EXISTS patient_orders (
  id               SERIAL PRIMARY KEY,
  patient_id       INTEGER REFERENCES patients(id),
  order_date       DATE NOT NULL,
  order_no         VARCHAR(50),
  drug_name        VARCHAR(200) NOT NULL,
  dose             NUMERIC(10,3),
  dose_unit        VARCHAR(30),
  route            VARCHAR(50),
  days             INTEGER DEFAULT 1,
  regimen_name     VARCHAR(100),
  order_type       VARCHAR(20) DEFAULT 'injection', -- injection/oral
  is_antineoplastic BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── レジメン監査ログ ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS regimen_audits (
  id               SERIAL PRIMARY KEY,
  patient_id       INTEGER REFERENCES patients(id),
  audit_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  pharmacist_name  VARCHAR(100),
  comment          TEXT,
  handover_note    TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── 疑義照会タスク ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS regimen_doubts (
  id               SERIAL PRIMARY KEY,
  patient_id       INTEGER REFERENCES patients(id),
  doubt_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  content          TEXT NOT NULL,
  status           VARCHAR(20) DEFAULT 'open', -- open / resolved
  resolution       TEXT,
  pharmacist_name  VARCHAR(100),
  resolved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── レジメンカレンダー（投与歴管理） ─────────────────────────
CREATE TABLE IF NOT EXISTS regimen_calendar (
  id                       SERIAL PRIMARY KEY,
  patient_id               INTEGER REFERENCES patients(id),
  regimen_id               INTEGER REFERENCES regimens(id),
  treatment_date           DATE NOT NULL,
  cycle_no                 INTEGER DEFAULT 1,
  status                   VARCHAR(20) DEFAULT 'planned', -- planned/done/cancelled
  audit_status             VARCHAR(20) DEFAULT NULL,       -- NULL or 'audited'
  notes                    TEXT,
  scheduled_treatment_id   INTEGER REFERENCES scheduled_treatments(id) DEFAULT NULL,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(patient_id, regimen_id, treatment_date)
);

-- =====================================================
-- テストデータ
-- =====================================================

-- 患者の生年月日・性別更新
UPDATE patients SET dob = '1958-04-10', gender = '女性' WHERE patient_no = '1797323';
UPDATE patients SET dob = '1969-11-28', gender = '女性' WHERE patient_no = '2400687';
UPDATE patients SET dob = '1952-07-05', gender = '男性' WHERE patient_no = '3062676';
UPDATE patients SET dob = '1975-02-14', gender = '女性' WHERE patient_no = '3084969';
UPDATE patients SET dob = '1963-09-20', gender = '女性' WHERE patient_no = '3340072';
UPDATE patients SET dob = '1948-12-03', gender = '男性' WHERE patient_no = '3608130';
UPDATE patients SET dob = '1961-06-17', gender = '男性' WHERE patient_no = '3643921';

-- ── 体格履歴（月次、過去13ヶ月） ──────────────────────────────
-- 患者1797323: 女性 155cm, 体重がん治療で軽度減少傾向
INSERT INTO patient_vitals (patient_id, measured_date, height_cm, weight_kg)
SELECT p.id,
       (CURRENT_DATE - (n || ' months')::INTERVAL)::DATE,
       155.0,
       52.0 - n * 0.15 + (CASE WHEN n % 3 = 0 THEN 0.3 ELSE -0.1 END)
FROM patients p
CROSS JOIN generate_series(0, 12) AS n
WHERE p.patient_no = '1797323'
ON CONFLICT DO NOTHING;

-- 患者2400687: 女性 158cm
INSERT INTO patient_vitals (patient_id, measured_date, height_cm, weight_kg)
SELECT p.id,
       (CURRENT_DATE - (n || ' months')::INTERVAL)::DATE,
       158.0,
       60.5 - n * 0.1 + (CASE WHEN n % 4 = 1 THEN 0.5 ELSE 0 END)
FROM patients p
CROSS JOIN generate_series(0, 12) AS n
WHERE p.patient_no = '2400687'
ON CONFLICT DO NOTHING;

-- 患者3062676: 男性 168cm
INSERT INTO patient_vitals (patient_id, measured_date, height_cm, weight_kg)
SELECT p.id,
       (CURRENT_DATE - (n || ' months')::INTERVAL)::DATE,
       168.0,
       72.0 - n * 0.2 + (CASE WHEN n % 3 = 2 THEN 0.4 ELSE 0 END)
FROM patients p
CROSS JOIN generate_series(0, 12) AS n
WHERE p.patient_no = '3062676'
ON CONFLICT DO NOTHING;

-- 患者3084969: 女性 162cm
INSERT INTO patient_vitals (patient_id, measured_date, height_cm, weight_kg)
SELECT p.id,
       (CURRENT_DATE - (n || ' months')::INTERVAL)::DATE,
       162.0,
       58.0 - n * 0.08
FROM patients p
CROSS JOIN generate_series(0, 12) AS n
WHERE p.patient_no = '3084969'
ON CONFLICT DO NOTHING;

-- 患者3340072: 女性 157cm
INSERT INTO patient_vitals (patient_id, measured_date, height_cm, weight_kg)
SELECT p.id,
       (CURRENT_DATE - (n || ' months')::INTERVAL)::DATE,
       157.0,
       55.0 - n * 0.25 + (CASE WHEN n % 2 = 0 THEN 0.2 ELSE 0 END)
FROM patients p
CROSS JOIN generate_series(0, 12) AS n
WHERE p.patient_no = '3340072'
ON CONFLICT DO NOTHING;

-- 患者3608130: 男性 164cm
INSERT INTO patient_vitals (patient_id, measured_date, height_cm, weight_kg)
SELECT p.id,
       (CURRENT_DATE - (n || ' months')::INTERVAL)::DATE,
       164.0,
       68.0 + (CASE WHEN n % 4 = 0 THEN 0.5 ELSE -0.1 END)
FROM patients p
CROSS JOIN generate_series(0, 12) AS n
WHERE p.patient_no = '3608130'
ON CONFLICT DO NOTHING;

-- 患者3643921: 男性 170cm
INSERT INTO patient_vitals (patient_id, measured_date, height_cm, weight_kg)
SELECT p.id,
       (CURRENT_DATE - (n || ' months')::INTERVAL)::DATE,
       170.0,
       76.0 - n * 0.3 + (CASE WHEN n % 3 = 1 THEN 0.6 ELSE 0 END)
FROM patients p
CROSS JOIN generate_series(0, 12) AS n
WHERE p.patient_no = '3643921'
ON CONFLICT DO NOTHING;

-- ── 検査値履歴（3週毎、過去12ヶ月 = 17サイクル） ──────────────
-- 化学療法で骨髄抑制が出る典型的なパターン（サイクルごとに変動）

-- 患者1797323 (オキバイド+5FU/LV, q2w)
INSERT INTO patient_lab_history (patient_id, lab_date, wbc, anc, plt, hgb, mono, cre, egfr, ast, alt, tbil, crp)
SELECT p.id,
       (CURRENT_DATE - (n * 14 || ' days')::INTERVAL)::DATE,
       -- 骨髄抑制パターン: 偶数回に低下
       GREATEST(0.5, 5.8 - (CASE WHEN n % 3 = 1 THEN 3.2 ELSE 0 END) + (random()-0.5)*0.5),
       GREATEST(0.1, 3.2 - (CASE WHEN n % 3 = 1 THEN 2.5 ELSE 0 END) + (random()-0.5)*0.3),
       GREATEST(50,  195  - (CASE WHEN n % 3 = 1 THEN 90  ELSE 0 END) + (random()-0.5)*20),
       GREATEST(6.5, 11.2 - (CASE WHEN n % 3 = 1 THEN 1.5 ELSE 0 END) + (random()-0.5)*0.5),
       GREATEST(0.05, 0.55 - (CASE WHEN n % 3 = 1 THEN 0.3 ELSE 0 END) + (random()-0.5)*0.1),
       0.65 + (n * 0.01) + (random()-0.5)*0.05,
       GREATEST(30, 85 - n * 0.8 + (random()-0.5)*5),
       GREATEST(10, 22 + (CASE WHEN n % 5 = 2 THEN 15 ELSE 0 END) + (random()-0.5)*5),
       GREATEST(5,  18 + (CASE WHEN n % 5 = 2 THEN 25 ELSE 0 END) + (random()-0.5)*5),
       0.65 + (random()-0.5)*0.15,
       0.25 + (CASE WHEN n % 4 = 0 THEN 0.5 ELSE 0 END) + (random()-0.5)*0.1
FROM patients p
CROSS JOIN generate_series(0, 17) AS n
WHERE p.patient_no = '1797323'
ON CONFLICT DO NOTHING;

-- 患者2400687 (weeklyPAC, q1w)
INSERT INTO patient_lab_history (patient_id, lab_date, wbc, anc, plt, hgb, mono, cre, egfr, ast, alt, tbil, crp)
SELECT p.id,
       (CURRENT_DATE - (n * 7 || ' days')::INTERVAL)::DATE,
       GREATEST(0.8, 6.2 - (CASE WHEN n % 4 = 2 THEN 2.5 ELSE 0 END) + (random()-0.5)*0.6),
       GREATEST(0.2, 3.8 - (CASE WHEN n % 4 = 2 THEN 2.0 ELSE 0 END) + (random()-0.5)*0.4),
       GREATEST(60,  220  - (CASE WHEN n % 4 = 2 THEN 80  ELSE 0 END) + (random()-0.5)*25),
       GREATEST(7.0, 11.8 - n * 0.05 + (random()-0.5)*0.4),
       GREATEST(0.1, 0.6  - (CASE WHEN n % 4 = 2 THEN 0.25 ELSE 0 END) + (random()-0.5)*0.1),
       0.75 + (random()-0.5)*0.08,
       72 + (random()-0.5)*8,
       20 + (CASE WHEN n % 6 = 3 THEN 18 ELSE 0 END) + (random()-0.5)*4,
       16 + (CASE WHEN n % 6 = 3 THEN 22 ELSE 0 END) + (random()-0.5)*4,
       0.7 + (random()-0.5)*0.12,
       0.18 + (random()-0.5)*0.08
FROM patients p
CROSS JOIN generate_series(0, 25) AS n
WHERE p.patient_no = '2400687'
ON CONFLICT DO NOTHING;

-- 患者3062676 (パドセブ, q3w)
INSERT INTO patient_lab_history (patient_id, lab_date, wbc, anc, plt, hgb, mono, cre, egfr, ast, alt, tbil, crp)
SELECT p.id,
       (CURRENT_DATE - (n * 21 || ' days')::INTERVAL)::DATE,
       GREATEST(0.6, 5.5 - (CASE WHEN n % 2 = 1 THEN 2.8 ELSE 0 END) + (random()-0.5)*0.5),
       GREATEST(0.1, 3.0 - (CASE WHEN n % 2 = 1 THEN 2.2 ELSE 0 END) + (random()-0.5)*0.3),
       GREATEST(40,  180  - (CASE WHEN n % 2 = 1 THEN 100 ELSE 0 END) + (random()-0.5)*15),
       GREATEST(7.5, 12.5 - n * 0.1 + (random()-0.5)*0.4),
       GREATEST(0.05, 0.5 - (CASE WHEN n % 2 = 1 THEN 0.28 ELSE 0 END) + (random()-0.5)*0.1),
       1.1 + n * 0.02 + (random()-0.5)*0.05,
       GREATEST(20, 58 - n * 1.2 + (random()-0.5)*5),
       25 + (CASE WHEN n % 3 = 0 THEN 12 ELSE 0 END) + (random()-0.5)*4,
       22 + (CASE WHEN n % 3 = 0 THEN 18 ELSE 0 END) + (random()-0.5)*5,
       0.85 + (random()-0.5)*0.2,
       0.35 + (random()-0.5)*0.12
FROM patients p
CROSS JOIN generate_series(0, 13) AS n
WHERE p.patient_no = '3062676'
ON CONFLICT DO NOTHING;

-- 患者3084969 (フェスゴ+DTX, q3w)
INSERT INTO patient_lab_history (patient_id, lab_date, wbc, anc, plt, hgb, mono, cre, egfr, ast, alt, tbil, crp)
SELECT p.id,
       (CURRENT_DATE - (n * 21 || ' days')::INTERVAL)::DATE,
       GREATEST(0.5, 6.0 - (CASE WHEN n % 2 = 1 THEN 3.5 ELSE 0 END) + (random()-0.5)*0.5),
       GREATEST(0.08, 3.5 - (CASE WHEN n % 2 = 1 THEN 2.8 ELSE 0 END) + (random()-0.5)*0.3),
       GREATEST(50,  210  - (CASE WHEN n % 2 = 1 THEN 110 ELSE 0 END) + (random()-0.5)*20),
       GREATEST(7.0, 12.0 - n * 0.08 + (random()-0.5)*0.4),
       GREATEST(0.08, 0.58 - (CASE WHEN n % 2 = 1 THEN 0.32 ELSE 0 END) + (random()-0.5)*0.08),
       0.72 + (random()-0.5)*0.06,
       78 + (random()-0.5)*7,
       24 + (CASE WHEN n % 4 = 2 THEN 20 ELSE 0 END) + (random()-0.5)*4,
       20 + (CASE WHEN n % 4 = 2 THEN 28 ELSE 0 END) + (random()-0.5)*5,
       0.62 + (random()-0.5)*0.1,
       0.22 + (random()-0.5)*0.08
FROM patients p
CROSS JOIN generate_series(0, 13) AS n
WHERE p.patient_no = '3084969'
ON CONFLICT DO NOTHING;

-- 患者3340072 (BV+FOLFIRI, q2w)
INSERT INTO patient_lab_history (patient_id, lab_date, wbc, anc, plt, hgb, mono, cre, egfr, ast, alt, tbil, crp)
SELECT p.id,
       (CURRENT_DATE - (n * 14 || ' days')::INTERVAL)::DATE,
       GREATEST(0.7, 5.2 - (CASE WHEN n % 3 = 1 THEN 2.8 ELSE 0 END) + (random()-0.5)*0.5),
       GREATEST(0.1, 2.8 - (CASE WHEN n % 3 = 1 THEN 2.0 ELSE 0 END) + (random()-0.5)*0.3),
       GREATEST(55,  175  - (CASE WHEN n % 3 = 1 THEN 85  ELSE 0 END) + (random()-0.5)*18),
       GREATEST(7.5, 10.5 - n * 0.06 + (random()-0.5)*0.4),
       GREATEST(0.06, 0.48 - (CASE WHEN n % 3 = 1 THEN 0.25 ELSE 0 END) + (random()-0.5)*0.08),
       0.68 + (random()-0.5)*0.06,
       82 + (random()-0.5)*6,
       22 + (CASE WHEN n % 5 = 3 THEN 14 ELSE 0 END) + (random()-0.5)*4,
       18 + (CASE WHEN n % 5 = 3 THEN 20 ELSE 0 END) + (random()-0.5)*4,
       0.70 + (random()-0.5)*0.12,
       0.28 + (CASE WHEN n % 4 = 0 THEN 0.6 ELSE 0 END) + (random()-0.5)*0.1
FROM patients p
CROSS JOIN generate_series(0, 17) AS n
WHERE p.patient_no = '3340072'
ON CONFLICT DO NOTHING;

-- 患者3608130 (アクテムラ, q4w) — リウマチ・骨髄抑制は少ない
INSERT INTO patient_lab_history (patient_id, lab_date, wbc, anc, plt, hgb, mono, cre, egfr, ast, alt, tbil, crp)
SELECT p.id,
       (CURRENT_DATE - (n * 28 || ' days')::INTERVAL)::DATE,
       5.8 + (random()-0.5)*1.2,
       3.5 + (random()-0.5)*0.8,
       200 + (random()-0.5)*40,
       12.5 + (random()-0.5)*1.0,
       0.55 + (random()-0.5)*0.1,
       0.95 + (random()-0.5)*0.08,
       72 + (random()-0.5)*8,
       25 + (random()-0.5)*6,
       20 + (random()-0.5)*5,
       0.72 + (random()-0.5)*0.1,
       -- アクテムラでCRPが著明に低下
       GREATEST(0.02, 3.5 - n * 0.25 + (random()-0.5)*0.3)
FROM patients p
CROSS JOIN generate_series(0, 12) AS n
WHERE p.patient_no = '3608130'
ON CONFLICT DO NOTHING;

-- 患者3643921 (DTX, q3w)
INSERT INTO patient_lab_history (patient_id, lab_date, wbc, anc, plt, hgb, mono, cre, egfr, ast, alt, tbil, crp)
SELECT p.id,
       (CURRENT_DATE - (n * 21 || ' days')::INTERVAL)::DATE,
       GREATEST(0.5, 5.8 - (CASE WHEN n % 2 = 1 THEN 3.8 ELSE 0 END) + (random()-0.5)*0.5),
       GREATEST(0.05, 3.2 - (CASE WHEN n % 2 = 1 THEN 2.9 ELSE 0 END) + (random()-0.5)*0.3),
       GREATEST(60,  185  - (CASE WHEN n % 2 = 1 THEN 80  ELSE 0 END) + (random()-0.5)*18),
       GREATEST(8.0, 13.0 - n * 0.12 + (random()-0.5)*0.5),
       GREATEST(0.08, 0.52 - (CASE WHEN n % 2 = 1 THEN 0.3 ELSE 0 END) + (random()-0.5)*0.08),
       0.88 + (random()-0.5)*0.08,
       80 + (random()-0.5)*8,
       28 + (CASE WHEN n % 3 = 1 THEN 18 ELSE 0 END) + (random()-0.5)*5,
       24 + (CASE WHEN n % 3 = 1 THEN 22 ELSE 0 END) + (random()-0.5)*5,
       0.78 + (random()-0.5)*0.12,
       0.32 + (random()-0.5)*0.1
FROM patients p
CROSS JOIN generate_series(0, 13) AS n
WHERE p.patient_no = '3643921'
ON CONFLICT DO NOTHING;

-- ── 既往歴 ──────────────────────────────────────────────────
INSERT INTO patient_medical_history (patient_id, condition_name, onset_date, end_date, notes)
SELECT p.id, v.cond, v.ons::date, v.ed::date, v.notes
FROM patients p
JOIN (VALUES
  ('1797323', '膵体部腺癌 cT3N1M0 StageIII',   '2023-08-01', NULL,         'オキサリプラチン+5FU/LV 開始'),
  ('1797323', '高血圧症',                        '2015-04-15', NULL,         'アムロジピン5mg'),
  ('1797323', '2型糖尿病',                       '2018-06-20', NULL,         'メトホルミン500mg'),
  ('2400687', '右乳癌 cT2N1M0 StageIIA',        '2023-11-10', NULL,         'weekly Paclitaxel 3rd cycle'),
  ('2400687', '甲状腺機能低下症',                '2010-03-05', NULL,         'レボチロキシン'),
  ('2400687', '卵巣嚢腫（摘出済）',              '2005-09-12', '2006-02-28', '腹腔鏡下切除'),
  ('3062676', '膀胱尿路上皮癌 pT2N0M0 StageII', '2024-01-15', NULL,         'Padcev（エンホルツマブ）2nd line'),
  ('3062676', '慢性腎臓病 G3b',                 '2019-07-01', NULL,         'eGFR 38-42 推移'),
  ('3062676', '前立腺肥大症',                   '2016-05-20', NULL,         'タムスロシン0.2mg'),
  ('3084969', 'HER2陽性乳癌 cT3N2M0 StageIIIB', '2023-09-05', NULL,         'フェスゴ+DTX 4th cycle'),
  ('3084969', '高脂血症',                        '2017-11-30', NULL,         'ロスバスタチン5mg'),
  ('3340072', '肺腺癌 cT1bN2M1b StageIVB',      '2023-06-20', NULL,         'BV+FOLFIRI 9th cycle'),
  ('3340072', '高血圧症',                        '2012-08-10', NULL,         'アムロジピン10mg＋エナラプリル'),
  ('3340072', '大腸ポリープ（腺腫）摘出',        '2020-02-15', '2020-02-15', '内視鏡的ポリペクトミー'),
  ('3608130', '関節リウマチ',                    '2010-05-12', NULL,         'アクテムラ12回目'),
  ('3608130', '骨粗鬆症',                        '2018-09-20', NULL,         'アレンドロン酸'),
  ('3643921', '前立腺腺癌 cT3bN1M0 StageIVA',   '2024-03-01', NULL,         'DTX 3rd cycle'),
  ('3643921', '高血圧症',                        '2014-02-18', NULL,         'カルシウム拮抗薬'),
  ('3643921', '脂質異常症',                      '2016-06-05', NULL,         'スタチン系薬剤')
) AS v(patient_no, cond, ons, ed, notes) ON p.patient_no = v.patient_no
ON CONFLICT DO NOTHING;

-- ── オーダー履歴 ────────────────────────────────────────────
-- 本日のオーダー
INSERT INTO patient_orders (patient_id, order_date, order_no, drug_name, dose, dose_unit, route, days, regimen_name, order_type, is_antineoplastic)
SELECT p.id, CURRENT_DATE, v.ono, v.drug, v.dose::numeric, v.unit, v.route, v.days::int, v.reg, v.otype, v.antineo::boolean
FROM patients p
JOIN (VALUES
  -- 1797323 オキバイド+5FU/LV (BSA 1.49 m²)
  ('1797323','RC240301','オキサリプラチン点滴静注液', 127.0, 'mg', '点滴静注 2時間',1,'オキバイド+5FU/LV','injection',true),
  ('1797323','RC240302','レボホリナートカルシウム点滴静注',  298.0, 'mg', '点滴静注 2時間',1,'オキバイド+5FU/LV','injection',false),
  ('1797323','RC240303','フルオロウラシル注射液 急速投与',   600.0, 'mg', '点滴静注 急速',1,'オキバイド+5FU/LV','injection',true),
  ('1797323','RC240304','フルオロウラシル注射液 持続投与',  3600.0, 'mg', '持続点滴46時間',2,'オキバイド+5FU/LV','injection',true),
  -- 2400687 weeklyPAC (BSA 1.59 m²)
  ('2400687','RC240401','パクリタキセル注射液', 127.0, 'mg', '点滴静注 3時間',1,'weeklyPAC','injection',true),
  -- 3062676 パドセブ (BSA 1.72 m²)
  ('3062676','RC240501','エンホルツマブベドチン', 80.0, 'mg', '点滴静注 30分',1,'パドセブ','injection',true),
  -- 3084969 フェスゴ+DTX (BSA 1.64 m²)
  ('3084969','RC240601','ドセタキセル注射液', 98.4, 'mg', '点滴静注 1時間',1,'フェスゴ+DTX','injection',true),
  ('3084969','RC240602','フェスゴ皮下注', 1200.0, 'mg', '皮下注射',1,'フェスゴ+DTX','injection',true),
  -- 3340072 BV+FOLFIRI (BSA 1.51 m²)
  ('3340072','RC240701','ベバシズマブ注射液',   302.0, 'mg', '点滴静注 30分',1,'BV+FOLFIRI','injection',true),
  ('3340072','RC240702','イリノテカン塩酸塩注射液', 241.6, 'mg', '点滴静注 90分',1,'BV+FOLFIRI','injection',true),
  ('3340072','RC240703','レボホリナートカルシウム',  302.0, 'mg', '点滴静注 2時間',1,'BV+FOLFIRI','injection',false),
  ('3340072','RC240704','フルオロウラシル急速', 604.0, 'mg', '急速投与',1,'BV+FOLFIRI','injection',true),
  ('3340072','RC240705','フルオロウラシル持続',3624.0, 'mg', '持続46時間',2,'BV+FOLFIRI','injection',true),
  -- 3608130 アクテムラ
  ('3608130','RC240801','トシリズマブ注射液', 544.0, 'mg', '点滴静注 1時間',1,'アクテムラ','injection',false),
  -- 3643921 DTX (BSA 1.87 m²)
  ('3643921','RC240901','ドセタキセル注射液', 112.0, 'mg', '点滴静注 1時間',1,'DTX','injection',true)
) AS v(patient_no, ono, drug, dose, unit, route, days, reg, otype, antineo) ON p.patient_no = v.patient_no
ON CONFLICT DO NOTHING;

-- 次回予定オーダー（2週後/1週後/3週後 など各レジメンの次サイクル）
INSERT INTO patient_orders (patient_id, order_date, order_no, drug_name, dose, dose_unit, route, days, regimen_name, order_type, is_antineoplastic)
SELECT p.id, v.next_date::date, v.ono, v.drug, v.dose::numeric, v.unit, v.route, v.days::int, v.reg, v.otype, v.antineo::boolean
FROM patients p
JOIN (VALUES
  ('1797323', CURRENT_DATE + 14, 'FT240301','オキサリプラチン点滴静注液',  127.0,'mg','点滴静注 2時間',1,'オキバイド+5FU/LV','injection',true),
  ('1797323', CURRENT_DATE + 14, 'FT240302','レボホリナートカルシウム',     298.0,'mg','点滴静注 2時間',1,'オキバイド+5FU/LV','injection',false),
  ('1797323', CURRENT_DATE + 14, 'FT240303','フルオロウラシル急速',          600.0,'mg','点滴静注 急速',1,'オキバイド+5FU/LV','injection',true),
  ('1797323', CURRENT_DATE + 14, 'FT240304','フルオロウラシル持続',          3600.0,'mg','持続点滴46時間',2,'オキバイド+5FU/LV','injection',true),
  ('2400687', CURRENT_DATE + 7,  'FT240401','パクリタキセル注射液',           127.0,'mg','点滴静注 3時間',1,'weeklyPAC','injection',true),
  ('3062676', CURRENT_DATE + 21, 'FT240501','エンホルツマブベドチン',          80.0,'mg','点滴静注 30分',1,'パドセブ','injection',true),
  ('3084969', CURRENT_DATE + 21, 'FT240601','ドセタキセル注射液',              98.4,'mg','点滴静注 1時間',1,'フェスゴ+DTX','injection',true),
  ('3084969', CURRENT_DATE + 21, 'FT240602','フェスゴ皮下注',                1200.0,'mg','皮下注射',1,'フェスゴ+DTX','injection',true),
  ('3340072', CURRENT_DATE + 14, 'FT240701','ベバシズマブ注射液',              302.0,'mg','点滴静注 30分',1,'BV+FOLFIRI','injection',true),
  ('3340072', CURRENT_DATE + 14, 'FT240702','イリノテカン塩酸塩注射液',        241.6,'mg','点滴静注 90分',1,'BV+FOLFIRI','injection',true),
  ('3340072', CURRENT_DATE + 14, 'FT240703','レボホリナートカルシウム',         302.0,'mg','点滴静注 2時間',1,'BV+FOLFIRI','injection',false),
  ('3340072', CURRENT_DATE + 14, 'FT240704','フルオロウラシル急速',             604.0,'mg','急速投与',1,'BV+FOLFIRI','injection',true),
  ('3340072', CURRENT_DATE + 14, 'FT240705','フルオロウラシル持続',            3624.0,'mg','持続46時間',2,'BV+FOLFIRI','injection',true),
  ('3608130', CURRENT_DATE + 28, 'FT240801','トシリズマブ注射液',               544.0,'mg','点滴静注 1時間',1,'アクテムラ','injection',false),
  ('3643921', CURRENT_DATE + 21, 'FT240901','ドセタキセル注射液',               112.0,'mg','点滴静注 1時間',1,'DTX','injection',true)
) AS v(patient_no, next_date, ono, drug, dose, unit, route, days, reg, otype, antineo) ON p.patient_no = v.patient_no
ON CONFLICT DO NOTHING;

-- ── レジメンカレンダー（過去6ヶ月 + 今日 + 2ヶ月先） ─────────
-- 患者1797323: オキバイド+5FU/LV (q2w)
INSERT INTO regimen_calendar (patient_id, regimen_id, treatment_date, cycle_no, status, audit_status)
SELECT p.id, r.id,
       (CURRENT_DATE - (n * 14 || ' days')::INTERVAL)::DATE,
       14 - n,
       CASE WHEN n = 0 THEN 'planned'
            WHEN n = 2 THEN 'cancelled'
            ELSE 'done' END,
       CASE WHEN n <= 2 THEN 'audited' ELSE NULL END
FROM patients p, regimens r
CROSS JOIN generate_series(0, 13) AS n
WHERE p.patient_no = '1797323' AND r.name = 'オキバイド+5FU/LV'
ON CONFLICT DO NOTHING;
-- 未来2サイクル
INSERT INTO regimen_calendar (patient_id, regimen_id, treatment_date, cycle_no, status, audit_status)
SELECT p.id, r.id,
       (CURRENT_DATE + (n * 14 || ' days')::INTERVAL)::DATE,
       14 + n,
       'planned',
       CASE WHEN n = 1 THEN 'audited' ELSE NULL END
FROM patients p, regimens r
CROSS JOIN generate_series(1, 2) AS n
WHERE p.patient_no = '1797323' AND r.name = 'オキバイド+5FU/LV'
ON CONFLICT DO NOTHING;

-- 患者2400687: weeklyPAC (q1w)
INSERT INTO regimen_calendar (patient_id, regimen_id, treatment_date, cycle_no, status, audit_status)
SELECT p.id, r.id,
       (CURRENT_DATE - (n * 7 || ' days')::INTERVAL)::DATE,
       24 - n,
       CASE WHEN n = 0 THEN 'planned' ELSE 'done' END,
       CASE WHEN n <= 1 THEN 'audited' ELSE NULL END
FROM patients p, regimens r
CROSS JOIN generate_series(0, 24) AS n
WHERE p.patient_no = '2400687' AND r.name = 'weeklyPAC'
ON CONFLICT DO NOTHING;
INSERT INTO regimen_calendar (patient_id, regimen_id, treatment_date, cycle_no, status, audit_status)
SELECT p.id, r.id,
       (CURRENT_DATE + (n * 7 || ' days')::INTERVAL)::DATE,
       24 + n, 'planned', 'audited'
FROM patients p, regimens r
CROSS JOIN generate_series(1, 3) AS n
WHERE p.patient_no = '2400687' AND r.name = 'weeklyPAC'
ON CONFLICT DO NOTHING;

-- 患者3062676: パドセブ (q3w)
INSERT INTO regimen_calendar (patient_id, regimen_id, treatment_date, cycle_no, status, audit_status)
SELECT p.id, r.id,
       (CURRENT_DATE - (n * 21 || ' days')::INTERVAL)::DATE,
       8 - n,
       CASE WHEN n = 0 THEN 'planned' WHEN n = 3 THEN 'cancelled' ELSE 'done' END,
       CASE WHEN n <= 1 THEN 'audited' ELSE NULL END
FROM patients p, regimens r
CROSS JOIN generate_series(0, 7) AS n
WHERE p.patient_no = '3062676' AND r.name = 'パドセブ'
ON CONFLICT DO NOTHING;
INSERT INTO regimen_calendar (patient_id, regimen_id, treatment_date, cycle_no, status, audit_status)
SELECT p.id, r.id,
       (CURRENT_DATE + (n * 21 || ' days')::INTERVAL)::DATE,
       8 + n, 'planned', NULL
FROM patients p, regimens r
CROSS JOIN generate_series(1, 2) AS n
WHERE p.patient_no = '3062676' AND r.name = 'パドセブ'
ON CONFLICT DO NOTHING;

-- 患者3084969: フェスゴ+DTX (q3w)
INSERT INTO regimen_calendar (patient_id, regimen_id, treatment_date, cycle_no, status, audit_status)
SELECT p.id, r.id,
       (CURRENT_DATE - (n * 21 || ' days')::INTERVAL)::DATE,
       6 - n,
       CASE WHEN n = 0 THEN 'planned' ELSE 'done' END,
       CASE WHEN n <= 1 THEN 'audited' ELSE NULL END
FROM patients p, regimens r
CROSS JOIN generate_series(0, 5) AS n
WHERE p.patient_no = '3084969' AND r.name = 'フェスゴ+DTX'
ON CONFLICT DO NOTHING;
INSERT INTO regimen_calendar (patient_id, regimen_id, treatment_date, cycle_no, status, audit_status)
SELECT p.id, r.id,
       (CURRENT_DATE + (n * 21 || ' days')::INTERVAL)::DATE,
       6 + n, 'planned', NULL
FROM patients p, regimens r
CROSS JOIN generate_series(1, 2) AS n
WHERE p.patient_no = '3084969' AND r.name = 'フェスゴ+DTX'
ON CONFLICT DO NOTHING;

-- 患者3340072: BV+FOLFIRI (q2w)
INSERT INTO regimen_calendar (patient_id, regimen_id, treatment_date, cycle_no, status, audit_status)
SELECT p.id, r.id,
       (CURRENT_DATE - (n * 14 || ' days')::INTERVAL)::DATE,
       12 - n,
       CASE WHEN n = 0 THEN 'planned' ELSE 'done' END,
       CASE WHEN n <= 1 THEN 'audited' ELSE NULL END
FROM patients p, regimens r
CROSS JOIN generate_series(0, 11) AS n
WHERE p.patient_no = '3340072' AND r.name = 'BV+FOLFIRI'
ON CONFLICT DO NOTHING;
INSERT INTO regimen_calendar (patient_id, regimen_id, treatment_date, cycle_no, status, audit_status)
SELECT p.id, r.id,
       (CURRENT_DATE + (n * 14 || ' days')::INTERVAL)::DATE,
       12 + n, 'planned', NULL
FROM patients p, regimens r
CROSS JOIN generate_series(1, 3) AS n
WHERE p.patient_no = '3340072' AND r.name = 'BV+FOLFIRI'
ON CONFLICT DO NOTHING;

-- 患者3608130: アクテムラ (q4w)
INSERT INTO regimen_calendar (patient_id, regimen_id, treatment_date, cycle_no, status, audit_status)
SELECT p.id, r.id,
       (CURRENT_DATE - (n * 28 || ' days')::INTERVAL)::DATE,
       15 - n,
       CASE WHEN n = 0 THEN 'planned' ELSE 'done' END,
       CASE WHEN n <= 1 THEN 'audited' ELSE NULL END
FROM patients p, regimens r
CROSS JOIN generate_series(0, 14) AS n
WHERE p.patient_no = '3608130' AND r.name = 'アクテムラ'
ON CONFLICT DO NOTHING;
INSERT INTO regimen_calendar (patient_id, regimen_id, treatment_date, cycle_no, status, audit_status)
SELECT p.id, r.id,
       (CURRENT_DATE + (n * 28 || ' days')::INTERVAL)::DATE,
       15 + n, 'planned', NULL
FROM patients p, regimens r
CROSS JOIN generate_series(1, 2) AS n
WHERE p.patient_no = '3608130' AND r.name = 'アクテムラ'
ON CONFLICT DO NOTHING;

-- 患者3643921: DTX (q3w)
INSERT INTO regimen_calendar (patient_id, regimen_id, treatment_date, cycle_no, status, audit_status)
SELECT p.id, r.id,
       (CURRENT_DATE - (n * 21 || ' days')::INTERVAL)::DATE,
       5 - n,
       CASE WHEN n = 0 THEN 'planned' WHEN n = 1 THEN 'cancelled' ELSE 'done' END,
       CASE WHEN n <= 1 THEN 'audited' ELSE NULL END
FROM patients p, regimens r
CROSS JOIN generate_series(0, 4) AS n
WHERE p.patient_no = '3643921' AND r.name = 'DTX'
ON CONFLICT DO NOTHING;
INSERT INTO regimen_calendar (patient_id, regimen_id, treatment_date, cycle_no, status, audit_status)
SELECT p.id, r.id,
       (CURRENT_DATE + (n * 21 || ' days')::INTERVAL)::DATE,
       5 + n, 'planned', NULL
FROM patients p, regimens r
CROSS JOIN generate_series(1, 2) AS n
WHERE p.patient_no = '3643921' AND r.name = 'DTX'
ON CONFLICT DO NOTHING;

-- ── 疑義照会サンプル ─────────────────────────────────────────
INSERT INTO regimen_doubts (patient_id, doubt_date, content, status, resolution, pharmacist_name, resolved_at)
SELECT p.id, v.dt::date, v.content, v.status, v.resolution, v.ph,
       CASE WHEN v.status = 'resolved' THEN (v.dt::date + interval '1 day') ELSE NULL END
FROM patients p
JOIN (VALUES
  ('1797323', CURRENT_DATE - 14, '前回オキサリプラチン減量の理由確認→Grade2末梢神経障害のため20%減量。今回も同量で継続か？', 'resolved', '担当医確認：同量継続の指示あり', '山田 薬子'),
  ('1797323', CURRENT_DATE,      '5FU持続投与ポンプの設定確認：46時間3600mg。計算値と一致。問題なし', 'resolved', '設定値確認済み', '山田 薬子'),
  ('2400687', CURRENT_DATE - 7,  'パクリタキセル前投薬の抗ヒスタミン薬が処方されていない。追加処方依頼', 'resolved', '担当医に確認、ジフェンヒドラミン追加処方', '鈴木 花子'),
  ('3062676', CURRENT_DATE,      'eGFR 42→38に低下。パドセブの減量基準（eGFR<30）未満のため継続可能だが要注意', 'open', NULL, '山田 薬子'),
  ('3084969', CURRENT_DATE - 21, 'DTX投与前AST/ALT上昇（G2）のため前サイクル延期。今回は基準値内であることを確認', 'resolved', 'AST28/ALT24 確認済み。投与可能', '鈴木 花子'),
  ('3340072', CURRENT_DATE,      'BV前回より20%減量オーダー。減量理由の確認が必要', 'open', NULL, '山田 薬子')
) AS v(patient_no, dt, content, status, resolution, ph) ON p.patient_no = v.patient_no
ON CONFLICT DO NOTHING;

-- ── 監査ログサンプル ──────────────────────────────────────────
INSERT INTO regimen_audits (patient_id, audit_date, pharmacist_name, comment, handover_note)
SELECT p.id, v.dt::date, v.ph, v.comment, v.handover
FROM patients p
JOIN (VALUES
  ('1797323', CURRENT_DATE - 28, '山田 薬子', 'Cycle12 オキサリプラチン 127mg。前回G2末梢神経障害で20%減量済み。今回も同量継続。5FU PK問題なし。', '末梢神経障害の悪化に注意。次回来院時に問診強化。'),
  ('1797323', CURRENT_DATE - 14, '鈴木 花子', 'Cycle13 全投与量確認。検査値問題なし（WBC4.2/ANC2.8/Plt185）。投与可能。', '前回の申し送り受領。神経障害Grade1継続中。'),
  ('2400687', CURRENT_DATE - 7,  '山田 薬子', 'Cycle22 weekly PAC 127mg。皮膚毒性Grade1あり。継続可能。', '皮膚毒性の経過観察。悪化時は減量または休薬。'),
  ('3084969', CURRENT_DATE - 21, '鈴木 花子', 'Cycle5 AST/ALT上昇のため延期。今回再開。DTX 98.4mg確認。', NULL),
  ('3340072', CURRENT_DATE - 14, '山田 薬子', 'Cycle11 BV+FOLFIRI。BVのみ前回比20%減量。高血圧G2のため。FOLFIRI同量。', '高血圧管理状況を毎回確認すること。')
) AS v(patient_no, dt, ph, comment, handover) ON p.patient_no = v.patient_no
ON CONFLICT DO NOTHING;

SELECT 'Migration 010 完了' AS result;
