-- =====================================================
-- Migration 013: レジメンマスタ
-- =====================================================

-- ── レジメンマスタ ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS regimen_master (
  id             SERIAL PRIMARY KEY,
  regimen_name   VARCHAR(200) NOT NULL UNIQUE,
  category       VARCHAR(100),
  cycle_days     INTEGER DEFAULT 21,
  description    TEXT,
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── レジメン薬剤マスタ ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS regimen_drugs (
  id              SERIAL PRIMARY KEY,
  regimen_id      INTEGER NOT NULL REFERENCES regimen_master(id) ON DELETE CASCADE,
  sort_order      INTEGER DEFAULT 1,
  drug_name       VARCHAR(200) NOT NULL,
  drug_type       VARCHAR(30)  DEFAULT 'antineoplastic',
  base_dose       NUMERIC(10,3),
  dose_unit       VARCHAR(30),
  dose_per        VARCHAR(50)  DEFAULT 'BSA',
  solvent_name    VARCHAR(200),
  solvent_volume  NUMERIC(8,1),
  route           VARCHAR(100),
  drip_time       VARCHAR(50),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── グレード別毒性対処ルール ──────────────────────────────────
CREATE TABLE IF NOT EXISTS regimen_toxicity_rules (
  id              SERIAL PRIMARY KEY,
  regimen_id      INTEGER NOT NULL REFERENCES regimen_master(id) ON DELETE CASCADE,
  toxicity_item   VARCHAR(100) NOT NULL,
  grade1_action   VARCHAR(300) DEFAULT '継続',
  grade2_action   VARCHAR(300) DEFAULT '減量検討',
  grade3_action   VARCHAR(300) DEFAULT '休薬または減量',
  grade4_action   VARCHAR(300) DEFAULT '中止推奨',
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(regimen_id, toxicity_item)
);

-- ── サンプルデータ: オキバイド+5FU/LV ───────────────────────
INSERT INTO regimen_master (regimen_name, category, cycle_days, description)
VALUES ('オキバイド+5FU/LV', '大腸癌/膵癌', 14, 'mFOLFOX6: Oxaliplatin + 5-FU/LV. q2w.')
ON CONFLICT (regimen_name) DO NOTHING;

DO $$
DECLARE v_id INTEGER;
BEGIN
  SELECT id INTO v_id FROM regimen_master WHERE regimen_name = 'オキバイド+5FU/LV';
  INSERT INTO regimen_drugs (regimen_id, sort_order, drug_name, drug_type, base_dose, dose_unit, dose_per, solvent_name, solvent_volume, route, drip_time)
  VALUES
    (v_id, 1, '生理食塩液100mL',        'solvent',        NULL,   'mL',    'fixed',        NULL,            NULL,  '溶媒',    NULL),
    (v_id, 2, 'オキサリプラチン点滴静注液', 'antineoplastic', 85,     'mg/m²', 'BSA',          '生理食塩液100mL', 100,   '点滴静注', '2時間'),
    (v_id, 3, '生理食塩液250mL',        'solvent',        NULL,   'mL',    'fixed',        NULL,            NULL,  '溶媒',    NULL),
    (v_id, 4, 'レボホリナートカルシウム',  'support',        200,    'mg/m²', 'BSA',          '生理食塩液250mL', 250,   '点滴静注', '2時間'),
    (v_id, 5, 'フルオロウラシル（急速）',  'antineoplastic', 400,    'mg/m²', 'BSA',          NULL,            NULL,  '急速静注', '急速'),
    (v_id, 6, 'フルオロウラシル（持続）',  'antineoplastic', 2400,   'mg/m²', 'BSA',          NULL,            NULL,  '持続点滴', '46時間')
  ON CONFLICT DO NOTHING;

  INSERT INTO regimen_toxicity_rules (regimen_id, toxicity_item, grade1_action, grade2_action, grade3_action, grade4_action)
  VALUES
    (v_id, 'ANC',      '継続',          'ANC 1.0-1.5: 継続(注意)',   'ANC 0.5-1.0: Oxaliplatin省略または休薬', 'ANC <0.5: 休薬, G-CSF検討'),
    (v_id, 'Plt',      '継続',          '継続(注意)',               'Plt <50: 休薬',                         'Plt <25: 中止推奨'),
    (v_id, '末梢神経障害', '継続',        'Oxaliplatin 75mg/m²に減量', 'Oxaliplatin省略, 5FU/LV継続',          '中止推奨'),
    (v_id, 'Cre',      '継続',          'eGFR確認, 減量検討',        'eGFR<30: 慎重投与/中止検討',            '中止推奨')
  ON CONFLICT DO NOTHING;
END$$;

-- weeklyPAC
INSERT INTO regimen_master (regimen_name, category, cycle_days, description)
VALUES ('weeklyPAC', '乳癌', 7, 'Weekly Paclitaxel. q1w × 12回.')
ON CONFLICT (regimen_name) DO NOTHING;

DO $$
DECLARE v_id INTEGER;
BEGIN
  SELECT id INTO v_id FROM regimen_master WHERE regimen_name = 'weeklyPAC';
  INSERT INTO regimen_drugs (regimen_id, sort_order, drug_name, drug_type, base_dose, dose_unit, dose_per, solvent_name, solvent_volume, route, drip_time)
  VALUES
    (v_id, 1, '生理食塩液250mL',        'solvent',        NULL, 'mL',    'fixed', NULL,            NULL, '溶媒',    NULL),
    (v_id, 2, 'パクリタキセル注射液',    'antineoplastic', 80,   'mg/m²', 'BSA',  '生理食塩液250mL', 250, '点滴静注', '1時間')
  ON CONFLICT DO NOTHING;

  INSERT INTO regimen_toxicity_rules (regimen_id, toxicity_item, grade1_action, grade2_action, grade3_action, grade4_action)
  VALUES
    (v_id, 'ANC',      '継続', 'ANC 1.0-1.5: 継続(注意)', 'ANC <1.0: 1週延期',      '中止推奨'),
    (v_id, '末梢神経障害', '継続', '継続(注意)',              '休薬または25%減量',       '中止推奨'),
    (v_id, '皮膚毒性',  '継続', '継続(注意)',              '1週延期または20%減量',    '中止推奨')
  ON CONFLICT DO NOTHING;
END$$;

-- パドセブ
INSERT INTO regimen_master (regimen_name, category, cycle_days, description)
VALUES ('パドセブ', '膀胱癌', 28, 'Enfortumab vedotin. Day1,8,15 q4w.')
ON CONFLICT (regimen_name) DO NOTHING;

DO $$
DECLARE v_id INTEGER;
BEGIN
  SELECT id INTO v_id FROM regimen_master WHERE regimen_name = 'パドセブ';
  INSERT INTO regimen_drugs (regimen_id, sort_order, drug_name, drug_type, base_dose, dose_unit, dose_per, solvent_name, solvent_volume, route, drip_time)
  VALUES
    (v_id, 1, '生理食塩液250mL',              'solvent',        NULL,  'mL',   'fixed',        NULL,            NULL, '溶媒',    NULL),
    (v_id, 2, 'エンホルツマブベドチン点滴静注', 'antineoplastic', 1.25, 'mg/kg', 'body_weight', '生理食塩液250mL', 250, '点滴静注', '30分')
  ON CONFLICT DO NOTHING;

  INSERT INTO regimen_toxicity_rules (regimen_id, toxicity_item, grade1_action, grade2_action, grade3_action, grade4_action)
  VALUES
    (v_id, '皮膚障害',  '継続', '1.0mg/kgに減量', '休薬、回復後0.75mg/kgで再開', '中止推奨'),
    (v_id, '末梢神経障害', '継続', '1.0mg/kgに減量', '休薬、回復後0.75mg/kgで再開', '中止推奨'),
    (v_id, 'ANC',      '継続', '継続(注意)',       'ANC <1.0: 休薬',            '中止推奨')
  ON CONFLICT DO NOTHING;
END$$;

-- DTX
INSERT INTO regimen_master (regimen_name, category, cycle_days, description)
VALUES ('DTX', '前立腺癌/乳癌', 21, 'Docetaxel単剤. q3w.')
ON CONFLICT (regimen_name) DO NOTHING;

DO $$
DECLARE v_id INTEGER;
BEGIN
  SELECT id INTO v_id FROM regimen_master WHERE regimen_name = 'DTX';
  INSERT INTO regimen_drugs (regimen_id, sort_order, drug_name, drug_type, base_dose, dose_unit, dose_per, solvent_name, solvent_volume, route, drip_time)
  VALUES
    (v_id, 1, '生理食塩液250mL',   'solvent',        NULL, 'mL',    'fixed', NULL,            NULL, '溶媒',    NULL),
    (v_id, 2, 'ドセタキセル注射液', 'antineoplastic', 75,   'mg/m²', 'BSA',  '生理食塩液250mL', 250, '点滴静注', '1時間')
  ON CONFLICT DO NOTHING;

  INSERT INTO regimen_toxicity_rules (regimen_id, toxicity_item, grade1_action, grade2_action, grade3_action, grade4_action)
  VALUES
    (v_id, 'ANC',      '継続', 'ANC 1.0-1.5: 継続(注意)', 'ANC <1.0または発熱性好中球減少症: 休薬, 60mg/m²に減量', '中止推奨'),
    (v_id, 'AST',      '継続', 'AST 40-120: 60mg/m²に減量', 'AST >120: 休薬',                                  '中止推奨'),
    (v_id, 'ALT',      '継続', 'ALT 40-120: 60mg/m²に減量', 'ALT >120: 休薬',                                  '中止推奨'),
    (v_id, '末梢神経障害', '継続', '継続(注意)',              '60mg/m²に減量',                                   '中止検討')
  ON CONFLICT DO NOTHING;
END$$;

-- BV+FOLFIRI
INSERT INTO regimen_master (regimen_name, category, cycle_days, description)
VALUES ('BV+FOLFIRI', '大腸癌/肺癌', 14, 'Bevacizumab + FOLFIRI. q2w.')
ON CONFLICT (regimen_name) DO NOTHING;

DO $$
DECLARE v_id INTEGER;
BEGIN
  SELECT id INTO v_id FROM regimen_master WHERE regimen_name = 'BV+FOLFIRI';
  INSERT INTO regimen_drugs (regimen_id, sort_order, drug_name, drug_type, base_dose, dose_unit, dose_per, solvent_name, solvent_volume, route, drip_time)
  VALUES
    (v_id, 1, '生理食塩液100mL',          'solvent',        NULL, 'mL',    'fixed', NULL,            NULL, '溶媒',    NULL),
    (v_id, 2, 'ベバシズマブ注射液',        'antineoplastic', 5,    'mg/kg', 'body_weight', '生理食塩液100mL', 100, '点滴静注', '30-90分'),
    (v_id, 3, '生理食塩液250mL',          'solvent',        NULL, 'mL',    'fixed', NULL,            NULL, '溶媒',    NULL),
    (v_id, 4, 'イリノテカン塩酸塩注射液',  'antineoplastic', 150, 'mg/m²', 'BSA',  '生理食塩液250mL', 250, '点滴静注', '90分'),
    (v_id, 5, 'レボホリナートカルシウム',  'support',        200, 'mg/m²', 'BSA',  '生理食塩液250mL', 250, '点滴静注', '2時間'),
    (v_id, 6, 'フルオロウラシル（急速）',  'antineoplastic', 400, 'mg/m²', 'BSA',  NULL,            NULL, '急速静注', '急速'),
    (v_id, 7, 'フルオロウラシル（持続）',  'antineoplastic', 2400,'mg/m²', 'BSA',  NULL,            NULL, '持続点滴', '46時間')
  ON CONFLICT DO NOTHING;

  INSERT INTO regimen_toxicity_rules (regimen_id, toxicity_item, grade1_action, grade2_action, grade3_action, grade4_action)
  VALUES
    (v_id, 'ANC',   '継続', '継続(注意)', 'ANC <1.0: 休薬', '中止推奨'),
    (v_id, '下痢',  '継続', '用量減量検討', 'イリノテカン25%減量', 'イリノテカン中止'),
    (v_id, '高血圧', '継続', '降圧薬調整', 'BV減量または休薬', 'BV中止')
  ON CONFLICT DO NOTHING;
END$$;

-- フェスゴ+DTX
INSERT INTO regimen_master (regimen_name, category, cycle_days, description)
VALUES ('フェスゴ+DTX', 'HER2陽性乳癌', 21, 'Phesgo(P+T fixed) + Docetaxel. q3w.')
ON CONFLICT (regimen_name) DO NOTHING;

DO $$
DECLARE v_id INTEGER;
BEGIN
  SELECT id INTO v_id FROM regimen_master WHERE regimen_name = 'フェスゴ+DTX';
  INSERT INTO regimen_drugs (regimen_id, sort_order, drug_name, drug_type, base_dose, dose_unit, dose_per, solvent_name, solvent_volume, route, drip_time)
  VALUES
    (v_id, 1, '生理食塩液250mL',   'solvent',        NULL,   'mL',  'fixed', NULL,            NULL, '溶媒',    NULL),
    (v_id, 2, 'ドセタキセル注射液', 'antineoplastic', 75,    'mg/m²','BSA',  '生理食塩液250mL', 250, '点滴静注', '1時間'),
    (v_id, 3, 'フェスゴ皮下注',    'antineoplastic', 1200,  'mg',   'fixed', NULL,            NULL, '皮下注射', '5-8分')
  ON CONFLICT DO NOTHING;

  INSERT INTO regimen_toxicity_rules (regimen_id, toxicity_item, grade1_action, grade2_action, grade3_action, grade4_action)
  VALUES
    (v_id, 'ANC',      '継続', '継続(注意)', 'DTX 60mg/m²に減量または休薬', '中止推奨'),
    (v_id, 'AST',      '継続', 'DTX 60mg/m²に減量', 'AST >120: 休薬', '中止推奨'),
    (v_id, 'ALT',      '継続', 'DTX 60mg/m²に減量', 'ALT >120: 休薬', '中止推奨'),
    (v_id, '末梢神経障害', '継続', '継続(注意)', 'DTX減量または休薬', '中止検討')
  ON CONFLICT DO NOTHING;
END$$;

SELECT 'Migration 013 完了' AS result;
