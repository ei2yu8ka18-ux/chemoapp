-- =====================================================
-- Migration 004: furigana / 投与時間 / 処方区分 / 介入記録
-- =====================================================

-- patients テーブルにフリガナ追加
ALTER TABLE patients ADD COLUMN IF NOT EXISTS furigana VARCHAR(100);

-- scheduled_treatments に投与開始時間・処方区分追加
ALTER TABLE scheduled_treatments ADD COLUMN IF NOT EXISTS scheduled_time TIME;
ALTER TABLE scheduled_treatments ADD COLUMN IF NOT EXISTS prescription_type VARCHAR(20);
  -- 値: 緊急 / 院内 / 院外 / NULL

-- ダミー患者のフリガナ設定
UPDATE patients SET furigana = 'やました そのこ'  WHERE patient_no = '1797323';
UPDATE patients SET furigana = 'きど なおこ'      WHERE patient_no = '2400687';
UPDATE patients SET furigana = 'まえかわ ひろし'  WHERE patient_no = '3062676';
UPDATE patients SET furigana = 'よしだ みき'      WHERE patient_no = '3084969';
UPDATE patients SET furigana = 'やました よりこ'  WHERE patient_no = '3340072';
UPDATE patients SET furigana = 'ほりこし わたる'  WHERE patient_no = '3608130';
UPDATE patients SET furigana = 'まえだ たいち'    WHERE patient_no = '3643921';

-- ダミー投与時間の設定（9:30 / 11:30 / 13:00 の3枠）
UPDATE scheduled_treatments st
SET scheduled_time = '09:30:00'
FROM patients p
WHERE st.patient_id = p.id
  AND p.patient_no IN ('1797323', '2400687', '3062676')
  AND st.scheduled_date = CURRENT_DATE;

UPDATE scheduled_treatments st
SET scheduled_time = '11:30:00'
FROM patients p
WHERE st.patient_id = p.id
  AND p.patient_no IN ('3084969', '3340072')
  AND st.scheduled_date = CURRENT_DATE;

UPDATE scheduled_treatments st
SET scheduled_time = '13:00:00'
FROM patients p
WHERE st.patient_id = p.id
  AND p.patient_no IN ('3608130', '3643921')
  AND st.scheduled_date = CURRENT_DATE;

-- ダミー処方区分設定
UPDATE scheduled_treatments st
SET prescription_type = '院内'
FROM patients p
WHERE st.patient_id = p.id
  AND p.patient_no IN ('1797323', '3084969', '3608130')
  AND st.scheduled_date = CURRENT_DATE;

UPDATE scheduled_treatments st
SET prescription_type = '院外'
FROM patients p
WHERE st.patient_id = p.id
  AND p.patient_no IN ('2400687', '3340072')
  AND st.scheduled_date = CURRENT_DATE;

UPDATE scheduled_treatments st
SET prescription_type = '緊急'
FROM patients p
WHERE st.patient_id = p.id
  AND p.patient_no IN ('3062676')
  AND st.scheduled_date = CURRENT_DATE;

-- =====================================================
-- 介入記録テーブル
-- =====================================================
CREATE TABLE IF NOT EXISTS interventions (
  id                    SERIAL PRIMARY KEY,
  treatment_id          INTEGER REFERENCES scheduled_treatments(id) ON DELETE CASCADE,
  record_id             VARCHAR(50) UNIQUE NOT NULL,
  recorded_at           TIMESTAMPTZ DEFAULT NOW(),
  intervention_type     VARCHAR(20) CHECK (intervention_type IN ('提案', '疑義', '問い合わせ')),
  consultation_timing   VARCHAR(5)  CHECK (consultation_timing IN ('前', '後')),
  calc_cancer_guidance  BOOLEAN DEFAULT FALSE,
  calc_pre_consultation BOOLEAN DEFAULT FALSE,
  intervention_category VARCHAR(50),
  intervention_detail   VARCHAR(50),
  intervention_content  TEXT,
  pharmacist_name       VARCHAR(50),
  memo                  TEXT,
  prescription_changed  BOOLEAN DEFAULT FALSE,
  proxy_prescription    BOOLEAN DEFAULT FALSE,
  case_candidate        BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);
