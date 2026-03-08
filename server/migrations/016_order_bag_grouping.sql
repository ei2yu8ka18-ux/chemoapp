-- =====================================================================
-- Migration 016: patient_orders にバッグ番号・溶媒情報を追加
-- 点滴説明書形式の表示に対応
-- =====================================================================

ALTER TABLE patient_orders
  ADD COLUMN IF NOT EXISTS bag_no         INTEGER        DEFAULT NULL,  -- バッグ番号 (NULL=経口/皮下)
  ADD COLUMN IF NOT EXISTS solvent_name   VARCHAR(100)   DEFAULT NULL,  -- 溶媒名 (例: '生理食塩液', '5%ブドウ糖液')
  ADD COLUMN IF NOT EXISTS solvent_vol_ml INTEGER        DEFAULT NULL,  -- 溶媒量(mL)
  ADD COLUMN IF NOT EXISTS bag_order      INTEGER        DEFAULT 0;     -- バッグ内表示順

-- ── 今日のオーダーにバッグ情報を設定 ──────────────────────────────

-- 患者1797323 (オキバイド+5FU/LV)
UPDATE patient_orders po
SET bag_no=1, solvent_name='生理食塩液', solvent_vol_ml=250, bag_order=1
FROM patients p
WHERE po.patient_id=p.id AND p.patient_no='1797323'
  AND po.drug_name='オキサリプラチン点滴静注液' AND po.order_date=CURRENT_DATE;

UPDATE patient_orders po
SET bag_no=2, solvent_name='5%ブドウ糖液', solvent_vol_ml=250, bag_order=1
FROM patients p
WHERE po.patient_id=p.id AND p.patient_no='1797323'
  AND po.drug_name='レボホリナートカルシウム点滴静注' AND po.order_date=CURRENT_DATE;

UPDATE patient_orders po
SET bag_no=2, solvent_name='5%ブドウ糖液', solvent_vol_ml=250, bag_order=2
FROM patients p
WHERE po.patient_id=p.id AND p.patient_no='1797323'
  AND po.drug_name='フルオロウラシル注射液 急速投与' AND po.order_date=CURRENT_DATE;

UPDATE patient_orders po
SET bag_no=3, solvent_name='5%ブドウ糖液', solvent_vol_ml=250, bag_order=1
FROM patients p
WHERE po.patient_id=p.id AND p.patient_no='1797323'
  AND po.drug_name='フルオロウラシル注射液 持続投与' AND po.order_date=CURRENT_DATE;

-- 患者2400687 (weeklyPAC)
UPDATE patient_orders po
SET bag_no=1, solvent_name='生理食塩液', solvent_vol_ml=500, bag_order=1
FROM patients p
WHERE po.patient_id=p.id AND p.patient_no='2400687'
  AND po.drug_name='パクリタキセル注射液' AND po.order_date=CURRENT_DATE;

-- 患者3062676 (パドセブ)
UPDATE patient_orders po
SET bag_no=1, solvent_name='生理食塩液', solvent_vol_ml=100, bag_order=1
FROM patients p
WHERE po.patient_id=p.id AND p.patient_no='3062676'
  AND po.drug_name='エンホルツマブベドチン' AND po.order_date=CURRENT_DATE;

-- 患者3084969 (フェスゴ+DTX)
UPDATE patient_orders po
SET bag_no=1, solvent_name='生理食塩液', solvent_vol_ml=250, bag_order=1
FROM patients p
WHERE po.patient_id=p.id AND p.patient_no='3084969'
  AND po.drug_name='ドセタキセル注射液' AND po.order_date=CURRENT_DATE;
-- フェスゴは皮下注射なのでbag_no=NULL (変更なし)

-- 患者3340072 (BV+FOLFIRI)
UPDATE patient_orders po
SET bag_no=1, solvent_name='生理食塩液', solvent_vol_ml=100, bag_order=1
FROM patients p
WHERE po.patient_id=p.id AND p.patient_no='3340072'
  AND po.drug_name='ベバシズマブ注射液' AND po.order_date=CURRENT_DATE;

UPDATE patient_orders po
SET bag_no=2, solvent_name='生理食塩液', solvent_vol_ml=250, bag_order=1
FROM patients p
WHERE po.patient_id=p.id AND p.patient_no='3340072'
  AND po.drug_name='イリノテカン塩酸塩注射液' AND po.order_date=CURRENT_DATE;

UPDATE patient_orders po
SET bag_no=2, solvent_name='生理食塩液', solvent_vol_ml=250, bag_order=2
FROM patients p
WHERE po.patient_id=p.id AND p.patient_no='3340072'
  AND po.drug_name='レボホリナートカルシウム' AND po.order_date=CURRENT_DATE;

UPDATE patient_orders po
SET bag_no=2, solvent_name='生理食塩液', solvent_vol_ml=250, bag_order=3
FROM patients p
WHERE po.patient_id=p.id AND p.patient_no='3340072'
  AND po.drug_name='フルオロウラシル急速' AND po.order_date=CURRENT_DATE;

UPDATE patient_orders po
SET bag_no=3, solvent_name='5%ブドウ糖液', solvent_vol_ml=250, bag_order=1
FROM patients p
WHERE po.patient_id=p.id AND p.patient_no='3340072'
  AND po.drug_name='フルオロウラシル持続' AND po.order_date=CURRENT_DATE;

-- 患者3608130 (アクテムラ)
UPDATE patient_orders po
SET bag_no=1, solvent_name='生理食塩液', solvent_vol_ml=100, bag_order=1
FROM patients p
WHERE po.patient_id=p.id AND p.patient_no='3608130'
  AND po.drug_name='トシリズマブ注射液' AND po.order_date=CURRENT_DATE;

-- 患者3643921 (DTX)
UPDATE patient_orders po
SET bag_no=1, solvent_name='生理食塩液', solvent_vol_ml=250, bag_order=1
FROM patients p
WHERE po.patient_id=p.id AND p.patient_no='3643921'
  AND po.drug_name='ドセタキセル注射液' AND po.order_date=CURRENT_DATE;

-- ── 次回予定オーダー（患者ごとの最初の将来日付）にも同じバッグ情報をコピー ─
-- 今日のオーダーのバッグ設定を、同患者の将来のオーダーにコピー
UPDATE patient_orders future_po
SET
  bag_no         = today_po.bag_no,
  solvent_name   = today_po.solvent_name,
  solvent_vol_ml = today_po.solvent_vol_ml,
  bag_order      = today_po.bag_order
FROM patient_orders today_po
WHERE today_po.patient_id = future_po.patient_id
  AND today_po.order_date = CURRENT_DATE
  AND today_po.drug_name  = future_po.drug_name
  AND future_po.order_date > CURRENT_DATE
  AND future_po.bag_no IS NULL;

-- ── 過去の履歴オーダー（migration 015 で追加分）にも同じバッグ情報をコピー ─
UPDATE patient_orders hist_po
SET
  bag_no         = today_po.bag_no,
  solvent_name   = today_po.solvent_name,
  solvent_vol_ml = today_po.solvent_vol_ml,
  bag_order      = today_po.bag_order
FROM patient_orders today_po
WHERE today_po.patient_id = hist_po.patient_id
  AND today_po.order_date = CURRENT_DATE
  AND today_po.drug_name  = hist_po.drug_name
  AND hist_po.order_date < CURRENT_DATE
  AND hist_po.bag_no IS NULL;
