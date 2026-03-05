-- =====================================================
-- Migration 005: 業務日誌テーブル
-- =====================================================

-- 業務日誌メイン
CREATE TABLE IF NOT EXISTS work_diaries (
  id                       SERIAL PRIMARY KEY,
  diary_date               DATE UNIQUE NOT NULL,
  -- 手動入力 統計（外来化学療法）
  patient_counseling       INTEGER DEFAULT 0,  -- 患者面談
  first_visit_counseling   INTEGER DEFAULT 0,  -- 初回面談
  allergy_stop             INTEGER DEFAULT 0,  -- アレルギー中止
  regimen_check            INTEGER DEFAULT 0,  -- レジメンチェック
  regimen_operation        INTEGER DEFAULT 0,  -- レジメン操作
  -- 内服セクション
  oral_scheduled           INTEGER DEFAULT 0,
  oral_done                INTEGER DEFAULT 0,
  oral_cancelled           INTEGER DEFAULT 0,
  oral_changed             INTEGER DEFAULT 0,
  oral_patient_counseling  INTEGER DEFAULT 0,
  oral_first_visit         INTEGER DEFAULT 0,
  oral_doubt               INTEGER DEFAULT 0,
  oral_propose             INTEGER DEFAULT 0,
  oral_inquiry             INTEGER DEFAULT 0,
  notes                    TEXT,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

-- 薬剤師勤務テーブル
CREATE TABLE IF NOT EXISTS work_diary_pharmacists (
  id               SERIAL PRIMARY KEY,
  diary_id         INTEGER REFERENCES work_diaries(id) ON DELETE CASCADE,
  sort_order       SMALLINT DEFAULT 0,
  pharmacist_name  VARCHAR(50),
  start_time       VARCHAR(5),   -- "08:30"
  end_time         VARCHAR(5),   -- "15:30"
  has_lunch        BOOLEAN DEFAULT FALSE,
  lunch_minutes    INTEGER DEFAULT 60
);
