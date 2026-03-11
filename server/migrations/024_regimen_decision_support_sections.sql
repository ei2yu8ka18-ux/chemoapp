ALTER TABLE regimen_decision_criteria
  ADD COLUMN IF NOT EXISTS section_type VARCHAR(40) NOT NULL DEFAULT 'start_criteria';
ALTER TABLE regimen_decision_criteria
  ADD COLUMN IF NOT EXISTS source_section TEXT;

ALTER TABLE regimen_decision_dose_levels
  ADD COLUMN IF NOT EXISTS section_type VARCHAR(40) NOT NULL DEFAULT 'dose_level';
ALTER TABLE regimen_decision_dose_levels
  ADD COLUMN IF NOT EXISTS source_section TEXT;

ALTER TABLE regimen_decision_toxicity_actions
  ADD COLUMN IF NOT EXISTS section_type VARCHAR(40) NOT NULL DEFAULT 'adverse_event';
ALTER TABLE regimen_decision_toxicity_actions
  ADD COLUMN IF NOT EXISTS source_section TEXT;
