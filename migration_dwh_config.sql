-- DWH dataset config master
-- Run with:
--   psql "postgresql://<user>:<pass>@<host>:<port>/<db>" -f migration_dwh_config.sql

BEGIN;

CREATE TABLE IF NOT EXISTS dwh_dataset_configs (
  id SERIAL PRIMARY KEY,
  dataset_key VARCHAR(100) NOT NULL UNIQUE,
  dataset_name VARCHAR(200) NOT NULL,
  description TEXT,
  query_template TEXT NOT NULL,
  required_params TEXT[] NOT NULL DEFAULT '{}',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_by VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dwh_dataset_configs_sort
  ON dwh_dataset_configs (sort_order, id);

INSERT INTO dwh_dataset_configs
  (dataset_key, dataset_name, description, query_template, required_params, is_enabled, sort_order, updated_by)
VALUES
  (
    'blood_results',
    'Blood Results Sync',
    'Query for daily blood data used by treatment list.',
    $$SELECT
  patient_no AS patient_no,
  wbc AS wbc,
  hgb AS hgb,
  plt AS plt,
  anc AS anc,
  mono AS mono,
  cre AS cre,
  egfr AS egfr,
  ast AS ast,
  alt AS alt,
  tbil AS tbil,
  crp AS crp,
  ca AS ca,
  mg AS mg,
  up AS up,
  upcr AS upcr
FROM your_blood_results_table
WHERE lab_date = ?$$,
    ARRAY['date'],
    true,
    10,
    'migration'
  ),
  (
    'urgent_prescriptions',
    'Urgent Prescription Sync',
    'Query for prescription type/info used by treatment list.',
    $$SELECT
  patient_no AS patient_no,
  prescription_type AS prescription_type,
  prescription_info AS prescription_info
FROM your_prescription_table
WHERE order_date = ?$$,
    ARRAY['date'],
    true,
    20,
    'migration'
  ),
  (
    'guidance_orders',
    'Guidance Orders',
    'Query for guidance page order cards.',
    $$SELECT
  patient_id AS patient_id,
  order_no AS order_no,
  order_date AS order_date,
  patient_name AS patient_name,
  patient_no AS patient_no,
  drug_code_sc AS drug_code_sc,
  drug_code AS drug_code,
  drug_name AS drug_name,
  note1 AS note1,
  note2 AS note2,
  inject_time AS inject_time
FROM your_guidance_orders_view
WHERE order_date = ?
ORDER BY patient_id, order_no$$,
    ARRAY['date_yyyymmdd'],
    true,
    30,
    'migration'
  ),
  (
    'daily_patients',
    'Daily Patients',
    'Optional query for daily patient list import.',
    $$SELECT patient_no, patient_name, department, doctor
FROM your_daily_patients_view
WHERE target_date = ?$$,
    ARRAY['date'],
    true,
    40,
    'migration'
  ),
  (
    'drug_master',
    'Drug Master',
    'Optional query for drug master refresh.',
    $$SELECT drug_code, drug_name, route, unit
FROM your_drug_master_table$$,
    ARRAY[]::TEXT[],
    true,
    50,
    'migration'
  )
ON CONFLICT (dataset_key) DO NOTHING;

COMMIT;
