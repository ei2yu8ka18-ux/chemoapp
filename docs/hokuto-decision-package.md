# HOKUTO構造化パッケージ仕様（外部アプリ → chemoapp）

## 方針
- HOKUTO HTML解析・OCRは外部アプリで実施
- chemoapp は「構造化済みJSON」を取り込んでDB化する

## 取り込みAPI
- `POST /api/regimen-check/decision-support/import-package`
- 認証: 管理者トークン必須
- ボディ: `records` 配列（配列直送も可）

## レコード最小項目
- `regimenName` (必須)
- `department` (任意)
- `sourceTitle` (任意)
- `sourceFile` (任意)
- `markdownContent` (任意)
- `decisionSupport` (任意)

## decisionSupport の項目
- `criteria`: 投与開始基準
- `doseLevels`: 用法用量 / 減量レベル
- `toxicityActions`: 減量基準 / 減量中止基準 / 有害事象

各行は `section_type` を持てます。

- `protocol`
- `dose_level`
- `start_criteria`
- `dose_reduction_criteria`
- `hold_stop_criteria`
- `adverse_event`
- `other`

## JSON例
```json
{
  "version": "1.0",
  "records": [
    {
      "regimenName": "FOLFOXIRI＋Bmab",
      "department": "消化器内科",
      "sourceTitle": "HOKUTO FOLFOXIRI",
      "sourceFile": "hokuto:Qe9X2zNRHUrBc42gdxsw",
      "markdownContent": "# FOLFOXIRI",
      "decisionSupport": {
        "criteria": [
          {
            "metric_key": "anc",
            "comparator": ">=",
            "threshold_value": 1.5,
            "threshold_unit": "x10^3/uL",
            "criterion_text": "好中球数≧1,500/μL",
            "is_required": true,
            "section_type": "start_criteria",
            "source_section": "投与開始基準"
          }
        ],
        "doseLevels": [
          {
            "drug_name": "CPT-11",
            "level_index": 0,
            "level_label": "初回投与量",
            "dose_text": "165 mg/m2",
            "section_type": "dose_level",
            "source_section": "減量レベル"
          }
        ],
        "toxicityActions": [
          {
            "toxicity_name": "下痢",
            "condition_text": "Grade 4",
            "action_text": "2段階減量",
            "level_delta": 2,
            "hold_flag": false,
            "discontinue_flag": false,
            "priority": 20,
            "section_type": "dose_reduction_criteria",
            "source_section": "減量基準"
          }
        ]
      }
    }
  ]
}
```

## 取り込みUI
- 画面: レジメンマスタ
- ボタン: `構造化JSON取り込み`

