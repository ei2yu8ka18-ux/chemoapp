# DWH Config Samples

This folder contains sample payloads for:

- `blood_results`
- `urgent_prescriptions`
- `guidance_orders`

## 1) Edit sample JSON files

Replace view/table names and column names in:

- `blood_results.sample.json`
- `urgent_prescriptions.sample.json`
- `guidance_orders.sample.json`

Keep output aliases exactly as defined by the app.

## 2) Apply configs

```powershell
cd C:\Dev\chemoapp\tools\dwh-config
.\apply-dwh-config.ps1 -BaseUrl "http://localhost:3001" -JwtToken "<ADMIN_JWT>"
```

## 3) Test each config

```powershell
$headers = @{ Authorization = "Bearer <ADMIN_JWT>" }

Invoke-RestMethod -Method Post -Uri "http://localhost:3001/api/dwh-sync/configs/blood_results/test?date=2026-03-13" -Headers $headers
Invoke-RestMethod -Method Post -Uri "http://localhost:3001/api/dwh-sync/configs/urgent_prescriptions/test?date=2026-03-13" -Headers $headers
Invoke-RestMethod -Method Post -Uri "http://localhost:3001/api/dwh-sync/configs/guidance_orders/test?date=2026-03-13" -Headers $headers
```

## Required output aliases

### blood_results

`patient_no, wbc, hgb, plt, anc, mono, cre, egfr, ast, alt, tbil, crp, ca, mg, up, upcr`

### urgent_prescriptions

`patient_no, prescription_type, prescription_info`

### guidance_orders

`patient_id, order_no, order_date, patient_name, patient_no, drug_code_sc, drug_code, drug_name, note1, note2, inject_time`
