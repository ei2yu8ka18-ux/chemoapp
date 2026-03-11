-- ============================================================
-- テストデータ投入 & 新テーブル作成マイグレーション
-- 実行: psql "postgresql://chemo_user:chemo_secure_password@localhost:5432/chemo_app" -f test_data_migration.sql
-- ============================================================

BEGIN;

-- ── 1. patients テーブルに列追加 ────────────────────────────
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS dob DATE,
  ADD COLUMN IF NOT EXISTS gender VARCHAR(10);

UPDATE patients SET dob='1952-04-15', gender='F' WHERE id=1;  -- 山下ソノ子
UPDATE patients SET dob='1965-08-22', gender='F' WHERE id=2;  -- 木戸直子
UPDATE patients SET dob='1958-11-03', gender='M' WHERE id=3;  -- 前川博
UPDATE patients SET dob='1970-02-14', gender='F' WHERE id=4;  -- 吉田美紀
UPDATE patients SET dob='1948-06-30', gender='F' WHERE id=5;  -- 山下より子
UPDATE patients SET dob='1962-09-17', gender='M' WHERE id=6;  -- 堀越渡
UPDATE patients SET dob='1955-01-28', gender='M' WHERE id=7;  -- 前田太一

-- ── 2. 新テーブル作成 ───────────────────────────────────────

-- regimen_calendar
CREATE TABLE IF NOT EXISTS regimen_calendar (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  regimen_id INTEGER NOT NULL REFERENCES regimens(id),
  treatment_date DATE NOT NULL,
  cycle_no INTEGER,
  status VARCHAR(20) DEFAULT 'planned',
  audit_status VARCHAR(20),
  auditor_name VARCHAR(100),
  audited_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  UNIQUE(patient_id, regimen_id, treatment_date)
);

-- patient_vitals
CREATE TABLE IF NOT EXISTS patient_vitals (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  measured_date DATE NOT NULL,
  height_cm NUMERIC(5,1),
  weight_kg NUMERIC(5,1),
  UNIQUE(patient_id, measured_date)
);

-- patient_lab_history
CREATE TABLE IF NOT EXISTS patient_lab_history (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  lab_date DATE NOT NULL,
  wbc NUMERIC, anc NUMERIC, plt NUMERIC, hgb NUMERIC, mono NUMERIC,
  cre NUMERIC, egfr NUMERIC, ast NUMERIC, alt NUMERIC, tbil NUMERIC, crp NUMERIC,
  UNIQUE(patient_id, lab_date)
);

-- patient_medical_history
CREATE TABLE IF NOT EXISTS patient_medical_history (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  condition_name VARCHAR(200) NOT NULL,
  onset_date DATE,
  end_date DATE,
  notes TEXT
);

-- patient_orders
CREATE TABLE IF NOT EXISTS patient_orders (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  order_date DATE NOT NULL,
  drug_name VARCHAR(200) NOT NULL,
  dose NUMERIC,
  dose_unit VARCHAR(20),
  route VARCHAR(50),
  is_antineoplastic BOOLEAN DEFAULT false,
  bag_no INTEGER,
  solvent_name VARCHAR(100),
  solvent_vol_ml INTEGER,
  bag_order INTEGER DEFAULT 1,
  rp_no INTEGER,
  route_label VARCHAR(50),
  order_no VARCHAR(50),
  regimen_name VARCHAR(200)
);
CREATE INDEX IF NOT EXISTS idx_patient_orders_patient_date ON patient_orders(patient_id, order_date);

-- patient_infection_labs
CREATE TABLE IF NOT EXISTS patient_infection_labs (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  test_name VARCHAR(100) NOT NULL,
  result VARCHAR(200),
  test_date DATE
);

