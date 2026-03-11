# Standalone Repo Setup

`hokuto-extractor-app` を別リポジトリへ切り出す手順です。

## 1. エクスポート
```powershell
cd C:\Dev\chemoapp
.\tools\hokuto-extractor-app\scripts\export-standalone.ps1 -TargetPath C:\Dev\hokuto-extractor-app -Force
```

## 2. Git初期化（任意）
```powershell
.\tools\hokuto-extractor-app\scripts\export-standalone.ps1 -TargetPath C:\Dev\hokuto-extractor-app -Force -InitGit
```

## 3. 動作確認
```powershell
cd C:\Dev\hokuto-extractor-app
npm install
node src/cli.mjs --help
```

## 4. リモート作成後
```powershell
git remote add origin <your-repo-url>
git push -u origin main
```
