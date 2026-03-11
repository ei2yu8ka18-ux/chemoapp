ALTER TABLE regimen_guideline_sources
  ADD COLUMN IF NOT EXISTS regimen_id INTEGER REFERENCES regimen_master(id) ON DELETE SET NULL;

ALTER TABLE regimen_guideline_rules
  ADD COLUMN IF NOT EXISTS regimen_id INTEGER REFERENCES regimen_master(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_regimen_guideline_sources_regimen_id
  ON regimen_guideline_sources (regimen_id);

CREATE INDEX IF NOT EXISTS idx_regimen_guideline_rules_regimen_id
  ON regimen_guideline_rules (regimen_id);
