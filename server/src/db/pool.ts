import { Pool, types } from 'pg';

// DATE型 (OID 1082) を文字列のまま返す
// デフォルトでは pg が new Date(y,m,d) を生成し JST 環境では UTC に直すと
// 日付が1日前にずれる問題を防ぐ
types.setTypeParser(1082, (val: string) => val);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
