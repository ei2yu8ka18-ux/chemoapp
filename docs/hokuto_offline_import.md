# HOKUTO記事のオフライン取り込み手順

## 1. 外部接続PCで記事を保存

```bash
npm run capture:hokuto -- --url "https://hokuto.app/regimen/Qe9X2zNRHUrBc42gdxsw" --out ".\\exports\\Qe9X2zNRHUrBc42gdxsw.html"
```

- `playwright` が入っていれば描画後HTML（表を含む）を保存します。
- 未導入時はraw HTML保存になります。

## 2. 院内サーバー側で取り込み

- レジメン監査画面の右上「監査根拠」パネルを最大化
- 管理者ユーザーで「ファイル取り込み」ボタンを押す
- 保存した `.html` / `.md` / `.txt` を選択
- 必要なら「レジメン名（任意）」を入力

## 3. レジメンマスタを使わない運用

- 管理者ユーザーで「レジメンマスタクリア」ボタンを実行可能
- クリア後でも、取り込んだ根拠ファイルはレジメン監査右パネルで表示できます

