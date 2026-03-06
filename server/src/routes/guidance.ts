import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getMockOrders } from './guidance-mock';

const router = Router();
router.use(authenticateToken);

// ─── 型定義 ─────────────────────────────────────────────────────
export interface OrderRow {
  patient_id:   string;
  order_no:     string;
  order_date:   string;   // YYYYMMDD
  patient_name: string;
  patient_no:   string;   // カルテ番号（表示用）
  drug_code_sc: string;   // 列O: SC判定用コード（I20118=皮下注射）
  drug_code:    string;   // 列Q: 薬剤コード（画像選択・時間デフォルト）
  drug_name:    string;   // 列R: 薬剤名
  note1:        string;   // 列Y: 注入備考1
  note2:        string;   // 列Z: 注入備考2
  inject_time:  string;   // 列AD: 注入時間
}

// ─── GET /api/guidance/orders?date=YYYY-MM-DD ────────────────────
router.get('/orders', async (req: AuthRequest, res: Response) => {
  const date = (req.query.date as string) || new Date().toISOString().split('T')[0];

  const vendor = process.env.EMR_VENDOR ?? 'mock';

  if (vendor === 'mock') {
    return res.json(getMockOrders(date));
  }

  // ── DWH接続（今後実装） ──────────────────────────────────────
  // 例: SQL Server の場合
  //   const sql = require('mssql');
  //   const pool = await sql.connect(process.env.DWH_CONNECTION_STRING);
  //   const result = await pool.request()
  //     .input('date', sql.VarChar, date.replace(/-/g, ''))
  //     .query(`
  //       SELECT
  //         A  AS patient_id,
  //         B  AS order_no,
  //         H  AS order_date,
  //         M  AS patient_name,
  //         N  AS patient_no,
  //         O  AS drug_code_sc,
  //         Q  AS drug_code,
  //         R  AS drug_name,
  //         Y  AS note1,
  //         Z  AS note2,
  //         AD AS inject_time
  //       FROM dbo.order_view
  //       WHERE H = @date
  //         AND [センター区分] = '外来化学療法'
  //       ORDER BY A, B
  //     `);
  //   return res.json(result.recordset);
  // ─────────────────────────────────────────────────────────────

  res.status(501).json({ error: 'DWH接続が設定されていません。EMR_VENDOR=mock に設定してください。' });
});

export default router;
