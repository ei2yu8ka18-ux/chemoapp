import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/daily-snapshots - list all snapshots
router.get('/', authenticateToken, async (_req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, snapshot_date, total_patients, created_by_name, created_at,
         COALESCE(
           (SELECT COUNT(*)::int
            FROM jsonb_array_elements(snapshot_data->'treatments') t
            WHERE t->>'status' = 'done'),
           0
         ) AS done_patients
       FROM daily_snapshots
       ORDER BY snapshot_date DESC, created_at DESC
       LIMIT 200`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// POST /api/daily-snapshots - save a snapshot
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { snapshot_date, snapshot_data, total_patients } = req.body;
  if (!snapshot_date || !snapshot_data) {
    res.status(400).json({ error: 'snapshot_date and snapshot_data are required' }); return;
  }
  try {
    const userResult = await pool.query(
      'SELECT display_name FROM users WHERE id = $1', [req.userId]
    );
    const createdByName = userResult.rows[0]?.display_name || '';
    const result = await pool.query(
      `INSERT INTO daily_snapshots (snapshot_date, snapshot_data, total_patients, created_by_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, snapshot_date, total_patients, created_by_name, created_at`,
      [snapshot_date, JSON.stringify(snapshot_data), total_patients || 0, createdByName]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// GET /api/daily-snapshots/:id - get single snapshot
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT id, snapshot_date, snapshot_data, total_patients, created_by_name, created_at
       FROM daily_snapshots WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Not found' }); return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// DELETE /api/daily-snapshots/:id
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM daily_snapshots WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

export default router;
