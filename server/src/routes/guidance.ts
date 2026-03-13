import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getMockOrders } from './guidance-mock';
import { dwhQuery } from '../db/dwh';
import {
  DWH_DATASET_DEFINITIONS,
  initDwhConfigStore,
  resolveDwhDatasetQuery,
} from '../db/dwh-config';

const router = Router();
router.use(authenticateToken);

const GUIDANCE_DATASET_KEY = 'guidance_orders';

export interface OrderRow {
  patient_id: string;
  order_no: string;
  order_date: string;   // YYYYMMDD
  patient_name: string;
  patient_no: string;
  drug_code_sc: string;
  drug_code: string;
  drug_name: string;
  note1: string;
  note2: string;
  inject_time: string;
}

function normalizeDateInput(value: unknown): string {
  const date = String(value || '').trim();
  if (!date) return new Date().toISOString().split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Invalid date format. Use YYYY-MM-DD.');
  }
  return date;
}

router.get('/orders', async (req: AuthRequest, res: Response) => {
  try {
    const date = normalizeDateInput(req.query.date as string | undefined);
    const vendor = String(process.env.EMR_VENDOR ?? 'mock').trim().toLowerCase();

    if (vendor === 'mock') {
      res.json(getMockOrders(date));
      return;
    }

    if (vendor === 'dwh') {
      await initDwhConfigStore();
      const definition = DWH_DATASET_DEFINITIONS[GUIDANCE_DATASET_KEY];
      const resolved = await resolveDwhDatasetQuery({
        datasetKey: GUIDANCE_DATASET_KEY,
        fallbackQuery: definition?.queryTemplate ?? 'SELECT 1 AS ok',
        defaultRequiredParams: definition?.requiredParams ?? [],
        params: {
          date,
          date_yyyymmdd: date.replace(/-/g, ''),
        },
      });

      const rows = await dwhQuery<OrderRow>(resolved.sql, resolved.params);
      res.json(rows);
      return;
    }

    res.status(400).json({
      error: `Unsupported EMR_VENDOR: ${vendor}. Use "mock" or "dwh".`,
    });
  } catch (err) {
    console.error('[guidance/orders]', err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
