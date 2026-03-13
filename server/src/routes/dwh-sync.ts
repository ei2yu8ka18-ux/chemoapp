import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { dwhHealthCheck, dwhQuery } from '../db/dwh';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import {
  DWH_DATASET_DEFINITIONS,
  getDwhDatasetConfig,
  initDwhConfigStore,
  listDwhDatasetConfigs,
  resolveDwhDatasetQuery,
  upsertDwhDatasetConfig,
} from '../db/dwh-config';

const router = Router();
router.use(authenticateToken);

const DATASET_KEY_PATTERN = /^[A-Za-z0-9_]+$/;

type BloodRow = {
  patient_no: string;
  wbc: number | null;
  hgb: number | null;
  plt: number | null;
  anc: number | null;
  mono: number | null;
  cre: number | null;
  egfr: number | null;
  ast: number | null;
  alt: number | null;
  tbil: number | null;
  crp: number | null;
  ca: number | null;
  mg: number | null;
  up: number | null;
  upcr: number | null;
};

type UrgentRow = {
  patient_no: string;
  prescription_type: string;
  prescription_info: string | null;
};

const BLOOD_DATASET_KEY = 'blood_results';
const URGENT_DATASET_KEY = 'urgent_prescriptions';

function requireAdmin(req: AuthRequest, res: Response): boolean {
  if (req.userRole !== 'admin') {
    res.status(403).json({ error: 'admin only' });
    return false;
  }
  return true;
}

function parseDatasetKey(raw: unknown): string | null {
  const key = String(raw || '').trim();
  if (!key || !DATASET_KEY_PATTERN.test(key)) return null;
  return key;
}

function todayIsoDate(): string {
  return new Date().toISOString().split('T')[0];
}

function normalizeDateInput(value: unknown, fallbackToday = true): string {
  if (value === undefined || value === null || String(value).trim() === '') {
    if (fallbackToday) return todayIsoDate();
    throw new Error('date is required');
  }
  const date = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Invalid date format. Use YYYY-MM-DD.');
  }
  return date;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parseRequiredParams(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => String(v || '').trim())
      .filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return fallback;
}

function collectParamBag(req: AuthRequest): Record<string, unknown> {
  const fromQuery: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(req.query || {})) {
    if (Array.isArray(value)) {
      fromQuery[key] = value[0];
    } else {
      fromQuery[key] = value;
    }
  }

  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? (req.body as Record<string, unknown>)
    : {};
  const fromBodyParams = body.params && typeof body.params === 'object' && !Array.isArray(body.params)
    ? (body.params as Record<string, unknown>)
    : {};

  const bag = {
    ...fromQuery,
    ...fromBodyParams,
  };

  const dateValue = normalizeDateInput(body.date ?? bag.date ?? req.query.date ?? undefined, true);
  bag.date = dateValue;
  bag.date_yyyymmdd = dateValue.replace(/-/g, '');

  return bag;
}

function statusCodeForError(err: unknown): number {
  const message = String((err as Error)?.message || err || '');
  if (
    message.includes('Missing required') ||
    message.includes('invalid query parameter') ||
    message.includes('Invalid date format') ||
    message.includes('date is required')
  ) {
    return 400;
  }
  return 500;
}

function defaultDefinitionFor(datasetKey: string) {
  return DWH_DATASET_DEFINITIONS[datasetKey] || {
    datasetName: datasetKey,
    description: '',
    queryTemplate: 'SELECT 1 AS ok',
    requiredParams: [] as string[],
    sortOrder: 999,
  };
}

router.get('/health', async (_req, res: Response) => {
  const ok = await dwhHealthCheck();
  res.json({ ok, message: ok ? 'DWH connection is healthy' : 'DWH connection failed' });
});

router.get('/configs', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    await initDwhConfigStore();
    const configs = await listDwhDatasetConfigs();
    const definitions = Object.entries(DWH_DATASET_DEFINITIONS)
      .map(([dataset_key, def]) => ({
        dataset_key,
        dataset_name: def.datasetName,
        description: def.description,
        required_params: def.requiredParams,
        sort_order: def.sortOrder,
      }))
      .sort((a, b) => a.sort_order - b.sort_order);
    res.json({ configs, definitions });
  } catch (err) {
    console.error('[dwh-sync/configs]', err);
    res.status(500).json({ error: String(err) });
  }
});

