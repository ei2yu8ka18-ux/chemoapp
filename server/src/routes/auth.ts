import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: '職員番号とパスワードは必須です' });
    return;
  }

  try {
    const result = await pool.query(
      'SELECT id, username, password_hash, role, display_name FROM users WHERE username = $1 AND is_active = true',
      [username]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: '職員番号またはパスワードが正しくありません' });
      return;
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      res.status(401).json({ error: '職員番号またはパスワードが正しくありません' });
      return;
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: '8h' }
    );

    // ログイン記録（エラーでもログインは通す）
    pool.query(
      `INSERT INTO auth_logs (user_id, action) VALUES ($1, 'login')`,
      [user.id]
    ).catch(() => {});

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        displayName: user.display_name,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// POST /api/auth/logout （認証必須 → ログアウトログ記録）
router.post('/logout', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (req.userId) {
    await pool.query(
      `INSERT INTO auth_logs (user_id, action) VALUES ($1, 'logout')`,
      [req.userId]
    ).catch(() => {});
  }
  res.json({ ok: true });
});

// POST /api/auth/change-password （自分のパスワード変更）
router.post('/change-password', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: '現在のパスワードと新しいパスワードは必須です' });
    return;
  }
  if (newPassword.length < 4) {
    res.status(400).json({ error: 'パスワードは4文字以上にしてください' });
    return;
  }

  const result = await pool.query('SELECT id, password_hash FROM users WHERE id = $1', [req.userId]);
  if (result.rows.length === 0) { res.status(404).json({ error: 'ユーザーが見つかりません' }); return; }
  const user = result.rows[0];
  const isValid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!isValid) { res.status(401).json({ error: '現在のパスワードが正しくありません' }); return; }

  const hash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.userId]);
  pool.query(
    `INSERT INTO auth_logs (user_id, action) VALUES ($1, 'password_change')`,
    [req.userId]
  ).catch(() => {});
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: '認証が必要です' });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: number;
      role: string;
    };

    const result = await pool.query(
      'SELECT id, username, role, display_name FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'ユーザーが見つかりません' });
      return;
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.display_name,
    });
  } catch {
    res.status(403).json({ error: 'トークンが無効です' });
  }
});

export default router;
