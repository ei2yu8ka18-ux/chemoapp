-- =====================================================================
-- Migration 019:
--   1) 患者コメント
--   2) 疑義照会と治療日/レジメン紐付け
--   3) 定期評価採血（亜鉛・銅・KL6・TSH）
-- =====================================================================

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS patient_comment TEXT;

ALTER TABLE regimen_doubts
  ADD COLUMN IF NOT EXISTS regimen_id INTEGER REFERENCES regimens(id),
  ADD COLUMN IF NOT EXISTS treatment_date DATE;

CREATE INDEX IF NOT EXISTS idx_regimen_doubts_patient_regimen_date
  ON regimen_doubts (patient_id, regimen_id, treatment_date);

CREATE TABLE IF NOT EXISTS patient_periodic_labs (
  id         SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  test_name  VARCHAR(30) NOT NULL, -- 亜鉛 / 銅 / KL6 / TSH
  result     VARCHAR(80) NOT NULL,
  test_date  DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (patient_id, test_name, test_date)
);

INSERT INTO patient_periodic_labs (patient_id, test_name, result, test_date)
SELECT p.id, v.test_name, v.result, (CURRENT_DATE - (v.days_ago || ' days')::INTERVAL)::DATE
FROM patients p
JOIN (
  VALUES
    ('1797323', '亜鉛', '62 ug/dL', 120),
    ('1797323', '銅',   '104 ug/dL', 21),
    ('1797323', 'KL6',  '515 U/mL', 45),
    ('1797323', 'TSH',  '2.10 uIU/mL', 10),
    ('2400687', '亜鉛', '70 ug/dL', 40),
    ('2400687', '銅',   '95 ug/dL', 100),
    ('2400687', 'KL6',  '380 U/mL', 20),
    ('2400687', 'TSH',  '1.74 uIU/mL', 35),
    ('3062676', '亜鉛', '58 ug/dL', 88),
    ('3062676', '銅',   '89 ug/dL', 92),
    ('3062676', 'KL6',  '302 U/mL', 8),
    ('3062676', 'TSH',  '3.02 uIU/mL', 12)
) AS v(patient_no, test_name, result, days_ago)
  ON v.patient_no = p.patient_no
ON CONFLICT (patient_id, test_name, test_date) DO NOTHING;

