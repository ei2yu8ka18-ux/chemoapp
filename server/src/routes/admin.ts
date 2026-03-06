import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/admin/auth-logs
router.get('/auth-logs', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (req.userRole !== 'admin') {
    res.status(403).json({ error: '管理者権限が必要です' }); return;
  }

  const { dateFrom, dateTo, userId: filterUserId } = req.query as {
    dateFrom?: string; dateTo?: string; userId?: string;
  };

  try {
    let query = `
      SELECT al.id, al.action, al.created_at,
             u.username, u.display_name
      FROM auth_logs al
      JOIN users u ON u.id = al.user_id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];
    let idx = 1;

    if (dateFrom) {
      query += ` AND al.created_at >= $${idx++}`;
      params.push(dateFrom);
    }
    if (dateTo) {
      query += ` AND al.created_at < $${idx++}`;
      const nextDay = new Date(dateTo);
      nextDay.setDate(nextDay.getDate() + 1);
      params.push(nextDay.toISOString().split('T')[0]);
    }
    if (filterUserId) {
      query += ` AND al.user_id = $${idx++}`;
      params.push(parseInt(filterUserId));
    }

    query += ' ORDER BY al.created_at DESC LIMIT 1000';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

export default router;
