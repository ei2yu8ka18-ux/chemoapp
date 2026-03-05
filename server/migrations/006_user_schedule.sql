-- ユーザーに職員番号・主担当曜日・副担当曜日を追加
-- primary_days / secondary_days: 0=日 1=月 2=火 3=水 4=木 5=金 6=土
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS employee_no    VARCHAR(20),
  ADD COLUMN IF NOT EXISTS primary_days   SMALLINT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS secondary_days SMALLINT[] DEFAULT '{}';
