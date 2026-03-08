-- =====================================================
-- Migration 012: regimen_calendar に監査者・監査日時列を追加
-- =====================================================

ALTER TABLE regimen_calendar
  ADD COLUMN IF NOT EXISTS auditor_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS audited_at   TIMESTAMP;

SELECT 'Migration 012 完了' AS result;
