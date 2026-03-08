-- =====================================================================
-- Migration 017: patient_orders バッグ番号補完
--   PART A: 全患者の IV 支持療法（グラニセトロン・デキサメタゾン）
--   PART B: 患者8-15 (migration 011 追加分) の抗腫瘍薬 IV オーダー
-- =====================================================================

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PART A: 全患者の IV 支持療法をバッグ0 (プレメド) に割り当て
-- bag_no=0 は表示順が bag_no=1,2,3... より前になる
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- グラニセトロン点滴 → bag 0, order 1
UPDATE patient_orders
SET bag_no = 0, solvent_name = '生理食塩液', solvent_vol_ml = 100, bag_order = 1
WHERE drug_name LIKE 'グラニセトロン%'
  AND route LIKE '%点滴%'
  AND bag_no IS NULL;

-- デキサメタゾン点滴 → bag 0, order 2（グラニセトロン同バッグ混合）
UPDATE patient_orders
SET bag_no = 0, solvent_name = NULL, solvent_vol_ml = NULL, bag_order = 2
WHERE drug_name LIKE 'デキサメタゾン%'
  AND route LIKE '%点滴%'
  AND bag_no IS NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PART B: 患者8 (4012345) オキバイド+5FU/LV
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UPDATE patient_orders po
SET bag_no = 2, solvent_name = '生理食塩液', solvent_vol_ml = 100, bag_order = 1
FROM patients p
WHERE po.patient_id = p.id AND p.patient_no = '4012345'
  AND po.drug_name = 'オキサリプラチン' AND po.bag_no IS NULL;

UPDATE patient_orders po
SET bag_no = 3, solvent_name = '生理食塩液', solvent_vol_ml = 250, bag_order = 1
FROM patients p
WHERE po.patient_id = p.id AND p.patient_no = '4012345'
  AND po.drug_name = 'レボホリナート' AND po.bag_no IS NULL;

-- 5-FU 持続点滴はポンプバッグ（bag 4）
UPDATE patient_orders po
SET bag_no = 4, solvent_name = '5%ブドウ糖液', solvent_vol_ml = 250, bag_order = 1
FROM patients p
WHERE po.patient_id = p.id AND p.patient_no = '4012345'
  AND po.drug_name = '5-FU' AND po.bag_no IS NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PART C: 患者9 (4023456) CBDCA+PEM
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UPDATE patient_orders po
SET bag_no = 2, solvent_name = '生理食塩液', solvent_vol_ml = 100, bag_order = 1
FROM patients p
WHERE po.patient_id = p.id AND p.patient_no = '4023456'
  AND po.drug_name = 'ペメトレキセド' AND po.bag_no IS NULL;

UPDATE patient_orders po
SET bag_no = 3, solvent_name = '5%ブドウ糖液', solvent_vol_ml = 250, bag_order = 1
FROM patients p
WHERE po.patient_id = p.id AND p.patient_no = '4023456'
  AND po.drug_name = 'カルボプラチン' AND po.bag_no IS NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PART D: 患者10 (4034567) R-CHOP
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UPDATE patient_orders po
SET bag_no = 2, solvent_name = '生理食塩液', solvent_vol_ml = 500, bag_order = 1
FROM patients p
WHERE po.patient_id = p.id AND p.patient_no = '4034567'
  AND po.drug_name = 'リツキシマブ' AND po.bag_no IS NULL;

UPDATE patient_orders po
SET bag_no = 3, solvent_name = '生理食塩液', solvent_vol_ml = 100, bag_order = 1
FROM patients p
WHERE po.patient_id = p.id AND p.patient_no = '4034567'
  AND po.drug_name = 'シクロホスファミド' AND po.bag_no IS NULL;

-- ドキソルビシン・ビンクリスチン → 同バッグ (bag 4, NS50mL)
UPDATE patient_orders po
SET bag_no = 4, solvent_name = '生理食塩液', solvent_vol_ml = 50, bag_order = 1
FROM patients p
WHERE po.patient_id = p.id AND p.patient_no = '4034567'
  AND po.drug_name = 'ドキソルビシン' AND po.bag_no IS NULL;

