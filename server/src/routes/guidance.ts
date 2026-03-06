import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticateToken);

// ─── 型定義 ─────────────────────────────────────────────────────
export interface OrderRow {
  patient_id:   string;
  order_no:     string;
  order_date:   string;   // YYYYMMDD
  patient_name: string;
  drug_code_sc: string;   // 列O: SC判定用コード
  drug_code:    string;   // 列Q: 薬剤コード（画像選択・時間デフォルト）
  drug_name:    string;   // 列R: 薬剤名
  note1:        string;   // 列Y: 注入備考1
  note2:        string;   // 列Z: 注入備考2
  inject_time:  string;   // 列AD: 注入時間
}

// ─── モックデータ ────────────────────────────────────────────────
function getMockOrders(date: string): OrderRow[] {
  const d = date.replace(/-/g, '');
  return [
    // 患者1: カルボプラチン + ペメトレキセド + キイトルーダ
    { patient_id: 'P00001', order_no: '001', order_date: d, patient_name: '田中　太郎',
      drug_code_sc: 'I5001350', drug_code: 'I5001350', drug_name: '生理食塩液100mL',
      note1: '', note2: '', inject_time: '30分' },
    { patient_id: 'P00001', order_no: '001', order_date: d, patient_name: '田中　太郎',
      drug_code_sc: 'I5000029', drug_code: 'I5000029', drug_name: 'デキサメタゾン注射液3.3mg',
      note1: '', note2: '', inject_time: '15分' },
    { patient_id: 'P00001', order_no: '002', order_date: d, patient_name: '田中　太郎',
      drug_code_sc: 'I5000983', drug_code: 'I5000983', drug_name: 'ペメトレキセド注射用500mg',
      note1: '', note2: '', inject_time: '10分' },
    { patient_id: 'P00001', order_no: '003', order_date: d, patient_name: '田中　太郎',
      drug_code_sc: 'I5000888', drug_code: 'I5000888', drug_name: 'カルボプラチン注射液150mg/15mL',
      note1: '', note2: '', inject_time: '30分' },
    { patient_id: 'P00001', order_no: '004', order_date: d, patient_name: '田中　太郎',
      drug_code_sc: 'I5001110', drug_code: 'I5001110', drug_name: 'ペンブロリズマブ（キイトルーダ）',
      note1: '', note2: '', inject_time: '30分' },

    // 患者2: ドセタキセル単剤
    { patient_id: 'P00002', order_no: '001', order_date: d, patient_name: '山田　花子',
      drug_code_sc: 'I5001350', drug_code: 'I5001350', drug_name: '生理食塩液250mL',
      note1: '', note2: '', inject_time: '30分' },
    { patient_id: 'P00002', order_no: '001', order_date: d, patient_name: '山田　花子',
      drug_code_sc: 'I5000970', drug_code: 'I5000970', drug_name: 'ドセタキセル注射液',
      note1: '', note2: '', inject_time: '1時間' },
    { patient_id: 'P00002', order_no: '002', order_date: d, patient_name: '山田　花子',
      drug_code_sc: 'I5001350', drug_code: 'I5001350', drug_name: '生理食塩液100mL',
      note1: '', note2: '', inject_time: '30分' },

    // 患者3: FOLFOX（オキサリプラチン + 5-FU + 持ち帰りポンプ）
    { patient_id: 'P00003', order_no: '001', order_date: d, patient_name: '鈴木　次郎',
      drug_code_sc: 'I5001350', drug_code: 'I5001350', drug_name: '生理食塩液100mL',
      note1: '', note2: '', inject_time: '30分' },
    { patient_id: 'P00003', order_no: '002', order_date: d, patient_name: '鈴木　次郎',
      drug_code_sc: 'I5000439', drug_code: 'I5000439', drug_name: 'オキサリプラチン点滴静注液',
      note1: '', note2: '', inject_time: '2時間' },
    { patient_id: 'P00003', order_no: '003', order_date: d, patient_name: '鈴木　次郎',
      drug_code_sc: 'I5000453', drug_code: 'I5000453', drug_name: '5-フルオロウラシル注',
      note1: 'ｲﾝﾌｭｰｻﾞｰにて約46時間', note2: '', inject_time: '46時間' },
  ];
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