router.put('/configs/:datasetKey', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    await initDwhConfigStore();
    const datasetKey = parseDatasetKey(req.params.datasetKey);
    if (!datasetKey) {
      res.status(400).json({ error: 'Invalid dataset key' });
      return;
    }

    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};
    const def = defaultDefinitionFor(datasetKey);

    const queryTemplate = String(body.query_template ?? def.queryTemplate ?? '').trim();
    if (!queryTemplate) {
      res.status(400).json({ error: 'query_template is required' });
      return;
    }

    const datasetName = String(body.dataset_name ?? def.datasetName ?? datasetKey).trim() || datasetKey;
    const description = String(body.description ?? def.description ?? '').trim() || null;
    const requiredParams = parseRequiredParams(body.required_params, def.requiredParams);
    const sortOrder = toNumber(body.sort_order, def.sortOrder);
    const isEnabled = toBoolean(body.is_enabled, true);

    const config = await upsertDwhDatasetConfig({
      datasetKey,
      datasetName,
      description,
      queryTemplate,
      requiredParams,
      sortOrder,
      isEnabled,
      updatedBy: req.userId ? String(req.userId) : (req.userRole || 'unknown'),
    });

    res.json({ ok: true, config });
  } catch (err) {
    console.error('[dwh-sync/configs/:datasetKey]', err);
    res.status(statusCodeForError(err)).json({ error: String(err) });
  }
});

router.post('/configs/:datasetKey/test', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    await initDwhConfigStore();
    const datasetKey = parseDatasetKey(req.params.datasetKey);
    if (!datasetKey) {
      res.status(400).json({ error: 'Invalid dataset key' });
      return;
    }

    const config = await getDwhDatasetConfig(datasetKey);
    if (!config) {
      res.status(404).json({ error: `Dataset config not found: ${datasetKey}` });
      return;
    }

    const params = collectParamBag(req);
    const def = defaultDefinitionFor(datasetKey);
    const resolved = await resolveDwhDatasetQuery({
      datasetKey,
      fallbackQuery: def.queryTemplate,
      defaultRequiredParams: def.requiredParams,
      params,
    });

    const rows = await dwhQuery<Record<string, unknown>>(resolved.sql, resolved.params);
    res.json({
      ok: true,
      dataset_key: datasetKey,
      query_source: resolved.source,
      required_params: resolved.requiredParams,
      bound_params: resolved.params,
      row_count: rows.length,
      sample: rows.slice(0, 20),
    });
  } catch (err) {
    console.error('[dwh-sync/config test]', err);
    res.status(statusCodeForError(err)).json({ error: String(err) });
  }
});

router.post('/extract/:datasetKey', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    await initDwhConfigStore();
    const datasetKey = parseDatasetKey(req.params.datasetKey);
    if (!datasetKey) {
      res.status(400).json({ error: 'Invalid dataset key' });
      return;
    }

    const def = defaultDefinitionFor(datasetKey);
    const params = collectParamBag(req);
    const resolved = await resolveDwhDatasetQuery({
      datasetKey,
      fallbackQuery: def.queryTemplate,
      defaultRequiredParams: def.requiredParams,
      params,
    });

    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? (req.body as Record<string, unknown>)
      : {};
    const limit = Math.max(1, Math.min(500, toNumber(body.limit, 200)));
    const rows = await dwhQuery<Record<string, unknown>>(resolved.sql, resolved.params);

    res.json({
      ok: true,
      dataset_key: datasetKey,
      query_source: resolved.source,
      required_params: resolved.requiredParams,
      bound_params: resolved.params,
      row_count: rows.length,
      returned_count: Math.min(limit, rows.length),
      rows: rows.slice(0, limit),
      truncated: rows.length > limit,
    });
  } catch (err) {
    console.error('[dwh-sync/extract]', err);
    res.status(statusCodeForError(err)).json({ error: String(err) });
  }
});

