# hokuto-extractor-app

HOKUTOページ(HTML)と画像表(OCR)から、`chemoapp` の `decision-support/import-package` に投入できるJSONを作るCLIです。

## 1. 別リポジトリ切り出し
`chemoapp` 側から切り出す場合は下記を実行します。

```powershell
cd C:\Dev\chemoapp
.\tools\hokuto-extractor-app\scripts\export-standalone.ps1 -TargetPath C:\Dev\hokuto-extractor-app -Force
```

詳細: [REPOSITORY_SETUP.md](./REPOSITORY_SETUP.md)

## 2. OCR精度改善ポイント
- 前処理: `grayscale + contrast + normalize + threshold + upscale`
- Tesseract設定: `PSM` と `preserve_interword_spaces`
- 行再構成: OCR改行を結合して表行を復元
- 列推定: `|` / 複数スペース / タブで列分割

## セットアップ
```bash
npm install
```

## コマンド

### fetch（オンライン時にHOKUTO記事を保存）
```bash
node src/cli.mjs fetch \
  --url "https://hokuto.app/regimen/Qe9X2zNRHUrBc42gdxsw" \
  --html-output "./in/hokuto-page.html" \
  --images-dir "./in/images"
```

- `--html-output`: HTML本体を保存
- `--images-dir`: `__NEXT_DATA__` の画像URLを抽出して保存（OCR入力用）

### extract-html
```bash
node src/cli.mjs extract-html \
  --input "D:/hokuto-pages" \
  --output "./out/html-package.json" \
  --department "消化器内科"
```

### extract-ocr
```bash
node src/cli.mjs extract-ocr \
  --input "D:/hokuto-images" \
  --output "./out/ocr-package.json" \
  --regimen-name "FOLFOXIRI＋Bmab" \
  --department "消化器内科" \
  --threshold 170 \
  --contrast 0.45 \
  --scale 1.6 \
  --psm 6
```

### merge
```bash
node src/cli.mjs merge \
  --input "./out" \
  --output "./out/merged-package.json"
```

### push
```bash
node src/cli.mjs push \
  --input "./out/merged-package.json" \
  --api "http://localhost:3001/api/regimen-check/decision-support/import-package" \
  --token "YOUR_JWT_TOKEN"
```

## 3. バッチ実行
抽出から送信までを1コマンドで実行します。

```bash
node src/cli.mjs batch \
  --html-input "D:/hokuto-pages" \
  --ocr-input "D:/hokuto-images" \
  --regimen-name "FOLFOXIRI＋Bmab" \
  --department "消化器内科" \
  --output "./out/batch-package.json" \
  --api "http://localhost:3001/api/regimen-check/decision-support/import-package" \
  --token "YOUR_JWT_TOKEN"
```

## 推奨運用フロー（院内オフライン想定）
1. オンライン端末で `fetch` 実行（HTML + 画像を保存）
2. 保存したファイルを院内へ持ち込み
3. 院内端末で `extract-html` / `extract-ocr` / `merge`
4. `push` で `chemoapp` の `decision-support/import-package` に投入

## 出力形式
`chemoapp/docs/hokuto-decision-package.md` の `records` 形式に準拠します。

## 注意
- OCRは誤認識があるため、出力JSON確認・修正を前提にしてください。
- HOKUTOのページ構造変更時は抽出ロジック更新が必要です。
