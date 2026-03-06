-- ===== データ完全リストア =====

-- 1. 管理者ユーザー (パスワード: admin123)
INSERT INTO users (username, password_hash, display_name, role)
VALUES (
  'admin',
  '$2a$10$vlCJSNUCI4sEeroXX49rYOMWuXBu7Q1.0ftDQnTn1NHeFTHK5PoFG',
  '管理者',
  'admin'
)
ON CONFLICT (username) DO UPDATE
  SET password_hash = EXCLUDED.password_hash,
      display_name  = EXCLUDED.display_name,
      role          = EXCLUDED.role;

-- 2. レジメンマスタ
INSERT INTO regimens (name) VALUES
  ('オキバイド+5FU/LV'),
  ('weeklyPAC'),
  ('パドセブ'),
  ('フェスゴ+DTX'),
  ('BV+FOLFIRI'),
  ('アクテムラ'),
  ('DTX')
ON CONFLICT (name) DO NOTHING;

-- 3. 患者マスタ
INSERT INTO patients (patient_no, name, department, doctor, diagnosis) VALUES
  ('1797323', '山下 ソノ子', '消化内', '黄',  '膵Carの疑い'),
  ('2400687', '木戸 直子',   '乳腺科', '西江', '大腸腺腫'),
  ('3062676', '前川 博',     '泌尿器', '山口', ''),
  ('3084969', '吉田 美紀',   '乳腺科', '安田', ''),
  ('3340072', '山下 より子', '腫瘍内', '山口', 'Meta性肺腫瘍'),
  ('3608130', '堀越 渡',     'リウマチ','三崎', ''),
  ('3643921', '前田 太一',   '泌尿器', '山口', '前立腺Carの疑い')
ON CONFLICT (patient_no) DO NOTHING;

-- 4. 今日のスケジュール
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

-- 確認
SELECT 'users' AS tbl, COUNT(*) FROM users
UNION ALL SELECT 'patients', COUNT(*) FROM patients
UNION ALL SELECT 'regimens', COUNT(*) FROM regimens
UNION ALL SELECT 'today_schedule', COUNT(*) FROM scheduled_treatments WHERE scheduled_date = CURRENT_DATE;
