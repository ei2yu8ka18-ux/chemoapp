-- =====================================================
-- Migration 008: 不足テーブル・カラムの追加
-- =====================================================

-- scheduled_treatments に prescription_info カラム追加
ALTER TABLE scheduled_treatments
  ADD COLUMN IF NOT EXISTS prescription_info TEXT;

-- 診察前面談 対象診療科マスタ
CREATE TABLE IF NOT EXISTS pre_consult_departments (
  id              SERIAL PRIMARY KEY,
  department_name VARCHAR(50) UNIQUE NOT NULL,
  is_enabled      BOOLEAN DEFAULT TRUE,
  sort_order      INTEGER DEFAULT 0
);

-- 初期診療科データ
INSERT INTO pre_consult_departments (department_name, is_enabled, sort_order) VALUES
  ('消化内',   true,  1),
  ('乳腺科',   true,  2),
  ('泌尿器',   true,  3),
  ('腫瘍内',   true,  4),
  ('リウマチ', true,  5),
  ('外科',     true,  6),
  ('呼吸器',   true,  7),
  ('血液内',   true,  8),
  ('婦人科',   true,  9),
  ('頭頸部',   false, 10)
ON CONFLICT (department_name) DO NOTHING;

-- 薬剤師ユーザーの追加（パスワード: pass1234）
INSERT INTO users (username, password_hash, display_name, role) VALUES
  ('ph01', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHHi', '山田 薬子', 'pharmacist'),
  ('ph02', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHHi', '鈴木 花子', 'pharmacist'),
  ('nurse01', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHHi', '田中 看護', 'nurse')
ON CONFLICT (username) DO NOTHING;

-- 確認
SELECT 'pre_consult_departments' AS tbl, COUNT(*) FROM pre_consult_departments
UNION ALL SELECT 'users', COUNT(*) FROM users;
