-- 患者マスタ
CREATE TABLE IF NOT EXISTS patients (
  id SERIAL PRIMARY KEY,
  patient_no VARCHAR(20) UNIQUE NOT NULL,  -- 患者ID（例: 1797323）
  name VARCHAR(100) NOT NULL,
  department VARCHAR(50),
  doctor VARCHAR(50),
  diagnosis TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- レジメンマスタ
CREATE TABLE IF NOT EXISTS regimens (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 治療スケジュール（当日一覧）
CREATE TABLE IF NOT EXISTS scheduled_treatments (
  id SERIAL PRIMARY KEY,
  scheduled_date DATE NOT NULL,
  patient_id INTEGER REFERENCES patients(id),
  regimen_id INTEGER REFERENCES regimens(id),
  status VARCHAR(20) DEFAULT 'pending',  -- pending / done / changed / cancelled
  memo TEXT,
  prescription_received BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 採血結果
CREATE TABLE IF NOT EXISTS blood_results (
  id SERIAL PRIMARY KEY,
  treatment_id INTEGER UNIQUE REFERENCES scheduled_treatments(id) ON DELETE CASCADE,
  wbc NUMERIC,
  hgb NUMERIC,
  plt NUMERIC,
  anc NUMERIC,
  mono NUMERIC,
  cre NUMERIC,
  egfr NUMERIC,
  ast NUMERIC,
  alt NUMERIC,
  tbil NUMERIC,
  crp NUMERIC,
  ca NUMERIC,
  mg NUMERIC,
  up NUMERIC,
  upcr NUMERIC,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ダミーデータ: レジメン
INSERT INTO regimens (name) VALUES
  ('オキバイド+5FU/LV'),
  ('weeklyPAC'),
  ('パドセブ'),
  ('フェスゴ+DTX'),
  ('BV+FOLFIRI'),
  ('アクテムラ'),
  ('DTX')
ON CONFLICT (name) DO NOTHING;

-- ダミーデータ: 患者
INSERT INTO patients (patient_no, name, department, doctor, diagnosis) VALUES
  ('1797323', '山下 ソノ子', '消化内', '黄', '膵Carの疑い'),
  ('2400687', '木戸 直子', '乳腺科', '西江', '大腸腺腫'),
  ('3062676', '前川 博', '泌尿器', '山口', ''),
  ('3084969', '吉田 美紀', '乳腺科', '安田', ''),
  ('3340072', '山下 より子', '腫瘍内', '山口', 'Meta性肺腫瘍'),
  ('3608130', '堀越 渡', 'リウマチ', '三崎', ''),
  ('3643921', '前田 太一', '泌尿器', '山口', '前立腺Carの疑い')
ON CONFLICT (patient_no) DO NOTHING;

-- ダミーデータ: 今日のスケジュール
INSERT INTO scheduled_treatments (scheduled_date, patient_id, regimen_id, status)
SELECT
  CURRENT_DATE,
  p.id,
  r.id,
  'pending'
FROM (VALUES
  ('1797323', 'オキバイド+5FU/LV'),
  ('2400687', 'weeklyPAC'),
  ('3062676', 'パドセブ'),
  ('3084969', 'フェスゴ+DTX'),
  ('3340072', 'BV+FOLFIRI'),
  ('3608130', 'アクテムラ'),
  ('3643921', 'DTX')
) AS v(patient_no, regimen_name)
JOIN patients p ON p.patient_no = v.patient_no
JOIN regimens r ON r.name = v.regimen_name
WHERE NOT EXISTS (
  SELECT 1 FROM scheduled_treatments st
  WHERE st.scheduled_date = CURRENT_DATE AND st.patient_id = p.id
);
