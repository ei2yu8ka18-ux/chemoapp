/**
 * DWH同期ルート
 *
 * DWH（Symfoware）からデータを取得し、アプリのPostgreSQLへ反映する。
 *
 * エンドポイント:
 *   GET  /api/dwh-sync/health            接続確認
 *   POST /api/dwh-sync/blood?date=YYYY-MM-DD  採血情報同期
 *   POST /api/dwh-sync/urgent?date=YYYY-MM-DD 緊急処方同期
 *
 * NOTE: DWH側のテーブル名・カラム名はプレースホルダー。
 *       実際の定義に合わせて TODO コメント箇所を修正してください。
 */

import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { dwhQuery, dwhHealthCheck } from '../db/dwh';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticateToken);

// ────────────────────────────────────────────────────
// GET /api/dwh-sync/health  DWH接続確認
// ────────────────────────────────────────────────────
router.get('/health', async (_req, res: Response) => {
  const ok = await dwhHealthCheck();
  res.json({ ok, message: ok ? 'DWH接続OK' : 'DWH接続失敗' });
});

// ────────────────────────────────────────────────────
// POST /api/dwh-sync/blood?date=YYYY-MM-DD
// DWH採血情報 → blood_results へ upsert
// ────────────────────────────────────────────────────
router.post('/blood', async (req: AuthRequest, res: Response) => {
  const date = (req.query.date as string) ?? new Date().toISOString().split('T')[0];

  try {
    // ── Step1: DWHから採血データを取得 ──────────────────────────
    // TODO: 実際のDWHテーブル名・カラム名に合わせて修正してください。
    //
    // 想定カラム例:
    //   患者番号 (patient_no), WBC, HGB, PLT, ANC, MONO,
    //   CRE, eGFR, AST, ALT, T-BIL, CRP, Ca, Mg, UP, UPCR
    //
    const dwhBloodRows = await dwhQuery<{
      patient_no:  string;
      wbc:   number | null;
      hgb:   number | null;
      plt:   number | null;
      anc:   number | null;
      mono:  number | null;
      cre:   number | null;
      egfr:  number | null;
      ast:   number | null;
      alt:   number | null;
      tbil:  number | null;
      crp:   number | null;
      ca:    number | null;
      mg:    number | null;
      up:    number | null;
      upcr:  number | null;
    }>(
      // TODO: テーブル名・カラム名・日付フィルタ条件を実際の定義に合わせること
      `SELECT
         患者番号    AS patient_no,
         WBC        AS wbc,
         HGB        AS hgb,
         PLT        AS plt,
         ANC        AS anc,
         単球        AS mono,
         CRE        AS cre,
         eGFR       AS egfr,
         AST        AS ast,
         ALT        AS alt,
         T_BIL      AS tbil,
         CRP        AS crp,
         Ca         AS ca,
         Mg         AS mg,
         尿蛋白      AS up,
         UPCR       AS upcr
       FROM DWH採血テーブル
       WHERE 採血日 = ?`,
      [date]
    );

    if (!dwhBloodRows.length) {
      res.json({ ok: true, synced: 0, message: '採血データなし' });
      return;
    }

    // ── Step2: 当日のscheduled_treatmentsを取得（patient_no→id変換） ──
    const { rows: treatments } = await pool.query<{
      id: number; patient_no: string;
    }>(
      `SELECT st.id, p.patient_no
       FROM scheduled_treatments st
       JOIN patients p ON p.id = st.patient_id
       WHERE st.scheduled_date = $1`,
      [date]
    );

    const treatmentMap = new Map<string, number>(
      treatments.map((t: { id: number; patient_no: string }) => [t.patient_no, t.id])
    );

    // ── Step3: blood_results へ upsert ──────────────────────────
    const fields = ['wbc','hgb','plt','anc','mono','cre','egfr','ast','alt','tbil','crp','ca','mg','up','upcr'] as const;
    let synced = 0;

    for (const row of dwhBloodRows) {
      const treatmentId = treatmentMap.get(row.patient_no);
      if (!treatmentId) continue;  // 当日予定なし → スキップ

      const values = fields.map(f => row[f] ?? null);
      await pool.query(
        `INSERT INTO blood_results (treatment_id, ${fields.join(', ')}, updated_at)
         VALUES ($1, ${fields.map((_, i) => `$${i + 2}`).join(', ')}, NOW())
         ON CONFLICT (treatment_id) DO UPDATE SET
           ${fields.map((f, i) => `${f} = $${i + 2}`).join(', ')},
           updated_at = NOW()`,
        [treatmentId, ...values]
      );
      synced++;
    }

    res.json({ ok: true, synced, message: `採血情報 ${synced}件 同期完了` });

  } catch (err) {
    console.error('[dwh-sync/blood]', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// ────────────────────────────────────────────────────
// POST /api/dwh-sync/urgent?date=YYYY-MM-DD
// DWH緊急処方 → scheduled_treatments.prescription_type 等を更新
// ────────────────────────────────────────────────────
router.post('/urgent', async (req: AuthRequest, res: Response) => {
  const date = (req.query.date as string) ?? new Date().toISOString().split('T')[0];

  try {
    // ── Step1: DWHから緊急処方データを取得 ─────────────────────
    // TODO: 実際のDWHテーブル名・カラム名に合わせて修正してください。
    //
    // 想定カラム例:
    //   患者番号, 処方種別 ('緊急'/'院内'/'院外'), 処方内容(テキスト)
    //
    const dwhUrgentRows = await dwhQuery<{
      patient_no:        string;
      prescription_type: string;
      prescription_info: string | null;
    }>(
      // TODO: テーブル名・カラム名を実際の定義に合わせること
      `SELECT
         患者番号    AS patient_no,
         処方種別    AS prescription_type,
         処方内容    AS prescription_info
       FROM DWH処方テーブル
       WHERE 処方日 = ?
         AND 処方種別 = '緊急'`,
      [date]
    );

    if (!dwhUrgentRows.length) {
      res.json({ ok: true, synced: 0, message: '緊急処方データなし' });
      return;
    }

    // ── Step2: scheduled_treatments を更新 ─────────────────────
    const { rows: treatments } = await pool.query<{
      id: number; patient_no: string;
    }>(
      `SELECT st.id, p.patient_no
       FROM scheduled_treatments st
       JOIN patients p ON p.id = st.patient_id
       WHERE st.scheduled_date = $1`,
      [date]
    );

    const treatmentMap = new Map<string, number>(
      treatments.map((t: { id: number; patient_no: string }) => [t.patient_no, t.id])
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
        [row.prescription_type, row.prescription_info ?? null, treatmentId]
      );
      synced++;
    }

    res.json({ ok: true, synced, message: `緊急処方 ${synced}件 同期完了` });

  } catch (err) {
    console.error('[dwh-sync/urgent]', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export default router;
