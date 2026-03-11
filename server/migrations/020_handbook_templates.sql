CREATE TABLE IF NOT EXISTS handbook_templates (
  id SERIAL PRIMARY KEY,
  department TEXT NOT NULL,
  regimen_name TEXT NOT NULL,
  sheet_name TEXT,
  content_html TEXT NOT NULL,
  source_file TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_handbook_templates_dept_regimen
  ON handbook_templates (department, regimen_name);

