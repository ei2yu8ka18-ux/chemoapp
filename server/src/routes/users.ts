import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db/pool';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticateToken);

// 管理者チェックミドルウェア
function requireAdmin(req: AuthRequest, res: Response, next: any) {
  if (req.userRole !== 'admin') {
    res.status(403).json({ error: '管理者権限が必要です' });
    return;
  }
  next();
}

// 薬剤師名一覧（認証済みユーザーなら誰でも参照可・管理者不要）
router.get('/pharmacists', async (_req: AuthRequest, res: Response) => {
  const { rows } = await pool.query(
    `SELECT display_name FROM users
     WHERE role = 'pharmacist' AND is_active = true
     ORDER BY id`
  );
  res.json(rows.map((r: any) => r.display_name as string));
});

const SELECT_COLS = `
  id, username, display_name, role, is_active,
  employee_no,
  COALESCE(primary_days,   '{}'::smallint[]) AS primary_days,
  COALESCE(secondary_days, '{}'::smallint[]) AS secondary_days,
  created_at
`;

// ユーザー一覧（管理者のみ）
router.get('/', requireAdmin, async (_req: AuthRequest, res: Response) => {
  const { rows } = await pool.query(`SELECT ${SELECT_COLS} FROM users ORDER BY id`);
  res.json(rows);
});

// ユーザー作成（管理者のみ）
router.post('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { username, display_name, password, role, employee_no, primary_days, secondary_days } = req.body;
  if (!username || !display_name || !password) {
    res.status(400).json({ error: '職員ID・氏名・パスワードは必須です' });
    return;
  }
  const allowed = ['admin', 'doctor', 'nurse', 'pharmacist'];
  const userRole = allowed.includes(role) ? role : 'pharmacist';

  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (username, display_name, password_hash, role, employee_no, primary_days, secondary_days)
       VALUES ($1, $2, $3, $4, $5, $6::smallint[], $7::smallint[])
       RETURNING ${SELECT_COLS}`,
      [
        username, display_name, hash, userRole,
        employee_no || null,
        `{${(primary_days   || []).join(',')}}`,
        `{${(secondary_days || []).join(',')}}`,
      ]
    );
    res.json(rows[0]);
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'この職員IDは既に使用されています' });
    } else {
      res.status(500).json({ error: 'サーバーエラー' });
    }
  }
});

// ユーザー更新（管理者のみ）
router.put('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { display_name, password, role, employee_no, primary_days, secondary_days } = req.body;

  const allowed = ['admin', 'doctor', 'nurse', 'pharmacist'];
  const userRole = allowed.includes(role) ? role : undefined;

  const pdArr = `{${(primary_days   || []).join(',')}}`;
  const sdArr = `{${(secondary_days || []).join(',')}}`;

  if (password) {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `UPDATE users SET
         display_name    = COALESCE($1, display_name),
         password_hash   = $2,
         role            = COALESCE($3, role),
         employee_no     = $4,
         primary_days    = $5::smallint[],
         secondary_days  = $6::smallint[],
         updated_at      = NOW()
       WHERE id = $7`,
      [display_name || null, hash, userRole || null, employee_no || null, pdArr, sdArr, id]
    );
  } else {
    await pool.query(
      `UPDATE users SET
         display_name    = COALESCE($1, display_name),
         role            = COALESCE($2, role),
         employee_no     = $3,
         primary_days    = $4::smallint[],
         secondary_days  = $5::smallint[],
         updated_at      = NOW()
       WHERE id = $6`,
      [display_name || null, userRole || null, employee_no || null, pdArr, sdArr, id]
    );
  }
  const { rows } = await pool.query(
    `SELECT ${SELECT_COLS} FROM users WHERE id = $1`,
    [id]
  );
  res.json(rows[0]);
});

// 有効/無効切り替え（管理者のみ）
router.patch('/:id/toggle', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    `UPDATE users SET is_active = NOT is_active, updated_at = NOW()
     WHERE id = $1 RETURNING ${SELECT_COLS}`,
    [id]
  );
  res.json(rows[0]);
});

export default router;