-- regimen_audits
CREATE TABLE IF NOT EXISTS regimen_audits (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  audit_date DATE NOT NULL,
  pharmacist_name VARCHAR(100),
  comment TEXT,
  handover_note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- regimen_doubts
CREATE TABLE IF NOT EXISTS regimen_doubts (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  doubt_date DATE NOT NULL,
  content TEXT,
  status VARCHAR(20) DEFAULT 'open',
  resolution TEXT,
  pharmacist_name VARCHAR(100),
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- regimen_master
CREATE TABLE IF NOT EXISTS regimen_master (
  id SERIAL PRIMARY KEY,
  regimen_name VARCHAR(200) NOT NULL UNIQUE,
  category VARCHAR(100),
  cycle_days INTEGER DEFAULT 21,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- regimen_drugs
CREATE TABLE IF NOT EXISTS regimen_drugs (
  id SERIAL PRIMARY KEY,
  regimen_id INTEGER NOT NULL REFERENCES regimen_master(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 1,
  drug_name VARCHAR(200) NOT NULL,
  drug_type VARCHAR(50) DEFAULT 'antineoplastic',
  base_dose NUMERIC,
  dose_unit VARCHAR(20),
  dose_per VARCHAR(20) DEFAULT 'BSA',
  solvent_name VARCHAR(100),
  solvent_volume INTEGER,
  route VARCHAR(50),
  drip_time INTEGER,
  notes TEXT
);

-- regimen_toxicity_rules
CREATE TABLE IF NOT EXISTS regimen_toxicity_rules (
  id SERIAL PRIMARY KEY,
  regimen_id INTEGER NOT NULL REFERENCES regimen_master(id) ON DELETE CASCADE,
  toxicity_item VARCHAR(100) NOT NULL,
  grade1_action TEXT DEFAULT '継続',
  grade2_action TEXT DEFAULT '減量検討',
  grade3_action TEXT DEFAULT '休薬または減量',
  grade4_action TEXT DEFAULT '中止推奨',
  notes TEXT,
  UNIQUE(regimen_id, toxicity_item)
);

-- ── 3. scheduled_treatments 追加（historical + today + future） ──

-- 患者1: 山下ソノ子 / オキバイド+5FU/LV（2週サイクル）
INSERT INTO scheduled_treatments (scheduled_date, patient_id, regimen_id, status, prescription_type, scheduled_time)
VALUES
  ('2025-10-14', 1, 1, 'done', '院内', '09:30'),
  ('2025-10-28', 1, 1, 'done', '院内', '09:30'),
  ('2025-11-11', 1, 1, 'done', '院内', '09:30'),
  ('2025-11-25', 1, 1, 'done', '院内', '09:30'),
  ('2025-12-09', 1, 1, 'done', '院内', '09:30'),
  ('2025-12-23', 1, 1, 'done', '院内', '09:30'),
  ('2026-01-06', 1, 1, 'done', '院内', '09:30'),
  ('2026-01-20', 1, 1, 'done', '院内', '09:30'),
  ('2026-02-03', 1, 1, 'done', '院内', '09:30'),
  ('2026-02-17', 1, 1, 'changed', '院内', '09:30'),
  ('2026-03-03', 1, 1, 'done', '院内', '09:30'),
  ('2026-03-09', 1, 1, 'pending', '院内', '09:30'),
  ('2026-03-24', 1, 1, 'pending', '院内', '09:30')
ON CONFLICT DO NOTHING;

-- 患者2: 木戸直子 / weeklyPAC（毎週）
INSERT INTO scheduled_treatments (scheduled_date, patient_id, regimen_id, status, prescription_type, scheduled_time)
VALUES
  ('2025-10-06', 2, 2, 'done', '院外', '09:30'),
  ('2025-10-13', 2, 2, 'done', '院外', '09:30'),
  ('2025-10-20', 2, 2, 'done', '院外', '09:30'),
  ('2025-10-27', 2, 2, 'done', '院外', '09:30'),
  ('2025-11-04', 2, 2, 'done', '院外', '09:30'),
  ('2025-11-10', 2, 2, 'done', '院外', '09:30'),
  ('2025-11-17', 2, 2, 'done', '院外', '09:30'),
  ('2025-11-25', 2, 2, 'done', '院外', '09:30'),
  ('2025-12-01', 2, 2, 'done', '院外', '09:30'),
  ('2025-12-08', 2, 2, 'done', '院外', '09:30'),
  ('2025-12-15', 2, 2, 'done', '院外', '09:30'),
  ('2025-12-22', 2, 2, 'done', '院外', '09:30'),
  ('2026-01-05', 2, 2, 'done', '院外', '09:30'),
  ('2026-01-13', 2, 2, 'done', '院外', '09:30'),
  ('2026-01-19', 2, 2, 'done', '院外', '09:30'),
  ('2026-01-26', 2, 2, 'done', '院外', '09:30'),
  ('2026-02-02', 2, 2, 'done', '院外', '09:30'),
  ('2026-02-09', 2, 2, 'done', '院外', '09:30'),
  ('2026-02-16', 2, 2, 'done', '院外', '09:30'),
  ('2026-02-23', 2, 2, 'done', '院外', '09:30'),
  ('2026-03-02', 2, 2, 'done', '院外', '09:30'),
  ('2026-03-09', 2, 2, 'pending', '院外', '09:30'),
  ('2026-03-16', 2, 2, 'pending', '院外', '09:30'),
  ('2026-03-23', 2, 2, 'pending', '院外', '09:30')
ON CONFLICT DO NOTHING;

-- 患者3: 前川博 / パドセブ（3週サイクル）
INSERT INTO scheduled_treatments (scheduled_date, patient_id, regimen_id, status, prescription_type, scheduled_time)
VALUES
  ('2025-10-07', 3, 3, 'done', '緊急', '09:30'),
  ('2025-10-28', 3, 3, 'done', '院内', '09:30'),
  ('2025-11-18', 3, 3, 'done', '院内', '09:30'),
  ('2025-12-09', 3, 3, 'done', '院内', '09:30'),
  ('2025-12-30', 3, 3, 'cancelled', '院内', '09:30'),
  ('2026-01-20', 3, 3, 'done', '院内', '09:30'),
  ('2026-02-10', 3, 3, 'done', '院内', '09:30'),
  ('2026-03-03', 3, 3, 'done', '緊急', '09:30'),
  ('2026-03-09', 3, 3, 'pending', '院内', '09:30'),
  ('2026-03-31', 3, 3, 'pending', '院内', '09:30')
ON CONFLICT DO NOTHING;

-- 患者4: 吉田美紀 / フェスゴ+DTX（3週サイクル）
INSERT INTO scheduled_treatments (scheduled_date, patient_id, regimen_id, status, prescription_type, scheduled_time)
VALUES
  ('2025-10-14', 4, 4, 'done', '院内', '11:30'),
  ('2025-11-04', 4, 4, 'done', '院内', '11:30'),
  ('2025-11-25', 4, 4, 'done', '院内', '11:30'),
  ('2025-12-16', 4, 4, 'done', '院内', '11:30'),
  ('2026-01-13', 4, 4, 'done', '院内', '11:30'),
  ('2026-02-03', 4, 4, 'done', '院内', '11:30'),
  ('2026-02-24', 4, 4, 'done', '院内', '11:30'),
  ('2026-03-09', 4, 4, 'pending', '院内', '11:30'),
  ('2026-03-31', 4, 4, 'pending', '院内', '11:30')
ON CONFLICT DO NOTHING;

-- 患者5: 山下より子 / BV+FOLFIRI（2週サイクル）
INSERT INTO scheduled_treatments (scheduled_date, patient_id, regimen_id, status, prescription_type, scheduled_time)
VALUES
  ('2025-10-09', 5, 5, 'done', '院外', '11:30'),
  ('2025-10-23', 5, 5, 'done', '院外', '11:30'),
  ('2025-11-06', 5, 5, 'done', '院外', '11:30'),
  ('2025-11-20', 5, 5, 'done', '院外', '11:30'),
  ('2025-12-04', 5, 5, 'changed', '院外', '11:30'),
  ('2025-12-18', 5, 5, 'done', '院外', '11:30'),
  ('2026-01-08', 5, 5, 'done', '院外', '11:30'),
  ('2026-01-22', 5, 5, 'done', '院外', '11:30'),
  ('2026-02-05', 5, 5, 'done', '院外', '11:30'),
  ('2026-02-19', 5, 5, 'done', '院外', '11:30'),
  ('2026-03-05', 5, 5, 'changed', '院外', '11:30'),
  ('2026-03-09', 5, 5, 'pending', '院外', '11:30'),
  ('2026-03-19', 5, 5, 'pending', '院外', '11:30')
ON CONFLICT DO NOTHING;

-- 患者6: 堀越渡 / アクテムラ（4週サイクル）
INSERT INTO scheduled_treatments (scheduled_date, patient_id, regimen_id, status, prescription_type, scheduled_time)
VALUES
  ('2025-10-10', 6, 6, 'done', '院内', '13:00'),
  ('2025-11-07', 6, 6, 'done', '院内', '13:00'),
  ('2025-12-05', 6, 6, 'done', '院内', '13:00'),
  ('2026-01-09', 6, 6, 'done', '院内', '13:00'),
  ('2026-02-06', 6, 6, 'done', '院内', '13:00'),
  ('2026-03-09', 6, 6, 'pending', '院内', '13:00'),
  ('2026-04-03', 6, 6, 'pending', '院内', '13:00')
ON CONFLICT DO NOTHING;

-- 患者7: 前田太一 / DTX（3週サイクル）
INSERT INTO scheduled_treatments (scheduled_date, patient_id, regimen_id, status, prescription_type, scheduled_time)
VALUES
  ('2025-10-07', 7, 7, 'done', NULL, '13:00'),
  ('2025-10-28', 7, 7, 'done', NULL, '13:00'),
  ('2025-11-18', 7, 7, 'done', NULL, '13:00'),
  ('2025-12-09', 7, 7, 'done', NULL, '13:00'),
  ('2025-12-30', 7, 7, 'done', NULL, '13:00'),
  ('2026-01-20', 7, 7, 'done', NULL, '13:00'),
  ('2026-02-10', 7, 7, 'done', NULL, '13:00'),
  ('2026-03-09', 7, 7, 'done', NULL, '13:00'),
  ('2026-03-31', 7, 7, 'pending', NULL, '13:00')
ON CONFLICT DO NOTHING;

-- ── 4. patient_vitals ─────────────────────────────────────────

-- 患者1: 山下ソノ子
INSERT INTO patient_vitals (patient_id, measured_date, height_cm, weight_kg) VALUES
  (1,'2025-04-01',155.0,52.0),(1,'2025-07-01',155.0,51.5),(1,'2025-10-01',155.0,51.0),
  (1,'2025-12-01',155.0,50.5),(1,'2026-01-15',155.0,50.0),(1,'2026-02-20',155.0,49.5),
  (1,'2026-03-09',155.0,49.0)
ON CONFLICT DO NOTHING;

-- 患者2: 木戸直子
INSERT INTO patient_vitals (patient_id, measured_date, height_cm, weight_kg) VALUES
  (2,'2025-04-01',160.0,58.0),(2,'2025-07-01',160.0,57.5),(2,'2025-10-01',160.0,57.0),
  (2,'2025-12-01',160.0,56.5),(2,'2026-01-15',160.0,56.0),(2,'2026-02-20',160.0,55.5),
  (2,'2026-03-09',160.0,55.0)
ON CONFLICT DO NOTHING;

-- 患者3: 前川博
INSERT INTO patient_vitals (patient_id, measured_date, height_cm, weight_kg) VALUES
  (3,'2025-07-01',170.0,68.0),(3,'2025-10-01',170.0,67.0),(3,'2025-12-01',170.0,66.5),
  (3,'2026-01-15',170.0,66.0),(3,'2026-03-09',170.0,65.5)
ON CONFLICT DO NOTHING;

-- 患者4: 吉田美紀
INSERT INTO patient_vitals (patient_id, measured_date, height_cm, weight_kg) VALUES
  (4,'2025-07-01',158.0,54.0),(4,'2025-10-01',158.0,53.5),(4,'2025-12-01',158.0,53.0),
  (4,'2026-01-15',158.0,52.5),(4,'2026-03-09',158.0,52.0)
ON CONFLICT DO NOTHING;

-- 患者5: 山下より子
INSERT INTO patient_vitals (patient_id, measured_date, height_cm, weight_kg) VALUES
  (5,'2025-07-01',152.0,48.0),(5,'2025-10-01',152.0,47.5),(5,'2026-01-15',152.0,47.0),
  (5,'2026-03-09',152.0,46.5)
ON CONFLICT DO NOTHING;

-- 患者6: 堀越渡
INSERT INTO patient_vitals (patient_id, measured_date, height_cm, weight_kg) VALUES
  (6,'2025-07-01',168.0,72.0),(6,'2025-10-01',168.0,71.5),(6,'2026-01-15',168.0,71.0),
  (6,'2026-03-09',168.0,70.5)
ON CONFLICT DO NOTHING;

-- 患者7: 前田太一
INSERT INTO patient_vitals (patient_id, measured_date, height_cm, weight_kg) VALUES
  (7,'2025-07-01',165.0,62.0),(7,'2025-10-01',165.0,61.5),(7,'2026-01-15',165.0,61.0),
  (7,'2026-03-09',165.0,60.5)
ON CONFLICT DO NOTHING;

-- ── 5. patient_lab_history ────────────────────────────────────

-- 患者1: 山下ソノ子（消化内, オキバイド+5FU/LV）
INSERT INTO patient_lab_history (patient_id, lab_date, wbc, anc, plt, hgb, mono, cre, egfr, ast, alt, tbil, crp) VALUES
  (1,'2025-10-14',4200,2100,180,11.5,400,0.75,72,28,22,0.8,0.3),
  (1,'2025-10-28',3800,1800,165,11.2,380,0.78,70,32,25,0.9,0.5),
  (1,'2025-11-11',3500,1600,155,10.9,360,0.80,68,30,23,0.8,0.4),
  (1,'2025-11-25',4000,2000,170,11.0,390,0.77,71,29,21,0.8,0.3),
  (1,'2025-12-09',4100,2050,175,11.3,400,0.76,72,27,20,0.7,0.2),
  (1,'2025-12-23',3900,1950,168,11.1,380,0.79,69,31,24,0.8,0.4),
  (1,'2026-01-06',4200,2100,180,11.5,400,0.75,72,28,22,0.8,0.3),
  (1,'2026-01-20',3700,1700,160,10.8,350,0.82,66,35,28,1.0,0.6),
  (1,'2026-02-03',4000,2000,172,11.2,390,0.78,70,30,23,0.8,0.4),
  (1,'2026-02-17',3800,1850,165,10.9,370,0.80,68,33,26,0.9,0.5),
  (1,'2026-03-03',4100,2050,175,11.0,395,0.77,71,29,22,0.8,0.3),
  (1,'2026-03-09',4000,2000,170,11.1,385,0.78,70,30,23,0.8,0.3)
ON CONFLICT DO NOTHING;

-- 患者2: 木戸直子（乳腺科, weeklyPAC）
INSERT INTO patient_lab_history (patient_id, lab_date, wbc, anc, plt, hgb, mono, cre, egfr, ast, alt, tbil, crp) VALUES
  (2,'2025-10-06',5200,3100,220,12.5,520,0.65,85,22,18,0.6,0.2),
  (2,'2025-10-13',4800,2800,210,12.2,490,0.66,84,24,20,0.6,0.2),
  (2,'2025-10-20',4200,2300,195,11.8,420,0.67,82,25,21,0.7,0.3),
  (2,'2025-10-27',3800,1900,180,11.5,380,0.68,81,27,22,0.7,0.4),
  (2,'2025-11-04',3500,1600,170,11.2,340,0.69,80,28,23,0.7,0.3),
  (2,'2025-11-10',3900,2000,185,11.6,390,0.67,82,25,20,0.6,0.3),
  (2,'2025-11-17',4100,2200,190,11.8,410,0.66,83,24,19,0.6,0.2),
  (2,'2025-11-25',4300,2400,200,12.0,430,0.65,85,23,18,0.6,0.2),
  (2,'2025-12-01',4500,2600,208,12.2,450,0.65,85,22,17,0.6,0.2),
  (2,'2025-12-08',4200,2300,195,12.0,420,0.66,84,24,19,0.6,0.2),
  (2,'2025-12-15',3900,2000,183,11.7,385,0.67,82,26,21,0.7,0.3),
  (2,'2025-12-22',3600,1750,172,11.5,355,0.68,81,27,22,0.7,0.3),
  (2,'2026-01-05',4000,2100,190,11.8,400,0.66,83,25,20,0.6,0.2),
  (2,'2026-01-13',4200,2300,198,12.0,420,0.65,85,23,19,0.6,0.2),
  (2,'2026-01-19',4500,2600,205,12.2,450,0.65,85,22,18,0.6,0.2),
  (2,'2026-01-26',4100,2200,193,11.9,405,0.66,84,24,19,0.6,0.2),
  (2,'2026-02-02',3800,1900,180,11.6,375,0.67,82,26,21,0.7,0.3),
  (2,'2026-02-09',3500,1600,168,11.3,340,0.68,81,28,23,0.7,0.3),
  (2,'2026-02-16',3900,2000,185,11.7,390,0.67,82,25,20,0.7,0.2),
  (2,'2026-02-23',4200,2300,197,12.0,420,0.66,84,24,19,0.6,0.2),
  (2,'2026-03-02',4400,2500,205,12.2,440,0.65,85,22,18,0.6,0.2),
  (2,'2026-03-09',4000,2100,192,11.9,395,0.66,83,25,20,0.6,0.2)
ON CONFLICT DO NOTHING;

-- 患者3: 前川博（泌尿器, パドセブ）
INSERT INTO patient_lab_history (patient_id, lab_date, wbc, anc, plt, hgb, mono, cre, egfr, ast, alt, tbil, crp) VALUES
  (3,'2025-10-07',4500,2500,200,13.5,450,1.20,58,30,25,0.8,0.5),
  (3,'2025-10-28',4200,2200,185,13.0,420,1.25,56,32,27,0.9,0.6),
  (3,'2025-11-18',3800,1900,175,12.8,380,1.30,54,35,30,1.0,0.8),
  (3,'2025-12-09',4000,2100,190,13.2,400,1.22,57,31,26,0.8,0.5),
  (3,'2026-01-20',4300,2400,200,13.5,430,1.20,58,29,24,0.8,0.4),
  (3,'2026-02-10',4100,2200,195,13.3,410,1.21,57,30,25,0.8,0.5),
  (3,'2026-03-03',3900,2000,180,13.0,385,1.25,55,33,28,0.9,0.6),
  (3,'2026-03-09',4200,2300,192,13.2,415,1.22,57,31,26,0.8,0.5)
ON CONFLICT DO NOTHING;

-- 患者4: 吉田美紀（乳腺科, フェスゴ+DTX）
INSERT INTO patient_lab_history (patient_id, lab_date, wbc, anc, plt, hgb, mono, cre, egfr, ast, alt, tbil, crp) VALUES
  (4,'2025-10-14',5500,3200,240,12.0,550,0.70,80,25,20,0.7,0.3),
  (4,'2025-11-04',5000,2800,225,11.8,500,0.71,79,27,22,0.7,0.3),
  (4,'2025-11-25',4500,2400,210,11.5,450,0.72,78,28,23,0.8,0.4),
  (4,'2025-12-16',5200,3000,232,11.9,520,0.71,79,26,21,0.7,0.3),
  (4,'2026-01-13',5500,3200,240,12.0,550,0.70,80,25,20,0.7,0.3),
  (4,'2026-02-03',5000,2800,225,11.8,500,0.71,79,27,22,0.7,0.3),
  (4,'2026-02-24',4800,2600,215,11.6,480,0.72,78,28,23,0.7,0.3),
  (4,'2026-03-09',5100,2900,228,11.9,510,0.71,79,26,21,0.7,0.3)
ON CONFLICT DO NOTHING;

-- 患者5: 山下より子（腫瘍内, BV+FOLFIRI）
INSERT INTO patient_lab_history (patient_id, lab_date, wbc, anc, plt, hgb, mono, cre, egfr, ast, alt, tbil, crp) VALUES
  (5,'2025-10-09',3800,1800,160,10.5,380,0.85,65,38,32,1.1,0.8),
  (5,'2025-10-23',3500,1550,148,10.2,340,0.88,63,40,35,1.2,1.0),
  (5,'2025-11-06',3900,1900,165,10.8,390,0.86,64,37,31,1.1,0.7),
  (5,'2025-11-20',4000,2000,170,11.0,400,0.85,65,36,30,1.0,0.6),
  (5,'2025-12-04',3700,1700,155,10.6,365,0.87,64,39,33,1.1,0.8),
  (5,'2025-12-18',4100,2100,175,11.2,410,0.84,66,35,29,1.0,0.6),
  (5,'2026-01-08',3900,1900,165,10.9,385,0.86,64,37,31,1.1,0.7),
  (5,'2026-01-22',3600,1600,152,10.5,350,0.88,63,40,34,1.2,0.9),
  (5,'2026-02-05',4000,2000,170,11.0,400,0.85,65,37,31,1.1,0.7),
  (5,'2026-02-19',3800,1800,160,10.7,375,0.87,64,39,33,1.1,0.8),
  (5,'2026-03-05',3500,1500,148,10.3,340,0.90,61,42,36,1.2,1.1),
  (5,'2026-03-09',3700,1700,158,10.6,368,0.88,63,40,34,1.2,0.9)
ON CONFLICT DO NOTHING;

-- 患者6: 堀越渡（リウマチ, アクテムラ）
INSERT INTO patient_lab_history (patient_id, lab_date, wbc, anc, plt, hgb, mono, cre, egfr, ast, alt, tbil, crp) VALUES
  (6,'2025-10-10',5800,3500,250,13.8,580,1.10,62,28,22,0.8,2.5),
  (6,'2025-11-07',5500,3200,240,13.5,545,1.12,61,30,24,0.9,1.8),
  (6,'2025-12-05',5200,3000,235,13.2,510,1.13,60,31,25,0.9,1.2),
  (6,'2026-01-09',5500,3200,242,13.5,545,1.11,62,29,23,0.8,0.8),
  (6,'2026-02-06',5800,3500,252,13.8,578,1.10,62,28,22,0.8,0.5),
  (6,'2026-03-09',5600,3300,245,13.6,555,1.11,61,29,23,0.8,0.6)
ON CONFLICT DO NOTHING;

-- 患者7: 前田太一（泌尿器, DTX）
INSERT INTO patient_lab_history (patient_id, lab_date, wbc, anc, plt, hgb, mono, cre, egfr, ast, alt, tbil, crp) VALUES
  (7,'2025-10-07',5000,2900,220,14.0,500,1.05,68,26,20,0.7,0.4),
  (7,'2025-10-28',4500,2500,205,13.7,445,1.08,66,28,22,0.7,0.5),
  (7,'2025-11-18',4000,2100,190,13.5,395,1.10,65,30,24,0.8,0.6),
  (7,'2025-12-09',4800,2700,215,13.8,478,1.07,67,27,21,0.7,0.4),
  (7,'2025-12-30',5100,3000,225,14.0,510,1.05,68,26,20,0.7,0.3),
  (7,'2026-01-20',4600,2600,210,13.8,460,1.07,67,27,21,0.7,0.4),
  (7,'2026-02-10',4200,2300,198,13.5,415,1.09,65,29,23,0.8,0.5),
  (7,'2026-03-09',4800,2800,218,13.8,478,1.06,67,27,21,0.7,0.4)
ON CONFLICT DO NOTHING;

-- ── 6. patient_medical_history ────────────────────────────────

INSERT INTO patient_medical_history (patient_id, condition_name, onset_date, notes) VALUES
  (1,'膵臓癌','2025-06-01','Stage III, GEM+nabPTX後'),
  (1,'2型糖尿病','2018-04-01','内服中'),
  (2,'乳癌','2024-09-01','Stage II, ER+PR+HER2-'),
  (2,'高血圧症','2020-01-01','アムロジピン内服中'),
  (3,'前立腺癌','2024-11-01','Stage IV, 骨転移あり'),
  (3,'高血圧症','2015-05-01','降圧剤内服中'),
  (4,'乳癌','2025-08-01','Stage II, HER2陽性'),
  (5,'大腸癌','2024-07-01','Stage IV, 肺転移'),
  (5,'高血圧症','2019-03-01',''),
  (6,'関節リウマチ','2019-06-01','MTX併用中'),
  (7,'前立腺癌','2025-09-01','T3bN0M0, 骨スキャン陰性')
ON CONFLICT DO NOTHING;

-- ── 7. patient_infection_labs ─────────────────────────────────

INSERT INTO patient_infection_labs (patient_id, test_name, result, test_date) VALUES
  (1,'HBs抗原','陰性','2025-10-01'),
  (1,'HBs抗体','陰性','2025-10-01'),
  (1,'HCV抗体','陰性','2025-10-01'),
  (2,'HBs抗原','陰性','2025-10-01'),
  (2,'HBs抗体','陽性','2025-10-01'),
  (2,'HCV抗体','陰性','2025-10-01'),
  (3,'HBs抗原','陰性','2025-11-01'),
  (3,'HBs抗体','陰性','2025-11-01'),
  (3,'HCV抗体','陰性','2025-11-01'),
  (4,'HBs抗原','陰性','2025-10-01'),
  (4,'HBs抗体','陰性','2025-10-01'),
  (4,'HCV抗体','陰性','2025-10-01'),
  (5,'HBs抗原','陰性','2025-09-01'),
  (5,'HBs抗体','陰性','2025-09-01'),
  (5,'HCV抗体','陰性','2025-09-01'),
  (6,'HBs抗原','陰性','2026-01-01'),
  (6,'HBs抗体','陰性','2026-01-01'),
  (7,'HBs抗原','陰性','2025-10-01'),
  (7,'HBs抗体','陰性','2025-10-01')
ON CONFLICT DO NOTHING;

-- ── 8. patient_orders（今回オーダー = 2026-03-09、次回オーダー）────

-- 患者1: 山下ソノ子 / オキバイド+5FU/LV 今回オーダー
INSERT INTO patient_orders (patient_id, order_date, drug_name, dose, dose_unit, route, is_antineoplastic, bag_no, solvent_name, solvent_vol_ml, bag_order, rp_no, route_label, order_no, regimen_name)
VALUES
  (1,'2026-03-09','オキサリプラチン',170,'mg','DIV',true,1,'D5W',500,1,1,'DIV（点滴）','ORD-202603091','オキバイド+5FU/LV'),
  (1,'2026-03-09','ロイコボリン',200,'mg','DIV',false,1,'D5W',500,2,1,'DIV（点滴）','ORD-202603091','オキバイド+5FU/LV'),
  (1,'2026-03-09','フルオロウラシル',680,'mg','DIV',true,2,'NS',500,1,2,'持続点滴','ORD-202603091','オキバイド+5FU/LV'),
  (1,'2026-03-09','アプレピタント',125,'mg','PO',false,NULL,NULL,NULL,1,3,'内服','ORD-202603091','オキバイド+5FU/LV'),
  (1,'2026-03-09','グラニセトロン',1,'mg','DIV',false,NULL,'NS',100,1,4,'DIV（点滴）','ORD-202603091','オキバイド+5FU/LV'),
  (1,'2026-03-09','デキサメタゾン',9.9,'mg','DIV',false,NULL,'NS',100,1,4,'DIV（点滴）','ORD-202603091','オキバイド+5FU/LV')
ON CONFLICT DO NOTHING;

-- 患者1: 次回オーダー
INSERT INTO patient_orders (patient_id, order_date, drug_name, dose, dose_unit, route, is_antineoplastic, bag_no, solvent_name, solvent_vol_ml, bag_order, rp_no, route_label, order_no, regimen_name)
VALUES
  (1,'2026-03-24','オキサリプラチン',170,'mg','DIV',true,1,'D5W',500,1,1,'DIV（点滴）','ORD-202603241','オキバイド+5FU/LV'),
  (1,'2026-03-24','ロイコボリン',200,'mg','DIV',false,1,'D5W',500,2,1,'DIV（点滴）','ORD-202603241','オキバイド+5FU/LV'),
  (1,'2026-03-24','フルオロウラシル',680,'mg','DIV',true,2,'NS',500,1,2,'持続点滴','ORD-202603241','オキバイド+5FU/LV')
ON CONFLICT DO NOTHING;

-- 患者2: 木戸直子 / weeklyPAC 今回オーダー（同一薬剤・同一用量）
INSERT INTO patient_orders (patient_id, order_date, drug_name, dose, dose_unit, route, is_antineoplastic, bag_no, solvent_name, solvent_vol_ml, bag_order, rp_no, route_label, order_no, regimen_name)
VALUES
  (2,'2026-03-09','パクリタキセル',110,'mg','DIV',true,1,'NS',250,1,1,'DIV（点滴）','ORD-202603092','weeklyPAC'),
  (2,'2026-03-09','デキサメタゾン',9.9,'mg','DIV',false,NULL,'NS',100,1,2,'DIV（点滴）','ORD-202603092','weeklyPAC'),
  (2,'2026-03-09','ファモチジン',20,'mg','DIV',false,NULL,'NS',100,1,2,'DIV（点滴）','ORD-202603092','weeklyPAC'),
  (2,'2026-03-09','クロルフェニラミン',5,'mg','IV',false,NULL,NULL,NULL,1,3,'静注','ORD-202603092','weeklyPAC')
ON CONFLICT DO NOTHING;

-- 患者2: 次回オーダー（薬剤同一、用量変更あり）
INSERT INTO patient_orders (patient_id, order_date, drug_name, dose, dose_unit, route, is_antineoplastic, bag_no, solvent_name, solvent_vol_ml, bag_order, rp_no, route_label, order_no, regimen_name)
VALUES
  (2,'2026-03-16','パクリタキセル',99,'mg','DIV',true,1,'NS',250,1,1,'DIV（点滴）','ORD-202603162','weeklyPAC'),
  (2,'2026-03-16','デキサメタゾン',9.9,'mg','DIV',false,NULL,'NS',100,1,2,'DIV（点滴）','ORD-202603162','weeklyPAC'),
  (2,'2026-03-16','ファモチジン',20,'mg','DIV',false,NULL,'NS',100,1,2,'DIV（点滴）','ORD-202603162','weeklyPAC'),
  (2,'2026-03-16','クロルフェニラミン',5,'mg','IV',false,NULL,NULL,NULL,1,3,'静注','ORD-202603162','weeklyPAC')
ON CONFLICT DO NOTHING;

-- 患者3: 前川博 / パドセブ 今回オーダー
INSERT INTO patient_orders (patient_id, order_date, drug_name, dose, dose_unit, route, is_antineoplastic, bag_no, solvent_name, solvent_vol_ml, bag_order, rp_no, route_label, order_no, regimen_name)
VALUES
  (3,'2026-03-09','エンホルツマブ ベドチン',125,'mg','DIV',true,1,'NS',100,1,1,'DIV（点滴）','ORD-202603093','パドセブ'),
  (3,'2026-03-09','ペンブロリズマブ',200,'mg','DIV',false,1,'NS',100,2,1,'DIV（点滴）','ORD-202603093','パドセブ')
ON CONFLICT DO NOTHING;

-- 患者3: 次回オーダー（同一）
INSERT INTO patient_orders (patient_id, order_date, drug_name, dose, dose_unit, route, is_antineoplastic, bag_no, solvent_name, solvent_vol_ml, bag_order, rp_no, route_label, order_no, regimen_name)
VALUES
  (3,'2026-03-31','エンホルツマブ ベドチン',125,'mg','DIV',true,1,'NS',100,1,1,'DIV（点滴）','ORD-202603313','パドセブ'),
  (3,'2026-03-31','ペンブロリズマブ',200,'mg','DIV',false,1,'NS',100,2,1,'DIV（点滴）','ORD-202603313','パドセブ')
ON CONFLICT DO NOTHING;

-- 患者4: 吉田美紀 / フェスゴ+DTX 今回オーダー
INSERT INTO patient_orders (patient_id, order_date, drug_name, dose, dose_unit, route, is_antineoplastic, bag_no, solvent_name, solvent_vol_ml, bag_order, rp_no, route_label, order_no, regimen_name)
VALUES
  (4,'2026-03-09','ドセタキセル',88,'mg','DIV',true,1,'NS',250,1,1,'DIV（点滴）','ORD-202603094','フェスゴ+DTX'),
  (4,'2026-03-09','ペルツズマブ/トラスツズマブ/ヒアルロニダーゼ',600,'mg','SC',true,NULL,NULL,NULL,1,2,'皮下注','ORD-202603094','フェスゴ+DTX'),
  (4,'2026-03-09','グラニセトロン',1,'mg','DIV',false,NULL,'NS',100,1,3,'DIV（点滴）','ORD-202603094','フェスゴ+DTX'),
  (4,'2026-03-09','デキサメタゾン',9.9,'mg','DIV',false,NULL,'NS',100,1,3,'DIV（点滴）','ORD-202603094','フェスゴ+DTX')
ON CONFLICT DO NOTHING;

-- 患者4: 次回オーダー（DTX減量）
INSERT INTO patient_orders (patient_id, order_date, drug_name, dose, dose_unit, route, is_antineoplastic, bag_no, solvent_name, solvent_vol_ml, bag_order, rp_no, route_label, order_no, regimen_name)
VALUES
  (4,'2026-03-31','ドセタキセル',66,'mg','DIV',true,1,'NS',250,1,1,'DIV（点滴）','ORD-202603314','フェスゴ+DTX'),
  (4,'2026-03-31','ペルツズマブ/トラスツズマブ/ヒアルロニダーゼ',600,'mg','SC',true,NULL,NULL,NULL,1,2,'皮下注','ORD-202603314','フェスゴ+DTX')
ON CONFLICT DO NOTHING;

-- 患者5: 山下より子 / BV+FOLFIRI 今回オーダー
INSERT INTO patient_orders (patient_id, order_date, drug_name, dose, dose_unit, route, is_antineoplastic, bag_no, solvent_name, solvent_vol_ml, bag_order, rp_no, route_label, order_no, regimen_name)
VALUES
  (5,'2026-03-09','ベバシズマブ',350,'mg','DIV',true,1,'NS',100,1,1,'DIV（点滴）','ORD-202603095','BV+FOLFIRI'),
  (5,'2026-03-09','イリノテカン',290,'mg','DIV',true,2,'NS',250,1,2,'DIV（点滴）','ORD-202603095','BV+FOLFIRI'),
  (5,'2026-03-09','フルオロウラシル',580,'mg','DIV',true,3,'NS',500,1,3,'持続点滴','ORD-202603095','BV+FOLFIRI'),
  (5,'2026-03-09','ロイコボリン',200,'mg','DIV',false,2,'NS',250,2,2,'DIV（点滴）','ORD-202603095','BV+FOLFIRI')
ON CONFLICT DO NOTHING;

-- 患者5: 次回オーダー
INSERT INTO patient_orders (patient_id, order_date, drug_name, dose, dose_unit, route, is_antineoplastic, bag_no, solvent_name, solvent_vol_ml, bag_order, rp_no, route_label, order_no, regimen_name)
VALUES
  (5,'2026-03-19','ベバシズマブ',350,'mg','DIV',true,1,'NS',100,1,1,'DIV（点滴）','ORD-202603195','BV+FOLFIRI'),
  (5,'2026-03-19','イリノテカン',290,'mg','DIV',true,2,'NS',250,1,2,'DIV（点滴）','ORD-202603195','BV+FOLFIRI'),
  (5,'2026-03-19','フルオロウラシル',580,'mg','DIV',true,3,'NS',500,1,3,'持続点滴','ORD-202603195','BV+FOLFIRI')
ON CONFLICT DO NOTHING;

-- 患者6: 堀越渡 / アクテムラ 今回オーダー
INSERT INTO patient_orders (patient_id, order_date, drug_name, dose, dose_unit, route, is_antineoplastic, bag_no, solvent_name, solvent_vol_ml, bag_order, rp_no, route_label, order_no, regimen_name)
VALUES
  (6,'2026-03-09','トシリズマブ',632,'mg','DIV',false,1,'NS',100,1,1,'DIV（点滴）','ORD-202603096','アクテムラ')
ON CONFLICT DO NOTHING;

-- 患者7: 前田太一 / DTX 今回オーダー
INSERT INTO patient_orders (patient_id, order_date, drug_name, dose, dose_unit, route, is_antineoplastic, bag_no, solvent_name, solvent_vol_ml, bag_order, rp_no, route_label, order_no, regimen_name)
VALUES
  (7,'2026-03-09','ドセタキセル',113,'mg','DIV',true,1,'NS',250,1,1,'DIV（点滴）','ORD-202603097','DTX'),
  (7,'2026-03-09','デキサメタゾン',9.9,'mg','DIV',false,NULL,'NS',100,1,2,'DIV（点滴）','ORD-202603097','DTX'),
  (7,'2026-03-09','グラニセトロン',1,'mg','DIV',false,NULL,'NS',100,1,2,'DIV（点滴）','ORD-202603097','DTX')
ON CONFLICT DO NOTHING;

-- 患者7: 次回オーダー（同一）
INSERT INTO patient_orders (patient_id, order_date, drug_name, dose, dose_unit, route, is_antineoplastic, bag_no, solvent_name, solvent_vol_ml, bag_order, rp_no, route_label, order_no, regimen_name)
VALUES
  (7,'2026-03-31','ドセタキセル',113,'mg','DIV',true,1,'NS',250,1,1,'DIV（点滴）','ORD-202603317','DTX'),
  (7,'2026-03-31','デキサメタゾン',9.9,'mg','DIV',false,NULL,'NS',100,1,2,'DIV（点滴）','ORD-202603317','DTX'),
  (7,'2026-03-31','グラニセトロン',1,'mg','DIV',false,NULL,'NS',100,1,2,'DIV（点滴）','ORD-202603317','DTX')
ON CONFLICT DO NOTHING;

-- ── 9. regimen_calendar（監査済・疑義照会中・未のデータ）──────

-- 患者1: 一部監査済
INSERT INTO regimen_calendar (patient_id, regimen_id, treatment_date, cycle_no, status, audit_status, auditor_name, audited_at)
VALUES
  (1,1,'2025-10-14',1,'done','audited','塩飽英二','2025-10-14 09:45:00+09'),
  (1,1,'2025-10-28',1,'done','audited','岩根裕紀','2025-10-28 10:12:00+09'),
  (1,1,'2025-11-11',2,'done','audited','塩飽英二','2025-11-11 09:55:00+09'),
  (1,1,'2025-11-25',2,'done','audited','古田祐美子','2025-11-25 10:20:00+09'),
  (1,1,'2025-12-09',3,'done','audited','塩飽英二','2025-12-09 09:48:00+09'),
  (1,1,'2025-12-23',3,'done','doubt','岩根裕紀','2025-12-23 10:30:00+09'),
  (1,1,'2026-01-06',4,'done','audited','塩飽英二','2026-01-06 09:50:00+09'),
  (1,1,'2026-01-20',4,'done','audited','古田祐美子','2026-01-20 10:15:00+09'),
  (1,1,'2026-02-03',5,'done','audited','塩飽英二','2026-02-03 09:45:00+09'),
  (1,1,'2026-02-17',5,'done','audited','岩根裕紀','2026-02-17 10:20:00+09'),
  (1,1,'2026-03-03',6,'done','audited','塩飽英二','2026-03-03 09:50:00+09')
ON CONFLICT (patient_id, regimen_id, treatment_date) DO NOTHING;

-- 患者2: 木戸直子 一部監査済・一部未監査（疑義含む）
INSERT INTO regimen_calendar (patient_id, regimen_id, treatment_date, cycle_no, status, audit_status, auditor_name, audited_at)
VALUES
  (2,2,'2025-10-06',1,'done','audited','塩飽英二','2025-10-06 10:00:00+09'),
  (2,2,'2025-10-13',1,'done','audited','岩根裕紀','2025-10-13 10:05:00+09'),
  (2,2,'2025-10-20',1,'done','audited','古田祐美子','2025-10-20 10:10:00+09'),
  (2,2,'2025-10-27',2,'done','audited','塩飽英二','2025-10-27 10:15:00+09'),
  (2,2,'2025-11-04',2,'done','audited','岩根裕紀','2025-11-04 10:20:00+09'),
  (2,2,'2025-11-10',2,'done','audited','古田祐美子','2025-11-10 10:25:00+09'),
  (2,2,'2025-11-17',3,'done','audited','塩飽英二','2025-11-17 10:30:00+09'),
  (2,2,'2025-11-25',3,'done','audited','岩根裕紀','2025-11-25 10:35:00+09'),
  (2,2,'2025-12-01',3,'done','audited','古田祐美子','2025-12-01 10:40:00+09'),
  (2,2,'2025-12-08',4,'done','audited','塩飽英二','2025-12-08 10:45:00+09'),
  (2,2,'2025-12-15',4,'done','doubt','岩根裕紀','2025-12-15 10:50:00+09'),
  (2,2,'2025-12-22',4,'done','audited','古田祐美子','2025-12-22 10:55:00+09'),
  (2,2,'2026-01-05',5,'done','audited','塩飽英二','2026-01-05 11:00:00+09'),
  (2,2,'2026-01-13',5,'done','audited','岩根裕紀','2026-01-13 11:05:00+09'),
  (2,2,'2026-01-19',5,'done','audited','古田祐美子','2026-01-19 11:10:00+09'),
  (2,2,'2026-01-26',6,'done','audited','塩飽英二','2026-01-26 11:15:00+09'),
  (2,2,'2026-02-02',6,'done','audited','岩根裕紀','2026-02-02 11:20:00+09'),
  (2,2,'2026-02-09',6,'done','audited','古田祐美子','2026-02-09 11:25:00+09'),
  (2,2,'2026-02-16',7,'done','audited','塩飽英二','2026-02-16 11:30:00+09'),
  (2,2,'2026-02-23',7,'done','audited','岩根裕紀','2026-02-23 11:35:00+09'),
  (2,2,'2026-03-02',7,'done','audited','古田祐美子','2026-03-02 11:40:00+09')
ON CONFLICT (patient_id, regimen_id, treatment_date) DO NOTHING;

-- 患者3: 一部監査済
INSERT INTO regimen_calendar (patient_id, regimen_id, treatment_date, cycle_no, status, audit_status, auditor_name, audited_at)
VALUES
  (3,3,'2025-10-07',1,'done','audited','塩飽英二','2025-10-07 10:00:00+09'),
  (3,3,'2025-10-28',1,'done','audited','岩根裕紀','2025-10-28 10:15:00+09'),
  (3,3,'2025-11-18',2,'done','audited','古田祐美子','2025-11-18 10:30:00+09'),
  (3,3,'2025-12-09',2,'done','doubt','塩飽英二','2025-12-09 10:45:00+09'),
  (3,3,'2026-01-20',3,'done','audited','岩根裕紀','2026-01-20 11:00:00+09'),
  (3,3,'2026-02-10',3,'done','audited','古田祐美子','2026-02-10 11:15:00+09')
ON CONFLICT (patient_id, regimen_id, treatment_date) DO NOTHING;

-- 患者4: 一部監査済
INSERT INTO regimen_calendar (patient_id, regimen_id, treatment_date, cycle_no, status, audit_status, auditor_name, audited_at)
VALUES
  (4,4,'2025-10-14',1,'done','audited','塩飽英二','2025-10-14 11:45:00+09'),
  (4,4,'2025-11-04',1,'done','audited','岩根裕紀','2025-11-04 12:00:00+09'),
  (4,4,'2025-11-25',2,'done','audited','古田祐美子','2025-11-25 12:15:00+09'),
  (4,4,'2025-12-16',2,'done','audited','塩飽英二','2025-12-16 12:30:00+09'),
  (4,4,'2026-01-13',3,'done','audited','岩根裕紀','2026-01-13 12:45:00+09'),
  (4,4,'2026-02-03',3,'done','doubt','古田祐美子','2026-02-03 13:00:00+09'),
  (4,4,'2026-02-24',4,'done','audited','塩飽英二','2026-02-24 13:15:00+09')
ON CONFLICT (patient_id, regimen_id, treatment_date) DO NOTHING;

-- 患者5: 一部監査済・未監査あり
INSERT INTO regimen_calendar (patient_id, regimen_id, treatment_date, cycle_no, status, audit_status, auditor_name, audited_at)
VALUES
  (5,5,'2025-10-09',1,'done','audited','塩飽英二','2025-10-09 12:00:00+09'),
  (5,5,'2025-10-23',1,'done','audited','岩根裕紀','2025-10-23 12:15:00+09'),
  (5,5,'2025-11-06',2,'done','audited','古田祐美子','2025-11-06 12:30:00+09'),
  (5,5,'2025-11-20',2,'done','audited','塩飽英二','2025-11-20 12:45:00+09'),
  (5,5,'2025-12-04',2,'changed','audited','岩根裕紀','2025-12-04 13:00:00+09'),
  (5,5,'2025-12-18',3,'done','audited','古田祐美子','2025-12-18 13:15:00+09'),
  (5,5,'2026-01-08',3,'done','audited','塩飽英二','2026-01-08 13:30:00+09'),
  (5,5,'2026-01-22',4,'done','doubt','岩根裕紀','2026-01-22 13:45:00+09'),
  (5,5,'2026-02-05',4,'done','audited','古田祐美子','2026-02-05 14:00:00+09')
ON CONFLICT (patient_id, regimen_id, treatment_date) DO NOTHING;

-- 患者6: すべて監査済
INSERT INTO regimen_calendar (patient_id, regimen_id, treatment_date, cycle_no, status, audit_status, auditor_name, audited_at)
VALUES
  (6,6,'2025-10-10',1,'done','audited','塩飽英二','2025-10-10 13:15:00+09'),
  (6,6,'2025-11-07',2,'done','audited','岩根裕紀','2025-11-07 13:30:00+09'),
  (6,6,'2025-12-05',3,'done','audited','古田祐美子','2025-12-05 13:45:00+09'),
  (6,6,'2026-01-09',4,'done','audited','塩飽英二','2026-01-09 14:00:00+09'),
  (6,6,'2026-02-06',5,'done','audited','岩根裕紀','2026-02-06 14:15:00+09')
ON CONFLICT (patient_id, regimen_id, treatment_date) DO NOTHING;

-- 患者7: 一部監査済
INSERT INTO regimen_calendar (patient_id, regimen_id, treatment_date, cycle_no, status, audit_status, auditor_name, audited_at)
VALUES
  (7,7,'2025-10-07',1,'done','audited','塩飽英二','2025-10-07 13:15:00+09'),
  (7,7,'2025-10-28',2,'done','audited','岩根裕紀','2025-10-28 13:30:00+09'),
  (7,7,'2025-11-18',2,'done','audited','古田祐美子','2025-11-18 13:45:00+09'),
  (7,7,'2025-12-09',3,'done','audited','塩飽英二','2025-12-09 14:00:00+09'),
  (7,7,'2025-12-30',3,'done','audited','岩根裕紀','2025-12-30 14:15:00+09'),
  (7,7,'2026-01-20',4,'done','audited','古田祐美子','2026-01-20 14:30:00+09'),
  (7,7,'2026-02-10',4,'done','doubt','塩飽英二','2026-02-10 14:45:00+09')
ON CONFLICT (patient_id, regimen_id, treatment_date) DO NOTHING;

-- ── 10. regimen_audits（監査コメント） ─────────────────────────

INSERT INTO regimen_audits (patient_id, audit_date, pharmacist_name, comment, handover_note) VALUES
  (2,'2026-03-02','古田祐美子','Cy7 D1実施。投与量適切。副作用なし。次回も同量で継続。','末梢神経障害Grade1あり。次回確認要。'),
  (2,'2026-02-23','岩根裕紀','Cy7 D1実施確認。採血値問題なし。',''),
  (1,'2026-03-03','塩飽英二','Cy6 D1実施。オキサリプラチン累積量確認。感覚異常なし。','次サイクルで累積量閾値近づく。注意。'),
  (3,'2026-02-10','古田祐美子','Cy3 D8実施確認。皮疹Grade1。継続可。','皮疹の推移を次回確認。'),
  (4,'2026-02-24','塩飽英二','Cy4 D1実施。DTX減量後1サイクル問題なし。',''),
  (5,'2026-02-05','古田祐美子','Cy4 D1確認。腫瘍マーカー低下傾向。','疲労感軽度あり。支持療法継続。')
ON CONFLICT DO NOTHING;

-- ── 11. regimen_doubts（疑義照会） ────────────────────────────

INSERT INTO regimen_doubts (patient_id, doubt_date, content, status, resolution, pharmacist_name, resolved_at) VALUES
  (2,'2025-12-15','パクリタキセル投与量 125mg→110mgへの変更根拠を確認。前回採血でPLT低下あり。','resolved','担当医確認済。体表面積再計算の結果110mgが適正。','岩根裕紀','2025-12-16 09:00:00+09'),
  (1,'2025-12-23','オキサリプラチン投与量：前回採血でeGFR 68、添付文書では60未満で減量とあるが継続可否確認。','resolved','Dr黄より継続可と回答。次回もモニタリング継続。','岩根裕紀','2025-12-24 10:00:00+09'),
  (3,'2025-12-09','パドセブ：皮疹Grade2出現。次サイクル継続か休薬か確認。','resolved','Dr山口より1週延期後継続と回答。','塩飽英二','2025-12-12 11:00:00+09'),
  (4,'2026-02-03','DTX前回より倦怠感増強。用量調節の検討をDr安田に疑義照会。','resolved','DTX 25%減量（88mg→66mg）で次サイクル継続。','古田祐美子','2026-02-05 14:00:00+09'),
  (5,'2026-01-22','BV+FOLFIRI：高血圧増悪でベバシズマブ休薬の可否をDr山口に確認。','open',NULL,'岩根裕紀',NULL),
  (7,'2026-02-10','DTX：浮腫Grade2出現。継続可否をDr山口に確認。','open',NULL,'塩飽英二',NULL)
ON CONFLICT DO NOTHING;

-- ── 12. regimen_master ────────────────────────────────────────

INSERT INTO regimen_master (regimen_name, category, cycle_days, description, is_active) VALUES
  ('オキバイド+5FU/LV','消化器癌',14,'オキサリプラチン+フルオロウラシル+ロイコボリン',true),
  ('weeklyPAC','乳癌',7,'毎週パクリタキセル',true),
  ('パドセブ','泌尿器科癌',14,'エンホルツマブ ベドチン+ペンブロリズマブ',true),
  ('フェスゴ+DTX','乳癌',21,'ペルツズマブ/トラスツズマブ/ヒアルロニダーゼ+ドセタキセル',true),
  ('BV+FOLFIRI','消化器癌',14,'ベバシズマブ+イリノテカン+フルオロウラシル+ロイコボリン',true),
  ('アクテムラ','リウマチ',28,'トシリズマブ点滴静注',true),
  ('DTX','泌尿器科癌',21,'ドセタキセル単剤',true)
ON CONFLICT (regimen_name) DO NOTHING;

-- ── 13. regimen_drugs ─────────────────────────────────────────

DO $$
DECLARE
  oxfolfox_id INT; wpac_id INT; padsev_id INT; fesgo_id INT; bvfolfiri_id INT; actemra_id INT; dtx_id INT;
BEGIN
  SELECT id INTO oxfolfox_id FROM regimen_master WHERE regimen_name='オキバイド+5FU/LV';
  SELECT id INTO wpac_id FROM regimen_master WHERE regimen_name='weeklyPAC';
  SELECT id INTO padsev_id FROM regimen_master WHERE regimen_name='パドセブ';
  SELECT id INTO fesgo_id FROM regimen_master WHERE regimen_name='フェスゴ+DTX';
  SELECT id INTO bvfolfiri_id FROM regimen_master WHERE regimen_name='BV+FOLFIRI';
  SELECT id INTO actemra_id FROM regimen_master WHERE regimen_name='アクテムラ';
  SELECT id INTO dtx_id FROM regimen_master WHERE regimen_name='DTX';

  INSERT INTO regimen_drugs (regimen_id, sort_order, drug_name, drug_type, base_dose, dose_unit, dose_per, solvent_name, solvent_volume, route, drip_time) VALUES
    (oxfolfox_id,1,'オキサリプラチン','antineoplastic',85,'mg','BSA','D5W',500,'DIV',120),
    (oxfolfox_id,2,'ロイコボリン','support',200,'mg','flat','D5W',500,'DIV',120),
    (oxfolfox_id,3,'フルオロウラシル','antineoplastic',400,'mg','BSA','NS',500,'DIV持続',46*60),
    (oxfolfox_id,4,'グラニセトロン','support',1,'mg','flat','NS',100,'DIV',30),
    (oxfolfox_id,5,'デキサメタゾン','support',9.9,'mg','flat','NS',100,'DIV',30),
    (wpac_id,1,'パクリタキセル','antineoplastic',80,'mg','BSA','NS',250,'DIV',60),
    (wpac_id,2,'デキサメタゾン','support',9.9,'mg','flat','NS',100,'DIV',30),
    (wpac_id,3,'ファモチジン','support',20,'mg','flat','NS',100,'DIV',30),
    (wpac_id,4,'クロルフェニラミン','support',5,'mg','flat',NULL,NULL,'IV',5),
    (padsev_id,1,'エンホルツマブ ベドチン','antineoplastic',1.25,'mg','kg','NS',100,'DIV',30),
    (padsev_id,2,'ペンブロリズマブ','support',200,'mg','flat','NS',100,'DIV',30),
    (fesgo_id,1,'ドセタキセル','antineoplastic',75,'mg','BSA','NS',250,'DIV',60),
    (fesgo_id,2,'ペルツズマブ/トラスツズマブ/ヒアルロニダーゼ','antineoplastic',600,'mg','flat',NULL,NULL,'SC',5),
    (fesgo_id,3,'グラニセトロン','support',1,'mg','flat','NS',100,'DIV',30),
    (fesgo_id,4,'デキサメタゾン','support',9.9,'mg','flat','NS',100,'DIV',30),
    (bvfolfiri_id,1,'ベバシズマブ','antineoplastic',5,'mg','kg','NS',100,'DIV',30),
    (bvfolfiri_id,2,'イリノテカン','antineoplastic',180,'mg','BSA','NS',250,'DIV',90),
    (bvfolfiri_id,3,'フルオロウラシル','antineoplastic',400,'mg','BSA','NS',500,'DIV持続',46*60),
    (bvfolfiri_id,4,'ロイコボリン','support',200,'mg','flat','NS',250,'DIV',120),
    (actemra_id,1,'トシリズマブ','support',8,'mg','kg','NS',100,'DIV',60),
    (dtx_id,1,'ドセタキセル','antineoplastic',75,'mg','BSA','NS',250,'DIV',60),
    (dtx_id,2,'デキサメタゾン','support',9.9,'mg','flat','NS',100,'DIV',30),
    (dtx_id,3,'グラニセトロン','support',1,'mg','flat','NS',100,'DIV',30)
  ON CONFLICT DO NOTHING;
END $$;

-- ── 14. regimen_toxicity_rules ────────────────────────────────

DO $$
DECLARE
  oxfolfox_id INT; wpac_id INT; padsev_id INT; fesgo_id INT; bvfolfiri_id INT; dtx_id INT;
BEGIN
  SELECT id INTO oxfolfox_id FROM regimen_master WHERE regimen_name='オキバイド+5FU/LV';
  SELECT id INTO wpac_id FROM regimen_master WHERE regimen_name='weeklyPAC';
  SELECT id INTO padsev_id FROM regimen_master WHERE regimen_name='パドセブ';
  SELECT id INTO fesgo_id FROM regimen_master WHERE regimen_name='フェスゴ+DTX';
  SELECT id INTO bvfolfiri_id FROM regimen_master WHERE regimen_name='BV+FOLFIRI';
  SELECT id INTO dtx_id FROM regimen_master WHERE regimen_name='DTX';

  INSERT INTO regimen_toxicity_rules (regimen_id, toxicity_item, grade1_action, grade2_action, grade3_action, grade4_action) VALUES
    (oxfolfox_id,'末梢神経障害','継続（観察強化）','継続（OXP 25%減量）','OXP休薬・5FU継続','OXP中止'),
    (oxfolfox_id,'好中球減少','継続','次サイクル延期検討','延期（G-CSF投与）','延期（G-CSF投与・次サイクル減量）'),
    (oxfolfox_id,'下痢','継続','継続（止痢剤）','5FU 20%減量','5FU中止'),
    (wpac_id,'末梢神経障害','継続（観察強化）','PAC 20%減量','休薬','中止'),
    (wpac_id,'好中球減少','継続','継続（G-CSF予防）','延期（ANC回復後再開）','延期・減量'),
    (wpac_id,'過敏反応','前投薬強化','前投薬強化・速度低下','投与中止（再投与可検討）','投与中止'),
    (padsev_id,'皮疹','継続（外用）','継続（外用強化）','休薬（回復後75%再開）','中止'),
    (padsev_id,'末梢神経障害','継続','継続（観察）','休薬（回復後75%再開）','中止'),
    (fesgo_id,'好中球減少','継続','次サイクル延期検討','G-CSF投与・DTX 25%減量','G-CSF投与・DTX中止'),
    (fesgo_id,'下痢','継続','継続（補液）','DTX 25%減量','DTX中止'),
    (bvfolfiri_id,'高血圧','継続（降圧剤）','降圧剤追加・継続','BV休薬（血圧コントロール後再開）','BV中止'),
    (bvfolfiri_id,'好中球減少','継続','IRI 20%減量','IRI休薬','IRI中止'),
    (dtx_id,'好中球減少','継続','継続（G-CSF予防）','延期（ANC回復後再開）','延期・25%減量'),
    (dtx_id,'浮腫','継続（利尿剤）','利尿剤追加・継続','休薬','中止'),
    (dtx_id,'爪変化','継続','継続（外用）','休薬','中止')
  ON CONFLICT (regimen_id, toxicity_item) DO NOTHING;
END $$;

COMMIT;
