-- =====================================================
-- Migration 009: treatment_category カラム追加
-- 注射/内服の区別を scheduled_treatments に持たせる
-- =====================================================

ALTER TABLE scheduled_treatments
  ADD COLUMN IF NOT EXISTS treatment_category VARCHAR(10) DEFAULT '注射';
