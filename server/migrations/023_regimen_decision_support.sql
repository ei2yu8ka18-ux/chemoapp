CREATE TABLE IF NOT EXISTS regimen_decision_criteria (
  id SERIAL PRIMARY KEY,
  source_id INTEGER REFERENCES regimen_guideline_sources(id) ON DELETE CASCADE,
  regimen_id INTEGER REFERENCES regimen_master(id) ON DELETE SET NULL,
  department TEXT,
  regimen_name TEXT NOT NULL,
  regimen_key TEXT NOT NULL,
  metric_key VARCHAR(40) NOT NULL,
  comparator VARCHAR(8) NOT NULL,
  threshold_value NUMERIC(12,4) NOT NULL,
  threshold_unit VARCHAR(40),
  criterion_text TEXT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  section_type VARCHAR(40) NOT NULL DEFAULT 'start_criteria',
  source_section TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS regimen_decision_dose_levels (
  id SERIAL PRIMARY KEY,
  source_id INTEGER REFERENCES regimen_guideline_sources(id) ON DELETE CASCADE,
  regimen_id INTEGER REFERENCES regimen_master(id) ON DELETE SET NULL,
  department TEXT,
  regimen_name TEXT NOT NULL,
  regimen_key TEXT NOT NULL,
  drug_name TEXT NOT NULL,
  level_index INTEGER NOT NULL DEFAULT 0,
  level_label TEXT NOT NULL,
  dose_text TEXT NOT NULL,
  dose_unit VARCHAR(40),
  per_basis VARCHAR(40),
  is_discontinue BOOLEAN NOT NULL DEFAULT FALSE,
  section_type VARCHAR(40) NOT NULL DEFAULT 'dose_level',
  source_section TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS regimen_decision_toxicity_actions (
  id SERIAL PRIMARY KEY,
  source_id INTEGER REFERENCES regimen_guideline_sources(id) ON DELETE CASCADE,
  regimen_id INTEGER REFERENCES regimen_master(id) ON DELETE SET NULL,
  department TEXT,
  regimen_name TEXT NOT NULL,
  regimen_key TEXT NOT NULL,
  toxicity_name TEXT NOT NULL,
  condition_text TEXT NOT NULL,
  action_text TEXT NOT NULL,
  level_delta INTEGER NOT NULL DEFAULT 0,
  hold_flag BOOLEAN NOT NULL DEFAULT FALSE,
  discontinue_flag BOOLEAN NOT NULL DEFAULT FALSE,
  priority INTEGER NOT NULL DEFAULT 100,
  section_type VARCHAR(40) NOT NULL DEFAULT 'adverse_event',
  source_section TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_regimen_decision_criteria_source_id
  ON regimen_decision_criteria (source_id);
CREATE INDEX IF NOT EXISTS idx_regimen_decision_criteria_regimen_key
  ON regimen_decision_criteria (regimen_key);

CREATE INDEX IF NOT EXISTS idx_regimen_decision_dose_levels_source_id
  ON regimen_decision_dose_levels (source_id);
CREATE INDEX IF NOT EXISTS idx_regimen_decision_dose_levels_regimen_key
  ON regimen_decision_dose_levels (regimen_key);

CREATE INDEX IF NOT EXISTS idx_regimen_decision_toxicity_actions_source_id
  ON regimen_decision_toxicity_actions (source_id);
CREATE INDEX IF NOT EXISTS idx_regimen_decision_toxicity_actions_regimen_key
  ON regimen_decision_toxicity_actions (regimen_key);
