-- ユーザーテーブル
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50)  UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name  VARCHAR(100) NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'nurse'
                  CHECK (role IN ('admin', 'doctor', 'nurse', 'pharmacist')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 初期管理者アカウント (パスワード: admin123)
INSERT INTO users (username, password_hash, display_name, role)
VALUES (
  'admin',
  '$2a$10$vlCJSNUCI4sEeroXX49rYOMWuXBu7Q1.0ftDQnTn1NHeFTHK5PoFG',
  '管理者',
  'admin'
)
ON CONFLICT (username) DO NOTHING;
