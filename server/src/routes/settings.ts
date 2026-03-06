import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/settings/pre-consult-departments
router.get('/pre-consult-departments', authenticateToken, async (_req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT department_name, is_enabled FROM pre_consult_departments ORDER BY sort_order'
    );
    res.json({ departments: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// PUT /api/settings/pre-consult-departments (admin only)
router.put('/pre-consult-departments', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (req.userRole !== 'admin') {
    res.status(403).json({ error: '管理者権限が必要です' }); return;
  }
  const { departments } = req.body as { departments: { department_name: string; is_enabled: boolean }[] };
  if (!Array.isArray(departments)) {
    res.status(400).json({ error: 'departments配列が必要です' }); return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const dept of departments) {
      await client.query(
        'UPDATE pre_consult_departments SET is_enabled = $1 WHERE department_name = $2',
        [dept.is_enabled, dept.department_name]
      );
    }
    await client.query('COMMIT');
    const result = await pool.query(
      'SELECT department_name, is_enabled FROM pre_consult_departments ORDER BY sort_order'
    );
    res.json({ departments: result.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  } finally {
    client.release();
  }
});

export default router;
