-- ログイン・ログアウトログ
CREATE TABLE IF NOT EXISTS auth_logs (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  action     VARCHAR(20) NOT NULL,        -- 'login' | 'logout'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_logs_user    ON auth_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_logs_created ON auth_logs(created_at DESC);

-- 処方詳細（緊急処方の内容、EMR連携後に設定）
ALTER TABLE scheduled_treatments
  ADD COLUMN IF NOT EXISTS prescription_info TEXT;
