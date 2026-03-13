import { pool } from './pool';

export type DwhParamValue = string | number;
export type DwhQuerySource = 'master' | 'fallback';

export type DwhDatasetDefinition = {
  datasetName: string;
  description: string;
  queryTemplate: string;
  requiredParams: string[];
  sortOrder: number;
};

export const DWH_DATASET_DEFINITIONS: Record<string, DwhDatasetDefinition> = {
  blood_results: {
    datasetName: 'Blood Results Sync',
    description: 'Query for daily blood data used by treatment list.',
    queryTemplate: `SELECT
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
WHERE lab_date = ?`,
    requiredParams: ['date'],
    sortOrder: 10,
  },
  urgent_prescriptions: {
    datasetName: 'Urgent Prescription Sync',
    description: 'Query for prescription type/info used by treatment list.',
    queryTemplate: `SELECT
  patient_no AS patient_no,
  prescription_type AS prescription_type,
  prescription_info AS prescription_info
FROM your_prescription_table
WHERE order_date = ?`,
    requiredParams: ['date'],
    sortOrder: 20,
  },
  guidance_orders: {
    datasetName: 'Guidance Orders',
    description: 'Query for guidance page order cards.',
    queryTemplate: `SELECT
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
ORDER BY patient_id, order_no`,
    requiredParams: ['date_yyyymmdd'],
    sortOrder: 30,
  },
  daily_patients: {
    datasetName: 'Daily Patients',
    description: 'Optional query for daily patient list import.',
    queryTemplate: `SELECT patient_no, patient_name, department, doctor
FROM your_daily_patients_view
WHERE target_date = ?`,
    requiredParams: ['date'],
    sortOrder: 40,
  },
  drug_master: {
    datasetName: 'Drug Master',
    description: 'Optional query for drug master refresh.',
    queryTemplate: `SELECT drug_code, drug_name, route, unit
FROM your_drug_master_table`,
    requiredParams: [],
    sortOrder: 50,
  },
};

export type DwhDatasetConfigRow = {
  id: number;
  dataset_key: string;
  dataset_name: string;
  description: string | null;
  query_template: string;
  required_params: string[];
  is_enabled: boolean;
  sort_order: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type UpsertDwhDatasetConfigInput = {
  datasetKey: string;
  datasetName: string;
  description?: string | null;
  queryTemplate: string;
  requiredParams?: string[];
  isEnabled?: boolean;
  sortOrder?: number;
  updatedBy?: string | null;
};

type ResolveDwhDatasetQueryArgs = {
  datasetKey: string;
  fallbackQuery: string;
  defaultRequiredParams?: string[];
  params?: Record<string, unknown>;
};

let initPromise: Promise<void> | null = null;

function normalizeRequiredParams(input?: string[]): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of input) {
    const key = String(item || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    normalized.push(key);
  }
  return normalized;
}

function coerceParamValue(value: unknown, paramName: string): DwhParamValue {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error(`Missing required query parameter: ${paramName}`);
    }
    return trimmed;
  }
  throw new Error(`Missing or invalid query parameter: ${paramName}`);
}

async function createDwhConfigTables(): Promise<void> {
  await pool.query(`
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
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_dwh_dataset_configs_sort
    ON dwh_dataset_configs (sort_order, id)
  `);
}

async function seedDefaultDwhDatasetConfigs(): Promise<void> {
  const entries = Object.entries(DWH_DATASET_DEFINITIONS)
    .sort(([, a], [, b]) => a.sortOrder - b.sortOrder);

  for (const [datasetKey, def] of entries) {
    await pool.query(
      `INSERT INTO dwh_dataset_configs
        (dataset_key, dataset_name, description, query_template, required_params, is_enabled, sort_order, updated_by, created_at, updated_at)
       VALUES
        ($1, $2, $3, $4, $5, true, $6, 'seed', NOW(), NOW())
       ON CONFLICT (dataset_key) DO NOTHING`,
      [datasetKey, def.datasetName, def.description, def.queryTemplate, def.requiredParams, def.sortOrder],
    );
  }
}

export async function initDwhConfigStore(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await createDwhConfigTables();
      await seedDefaultDwhDatasetConfigs();
    })();
  }
  await initPromise;
}

export async function listDwhDatasetConfigs(): Promise<DwhDatasetConfigRow[]> {
  await initDwhConfigStore();
  const { rows } = await pool.query<DwhDatasetConfigRow>(
    `SELECT id, dataset_key, dataset_name, description, query_template,
            required_params, is_enabled, sort_order, updated_by, created_at, updated_at
       FROM dwh_dataset_configs
      ORDER BY sort_order, id`,
  );
  return rows;
}

export async function getDwhDatasetConfig(datasetKey: string): Promise<DwhDatasetConfigRow | null> {
  await initDwhConfigStore();
  const { rows } = await pool.query<DwhDatasetConfigRow>(
    `SELECT id, dataset_key, dataset_name, description, query_template,
            required_params, is_enabled, sort_order, updated_by, created_at, updated_at
       FROM dwh_dataset_configs
      WHERE dataset_key = $1`,
    [datasetKey],
  );
  return rows[0] || null;
}

export async function upsertDwhDatasetConfig(input: UpsertDwhDatasetConfigInput): Promise<DwhDatasetConfigRow> {
  await initDwhConfigStore();

  const requiredParams = normalizeRequiredParams(input.requiredParams);
  const { rows } = await pool.query<DwhDatasetConfigRow>(
    `INSERT INTO dwh_dataset_configs
      (dataset_key, dataset_name, description, query_template, required_params, is_enabled, sort_order, updated_by, created_at, updated_at)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
     ON CONFLICT (dataset_key) DO UPDATE SET
      dataset_name = EXCLUDED.dataset_name,
      description = EXCLUDED.description,
      query_template = EXCLUDED.query_template,
      required_params = EXCLUDED.required_params,
      is_enabled = EXCLUDED.is_enabled,
      sort_order = EXCLUDED.sort_order,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
     RETURNING id, dataset_key, dataset_name, description, query_template,
               required_params, is_enabled, sort_order, updated_by, created_at, updated_at`,
    [
      input.datasetKey,
      input.datasetName,
      input.description ?? null,
      input.queryTemplate,
      requiredParams,
      input.isEnabled ?? true,
      input.sortOrder ?? 0,
      input.updatedBy ?? null,
    ],
  );
  return rows[0];
}

export async function resolveDwhDatasetQuery(
  args: ResolveDwhDatasetQueryArgs,
): Promise<{ sql: string; params: DwhParamValue[]; requiredParams: string[]; source: DwhQuerySource }> {
  await initDwhConfigStore();
  const config = await getDwhDatasetConfig(args.datasetKey);

  const useMaster = Boolean(config?.is_enabled && config.query_template.trim());
  const sql = useMaster ? String(config?.query_template || '').trim() : args.fallbackQuery;
  const requiredParams = useMaster
    ? normalizeRequiredParams(config?.required_params || [])
    : normalizeRequiredParams(args.defaultRequiredParams || []);

  const paramMap = args.params || {};
  const params = requiredParams.map((paramName) => coerceParamValue(paramMap[paramName], paramName));

  return {
    sql,
    params,
    requiredParams,
    source: useMaster ? 'master' : 'fallback',
  };
}
