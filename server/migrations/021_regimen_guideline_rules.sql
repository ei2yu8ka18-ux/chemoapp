CREATE TABLE IF NOT EXISTS regimen_guideline_sources (
  id SERIAL PRIMARY KEY,
  regimen_name TEXT NOT NULL,
  regimen_key TEXT NOT NULL,
  source_file TEXT NOT NULL,
  source_title TEXT,
  markdown_content TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (regimen_key, source_file)
);

CREATE INDEX IF NOT EXISTS idx_regimen_guideline_sources_key
  ON regimen_guideline_sources (regimen_key);

CREATE TABLE IF NOT EXISTS regimen_guideline_rules (
  id SERIAL PRIMARY KEY,
  regimen_name TEXT NOT NULL,
  regimen_key TEXT NOT NULL,
  rule_type VARCHAR(40) NOT NULL,
  evaluation_mode VARCHAR(20) NOT NULL DEFAULT 'condition',
  metric_key VARCHAR(40),
  comparator VARCHAR(8),
  threshold_value NUMERIC(12,4),
  threshold_unit VARCHAR(40),
  condition_text TEXT NOT NULL,
  action_text TEXT NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'warning',
  source_file TEXT,
  source_line INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_regimen_guideline_rules_key
  ON regimen_guideline_rules (regimen_key);

CREATE INDEX IF NOT EXISTS idx_regimen_guideline_rules_metric
  ON regimen_guideline_rules (metric_key, comparator, threshold_value);
