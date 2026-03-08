-- =====================================================================
-- Migration 018: patient_orders に Rp番号・投与経路ラベルを追加
--   rp_no   : 同一オーダー内の Rp 番号 (1, 2, 3...)
--   route_label : 投与経路テキスト (中心静脈/側管 など)
-- 既存の bag_no はそのまま使用
-- また: 全患者にフラッシュ液・ポートロック等のRpを追加
-- =====================================================================

ALTER TABLE patient_orders
  ADD COLUMN IF NOT EXISTS rp_no       INTEGER DEFAULT NULL,  -- Rp 番号 (グループキー)
  ADD COLUMN IF NOT EXISTS route_label VARCHAR(100) DEFAULT NULL; -- 投与経路ラベル

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- bag_no をそのまま rp_no として使う (bag_no=0 は bag_no=0+1=1 番に offset)
-- bag 0 → Rp1(プレメド), bag 1 → Rp2, bag 2 → Rp3 ...
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UPDATE patient_orders
SET rp_no = CASE WHEN bag_no IS NULL THEN NULL ELSE bag_no + 1 END
WHERE rp_no IS NULL AND bag_no IS NOT NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 患者1797323 (FOLFOX4) : ポートフラッシュ・ロック追加 & route_label
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UPDATE patient_orders po
SET route_label = '中心静脈（ＣＶポート使用）[無菌調製]'
FROM patients p
WHERE po.patient_id = p.id AND p.patient_no = '1797323';

-- ポートフラッシュ (Rp 最終+1)
INSERT INTO patient_orders
  (patient_id, order_date, drug_name, dose, dose_unit, route,
   is_antineoplastic, bag_no, rp_no, bag_order, route_label, regimen_name, order_no)
SELECT p.id,
       o.order_date,
       '生食注シリンジ10mL', 10, 'mL', '中心静脈（ＣＶポート使用）',
       false, 99, 100, 1,
       '中心静脈（ＣＶポート使用）[ポートフラッシュ]',
       o.regimen_name, 'FLUSH_PRE'
FROM patients p
CROSS JOIN (SELECT DISTINCT order_date, regimen_name FROM patient_orders
            WHERE patient_id = (SELECT id FROM patients WHERE patient_no = '1797323')) o
WHERE p.patient_no = '1797323'
ON CONFLICT DO NOTHING;

INSERT INTO patient_orders
  (patient_id, order_date, drug_name, dose, dose_unit, route,
   is_antineoplastic, bag_no, rp_no, bag_order, route_label, regimen_name, order_no)
SELECT p.id,
       o.order_date,
       'ヘパリンNaロック100単位/mL シリンジ10mL', 10, 'mL', '中心静脈（ＣＶポート使用）',
       false, 100, 101, 1,
       '中心静脈（ＣＶポート使用）[ポートロック]',
       o.regimen_name, 'LOCK_POST'
FROM patients p
CROSS JOIN (SELECT DISTINCT order_date, regimen_name FROM patient_orders
            WHERE patient_id = (SELECT id FROM patients WHERE patient_no = '1797323')) o
WHERE p.patient_no = '1797323'
ON CONFLICT DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 患者2400687 (weeklyPAC) : route_label + フラッシュ
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UPDATE patient_orders po
SET route_label = '中心静脈（ＣＶポート使用）[無菌調製]'
FROM patients p
WHERE po.patient_id = p.id AND p.patient_no = '2400687';

INSERT INTO patient_orders
  (patient_id, order_date, drug_name, dose, dose_unit, route,
   is_antineoplastic, bag_no, rp_no, bag_order, route_label, regimen_name, order_no)
SELECT p.id, o.order_date,
       '大塚生食注50mL（フラッシュ）', 50, 'mL', '中心静脈（ＣＶポート使用）',
       false, 98, 99, 1, '中心静脈（ＣＶポート使用）[フラッシュ]',
       o.regimen_name, 'FLUSH_MID'
FROM patients p
CROSS JOIN (SELECT DISTINCT order_date, regimen_name FROM patient_orders
            WHERE patient_id = (SELECT id FROM patients WHERE patient_no = '2400687')) o
WHERE p.patient_no = '2400687'
ON CONFLICT DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- route_label を未設定の全患者に設定（IV 系）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UPDATE patient_orders
SET route_label = COALESCE(
  CASE
    WHEN route ILIKE '%中心静脈%CVポート%' THEN '中心静脈（ＣＶポート使用）[無菌調製]'
    WHEN route ILIKE '%中心静脈%' THEN '中心静脈[無菌調製]'
    WHEN route ILIKE '%側管%' THEN '中心静脈（ＣＶポート）側管[無菌調製]'
    WHEN route ILIKE '%皮下%' THEN '皮下注射'
    WHEN route ILIKE '%静脈%' OR route ILIKE '%点滴%' THEN '点滴静脈注射[無菌調製]'
    ELSE route
  END,
  '点滴静脈注射[無菌調製]'
)
WHERE route_label IS NULL AND bag_no IS NOT NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- rp_no が NULL (bag_no IS NULL) の薬品には bag_no 99 以降を使う
-- ただし皮下注・経口はそのままでよい
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SELECT 'Migration 018 完了' AS result;