router.post('/blood', async (req: AuthRequest, res: Response) => {
  const date = normalizeDateInput(req.query.date as string | undefined, true);

  try {
    await initDwhConfigStore();
    const def = defaultDefinitionFor(BLOOD_DATASET_KEY);
    const resolved = await resolveDwhDatasetQuery({
      datasetKey: BLOOD_DATASET_KEY,
      fallbackQuery: def.queryTemplate,
      defaultRequiredParams: def.requiredParams,
      params: {
        date,
        date_yyyymmdd: date.replace(/-/g, ''),
      },
    });

    const dwhBloodRows = await dwhQuery<BloodRow>(resolved.sql, resolved.params);
    if (!dwhBloodRows.length) {
      res.json({ ok: true, synced: 0, query_source: resolved.source, message: 'No blood rows found' });
      return;
    }

    const { rows: treatments } = await pool.query<{ id: number; patient_no: string }>(
      `SELECT st.id, p.patient_no
         FROM scheduled_treatments st
         JOIN patients p ON p.id = st.patient_id
        WHERE st.scheduled_date = $1`,
      [date],
    );

    const treatmentMap = new Map<string, number>(
      treatments.map((t) => [t.patient_no, t.id]),
    );

    const fields = ['wbc', 'hgb', 'plt', 'anc', 'mono', 'cre', 'egfr', 'ast', 'alt', 'tbil', 'crp', 'ca', 'mg', 'up', 'upcr'] as const;
    let synced = 0;

    for (const row of dwhBloodRows) {
      const treatmentId = treatmentMap.get(row.patient_no);
      if (!treatmentId) continue;

      const values = fields.map((field) => row[field] ?? null);
      await pool.query(
        `INSERT INTO blood_results (treatment_id, ${fields.join(', ')}, updated_at)
         VALUES ($1, ${fields.map((_, i) => `$${i + 2}`).join(', ')}, NOW())
         ON CONFLICT (treatment_id) DO UPDATE SET
           ${fields.map((field, i) => `${field} = $${i + 2}`).join(', ')},
           updated_at = NOW()`,
        [treatmentId, ...values],
      );
      synced++;
    }

    res.json({
      ok: true,
      synced,
      query_source: resolved.source,
      message: `Blood sync completed: ${synced} row(s)`,
    });
  } catch (err) {
    console.error('[dwh-sync/blood]', err);
    res.status(statusCodeForError(err)).json({ ok: false, error: String(err) });
  }
});

router.post('/urgent', async (req: AuthRequest, res: Response) => {
  const date = normalizeDateInput(req.query.date as string | undefined, true);

  try {
    await initDwhConfigStore();
    const def = defaultDefinitionFor(URGENT_DATASET_KEY);
    const resolved = await resolveDwhDatasetQuery({
      datasetKey: URGENT_DATASET_KEY,
      fallbackQuery: def.queryTemplate,
      defaultRequiredParams: def.requiredParams,
      params: {
        date,
        date_yyyymmdd: date.replace(/-/g, ''),
      },
    });

    const dwhUrgentRows = await dwhQuery<UrgentRow>(resolved.sql, resolved.params);
    if (!dwhUrgentRows.length) {
      res.json({ ok: true, synced: 0, query_source: resolved.source, message: 'No prescription rows found' });
      return;
    }

    const { rows: treatments } = await pool.query<{ id: number; patient_no: string }>(
      `SELECT st.id, p.patient_no
         FROM scheduled_treatments st
         JOIN patients p ON p.id = st.patient_id
        WHERE st.scheduled_date = $1`,
      [date],
    );

    const treatmentMap = new Map<string, number>(
      treatments.map((t) => [t.patient_no, t.id]),
    );

    let synced = 0;
    for (const row of dwhUrgentRows) {
      const treatmentId = treatmentMap.get(row.patient_no);
      if (!treatmentId) continue;

      await pool.query(
        `UPDATE scheduled_treatments
            SET prescription_type = $1,
                prescription_info = $2,
                updated_at = NOW()
          WHERE id = $3`,
        [row.prescription_type, row.prescription_info ?? null, treatmentId],
      );
      synced++;
    }

    res.json({
      ok: true,
      synced,
      query_source: resolved.source,
      message: `Prescription sync completed: ${synced} row(s)`,
    });
  } catch (err) {
    console.error('[dwh-sync/urgent]', err);
    res.status(statusCodeForError(err)).json({ ok: false, error: String(err) });
  }
});

export default router;
