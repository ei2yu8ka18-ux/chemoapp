CREATE TABLE IF NOT EXISTS pre_consult_departments (
  id SERIAL PRIMARY KEY,
  department_name VARCHAR(50) NOT NULL UNIQUE,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO pre_consult_departments (department_name, is_enabled, sort_order) VALUES
  ('乳腺科', false, 1),
  ('消化内', false, 2),
  ('外科', false, 3),
  ('腫瘍内', true, 4),
  ('内科', true, 5),
  ('呼吸内', false, 6),
  ('呼吸外', false, 7),
  ('泌尿器', false, 8),
  ('産婦人科', false, 9),
  ('血液内', false, 10),
  ('脳外科', false, 11)
ON CONFLICT (department_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS daily_snapshots (
  id SERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  snapshot_data JSONB NOT NULL,
  created_by_name VARCHAR(100),
  total_patients INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
