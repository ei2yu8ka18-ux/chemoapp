/**
 * Symfoware DWH接続モジュール（ODBC）
 *
 * 接続文字列は環境変数 DWH_DSN で管理。
 * 未設定時は .env の値、それも無ければ以下のデフォルトを使用する。
 *
 * Windows ODBC データソース アドミニストレータで
 * DSN=DWH_DB を設定済みであることが前提。
 */

import odbc from 'odbc';

// 接続文字列（.env の DWH_DSN を優先）
const DWH_DSN =
  process.env.DWH_DSN ??
  'DSN=DWH_DB;UID=dwhuser;PWD=dwhuser;CLI_DEFAULT_SCHEMA=();';

/**
 * DWHへSQLを実行して結果を返す。
 * 接続は毎回 open/close する（コネクションプールは使わない）。
 */
export async function dwhQuery<T = Record<string, unknown>>(
  sql: string,
  params: (string | number)[] = []
): Promise<T[]> {
  const conn = await odbc.connect(DWH_DSN);
  try {
    // odbc.query の型は (string | number)[] のみ受け付けるため null は除外
    const result = await conn.query<T>(sql, params);
    return result as unknown as T[];
  } finally {
    await conn.close();
  }
}

/**
 * DWH接続ヘルスチェック。
 * Symfowareでは通常の "SELECT 1" が使えない場合があるため
 * システムテーブルへの軽量クエリを使用する。
 * ※ 実際のテーブル名は環境によって異なる可能性がある。
 */
export async function dwhHealthCheck(): Promise<boolean> {
  try {
    // TODO: Symfoware環境に合わせてクエリを調整してください
    // 例: await dwhQuery('SELECT 1 FROM RDBII_SYSTEM.RDBII_SYSTEM_TABLE FETCH FIRST 1 ROWS ONLY');
    await dwhQuery('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