UPDATE patient_orders po
SET bag_no = 4, solvent_name = NULL, solvent_vol_ml = NULL, bag_order = 2
FROM patients p
WHERE po.patient_id = p.id AND p.patient_no = '4034567'
  AND po.drug_name = 'ビンクリスチン' AND po.bag_no IS NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PART E: 患者11 (4045678) TC
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UPDATE patient_orders po
SET bag_no = 2, solvent_name = '生理食塩液', solvent_vol_ml = 500, bag_order = 1
FROM patients p
WHERE po.patient_id = p.id AND p.patient_no = '4045678'
  AND po.drug_name = 'パクリタキセル' AND po.bag_no IS NULL;

UPDATE patient_orders po
SET bag_no = 3, solvent_name = '5%ブドウ糖液', solvent_vol_ml = 250, bag_order = 1
FROM patients p
WHERE po.patient_id = p.id AND p.patient_no = '4045678'
  AND po.drug_name = 'カルボプラチン' AND po.bag_no IS NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PART F: 患者13 (4067890) トラスツズマブ単剤（プレメドなし）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UPDATE patient_orders po
SET bag_no = 1, solvent_name = '生理食塩液', solvent_vol_ml = 250, bag_order = 1
FROM patients p
WHERE po.patient_id = p.id AND p.patient_no = '4067890'
  AND po.drug_name = 'トラスツズマブ' AND po.bag_no IS NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PART G: 患者14 (4078901) オキバイド+5FU/LV
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UPDATE patient_orders po
SET bag_no = 2, solvent_name = '生理食塩液', solvent_vol_ml = 100, bag_order = 1
FROM patients p
WHERE po.patient_id = p.id AND p.patient_no = '4078901'
  AND po.drug_name = 'オキサリプラチン' AND po.bag_no IS NULL;

UPDATE patient_orders po
SET bag_no = 3, solvent_name = '生理食塩液', solvent_vol_ml = 250, bag_order = 1
FROM patients p
WHERE po.patient_id = p.id AND p.patient_no = '4078901'
  AND po.drug_name = 'レボホリナート' AND po.bag_no IS NULL;

UPDATE patient_orders po
SET bag_no = 4, solvent_name = '5%ブドウ糖液', solvent_vol_ml = 250, bag_order = 1
FROM patients p
WHERE po.patient_id = p.id AND p.patient_no = '4078901'
  AND po.drug_name = '5-FU' AND po.bag_no IS NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PART H: 患者15 (4089012) GEM+nab-PTX
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UPDATE patient_orders po
SET bag_no = 2, solvent_name = '生理食塩液', solvent_vol_ml = 100, bag_order = 1
FROM patients p
WHERE po.patient_id = p.id AND p.patient_no = '4089012'
  AND po.drug_name = 'ゲムシタビン' AND po.bag_no IS NULL;

UPDATE patient_orders po
SET bag_no = 3, solvent_name = '生理食塩液', solvent_vol_ml = 250, bag_order = 1
FROM patients p
WHERE po.patient_id = p.id AND p.patient_no = '4089012'
  AND po.drug_name = 'ナブパクリタキセル' AND po.bag_no IS NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 将来・過去のオーダーに今日のバッグ設定をコピー（bag_no IS NULL のもの）
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UPDATE patient_orders future_po
SET
  bag_no         = today_po.bag_no,
  solvent_name   = today_po.solvent_name,
  solvent_vol_ml = today_po.solvent_vol_ml,
  bag_order      = today_po.bag_order
FROM patient_orders today_po
WHERE today_po.patient_id = future_po.patient_id
  AND today_po.order_date  = CURRENT_DATE
  AND today_po.drug_name   = future_po.drug_name
  AND future_po.order_date <> CURRENT_DATE
  AND future_po.bag_no IS NULL;

SELECT 'Migration 017 完了' AS result;
