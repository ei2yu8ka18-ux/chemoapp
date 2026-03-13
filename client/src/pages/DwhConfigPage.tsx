import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AppBar,
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  Paper,
  Snackbar,
  Switch,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import { SettingsEthernet } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

type DwhDatasetConfig = {
  id: number;
  dataset_key: string;
  dataset_name: string;
  description: string | null;
  query_template: string;
  required_params: string[];
  is_enabled: boolean;
  sort_order: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type DwhDatasetDefinition = {
  dataset_key: string;
  dataset_name: string;
  description: string;
  required_params: string[];
  sort_order: number;
};

type DwhConfigResponse = {
  configs: DwhDatasetConfig[];
  definitions: DwhDatasetDefinition[];
};

type DwhTestResponse = {
  ok: boolean;
  dataset_key: string;
  query_source: string;
  required_params: string[];
  bound_params: Array<string | number>;
  row_count: number;
  sample: Record<string, unknown>[];
};

type RowState = DwhDatasetConfig & {
  required_params_text: string;
  test_date: string;
  saving: boolean;
  testing: boolean;
  test_result: DwhTestResponse | null;
  test_error: string | null;
};

const ALIAS_HINTS: Record<string, string> = {
  blood_results: 'patient_no, wbc, hgb, plt, anc, mono, cre, egfr, ast, alt, tbil, crp, ca, mg, up, upcr',
  urgent_prescriptions: 'patient_no, prescription_type, prescription_info',
  guidance_orders: 'patient_id, order_no, order_date, patient_name, patient_no, drug_code_sc, drug_code, drug_name, note1, note2, inject_time',
};

function todayIsoDate(): string {
  return new Date().toISOString().split('T')[0];
}

function normalizeRequiredParams(text: string): string[] {
  const seen = new Set<string>();
  const items = text
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const result: string[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}

function toRowState(config: DwhDatasetConfig): RowState {
  return {
    ...config,
    required_params_text: (config.required_params || []).join(', '),
    test_date: todayIsoDate(),
    saving: false,
    testing: false,
    test_result: null,
    test_error: null,
  };
}

export default function DwhConfigPage() {
  const { user, logout } = useAuth();
  const [rows, setRows] = useState<RowState[]>([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    severity: 'success' | 'error';
    message: string;
  }>({ open: false, severity: 'success', message: '' });

  const rowsByKey = useMemo(
    () => new Map(rows.map((row) => [row.dataset_key, row])),
    [rows],
  );

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<DwhConfigResponse>('/dwh-sync/configs');
      const configs = [...data.configs].sort((a, b) => a.sort_order - b.sort_order);
      const baseRows = configs.map(toRowState);

      const missingFromConfig = data.definitions
        .filter((def) => !configs.some((cfg) => cfg.dataset_key === def.dataset_key))
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((def, idx) => {
          const id = -1 * (idx + 1);
          return toRowState({
            id,
            dataset_key: def.dataset_key,
            dataset_name: def.dataset_name,
            description: def.description ?? null,
            query_template: '',
            required_params: def.required_params || [],
            is_enabled: true,
            sort_order: def.sort_order,
            updated_by: null,
            created_at: '',
            updated_at: '',
          });
        });

      setRows([...baseRows, ...missingFromConfig]);
    } catch (err) {
      const message = String((err as Error)?.message || err || 'failed to load');
      setSnackbar({ open: true, severity: 'error', message: `読み込み失敗: ${message}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConfigs();
  }, []);

  const patchRow = (datasetKey: string, patch: Partial<RowState>) => {
    setRows((prev) => prev.map((row) => (
      row.dataset_key === datasetKey ? { ...row, ...patch } : row
    )));
  };

  const saveRow = async (datasetKey: string) => {
    const row = rowsByKey.get(datasetKey);
    if (!row) return;

    patchRow(datasetKey, { saving: true });
    try {
      const payload = {
        dataset_name: row.dataset_name.trim(),
        description: row.description?.trim() || null,
        query_template: row.query_template,
        required_params: normalizeRequiredParams(row.required_params_text),
        is_enabled: row.is_enabled,
        sort_order: Number.isFinite(row.sort_order) ? row.sort_order : 0,
      };

      const { data } = await api.put<{ ok: boolean; config: DwhDatasetConfig }>(
        `/dwh-sync/configs/${datasetKey}`,
        payload,
      );

      patchRow(datasetKey, {
        ...toRowState(data.config),
        test_date: row.test_date,
        test_result: row.test_result,
        test_error: row.test_error,
      });
      setSnackbar({ open: true, severity: 'success', message: `${datasetKey} を保存しました` });
    } catch (err) {
      const message = String((err as Error)?.message || err || 'save failed');
      patchRow(datasetKey, { test_error: message });
      setSnackbar({ open: true, severity: 'error', message: `${datasetKey} 保存失敗: ${message}` });
    } finally {
      patchRow(datasetKey, { saving: false });
    }
  };

  const testRow = async (datasetKey: string) => {
    const row = rowsByKey.get(datasetKey);
    if (!row) return;

    patchRow(datasetKey, { testing: true, test_error: null });
    try {
      const { data } = await api.post<DwhTestResponse>(
        `/dwh-sync/configs/${datasetKey}/test`,
        {},
        { params: { date: row.test_date } },
      );
      patchRow(datasetKey, { test_result: data, test_error: null });
      setSnackbar({ open: true, severity: 'success', message: `${datasetKey} テスト成功` });
    } catch (err) {
      const message = String((err as Error)?.message || err || 'test failed');
      patchRow(datasetKey, { test_result: null, test_error: message });
      setSnackbar({ open: true, severity: 'error', message: `${datasetKey} テスト失敗: ${message}` });
    } finally {
      patchRow(datasetKey, { testing: false });
    }
  };

  return (
    <>
      <AppBar position="static" sx={{ bgcolor: '#1a5276' }}>
        <Toolbar sx={{ gap: 1.5, minHeight: 44 }}>
          <SettingsEthernet sx={{ fontSize: '1.1rem' }} />
          <Typography fontWeight="bold" sx={{ fontSize: '0.9rem' }}>
            DWHマスタ設定
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>{user?.displayName}</Typography>
          <Button color="inherit" size="small" onClick={logout} sx={{ fontSize: '0.72rem' }}>ログアウト</Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ p: 1.5 }}>
        <Paper sx={{ p: 1.5, mb: 1.5 }}>
          <Typography sx={{ fontSize: '0.9rem', fontWeight: 'bold', mb: 0.5 }}>
            クエリ編集
          </Typography>
          <Typography sx={{ fontSize: '0.78rem', color: '#666' }}>
            各データセットのSQLを保存して、画面から接続テストできます。`?` の順で required params がバインドされます。
          </Typography>
        </Paper>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            {rows.map((row) => (
              <Paper key={row.dataset_key} sx={{ p: 1.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Box>
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 'bold' }}>
                      {row.dataset_key}
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: '#777' }}>
                      必須エイリアス: {ALIAS_HINTS[row.dataset_key] || '-'}
                    </Typography>
                  </Box>
                  <FormControlLabel
                    control={(
                      <Switch
                        checked={row.is_enabled}
                        onChange={(e) => patchRow(row.dataset_key, { is_enabled: e.target.checked })}
                        size="small"
                      />
                    )}
                    label={<Typography sx={{ fontSize: '0.78rem' }}>有効</Typography>}
                  />
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 1 }}>
                  <TextField
                    size="small"
                    label="表示名"
                    value={row.dataset_name}
                    onChange={(e) => patchRow(row.dataset_key, { dataset_name: e.target.value })}
                  />
                  <TextField
                    size="small"
                    type="number"
                    label="表示順"
                    value={row.sort_order}
                    onChange={(e) => patchRow(row.dataset_key, { sort_order: Number(e.target.value) })}
                  />
                </Box>

                <TextField
                  size="small"
                  sx={{ mt: 1, width: '100%' }}
                  label="説明"
                  value={row.description ?? ''}
                  onChange={(e) => patchRow(row.dataset_key, { description: e.target.value })}
                />

                <TextField
                  size="small"
                  sx={{ mt: 1, width: '100%' }}
                  label="required_params (comma separated)"
                  value={row.required_params_text}
                  onChange={(e) => patchRow(row.dataset_key, { required_params_text: e.target.value })}
                />

                <TextField
                  size="small"
                  multiline
                  minRows={8}
                  sx={{ mt: 1, width: '100%' }}
                  label="query_template"
                  value={row.query_template}
                  onChange={(e) => patchRow(row.dataset_key, { query_template: e.target.value })}
                  InputProps={{ sx: { fontFamily: 'Consolas, monospace', fontSize: '0.8rem' } }}
                />

                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1 }}>
                  <Button
                    variant="contained"
                    size="small"
                    disabled={row.saving}
                    onClick={() => { void saveRow(row.dataset_key); }}
                  >
                    {row.saving ? '保存中...' : '保存'}
                  </Button>

                  <TextField
                    size="small"
                    type="date"
                    label="テスト日"
                    value={row.test_date}
                    onChange={(e) => patchRow(row.dataset_key, { test_date: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                    sx={{ width: 150 }}
                  />

                  <Button
                    variant="outlined"
                    size="small"
                    disabled={row.testing}
                    onClick={() => { void testRow(row.dataset_key); }}
                  >
                    {row.testing ? 'テスト中...' : 'テスト実行'}
                  </Button>
                </Box>

                {row.test_error && (
                  <Alert severity="error" sx={{ mt: 1 }}>
                    {row.test_error}
                  </Alert>
                )}

                {row.test_result && (
                  <Paper variant="outlined" sx={{ mt: 1, p: 1, bgcolor: '#fafafa' }}>
                    <Typography sx={{ fontSize: '0.78rem', mb: 0.5 }}>
                      rows: {row.test_result.row_count} / source: {row.test_result.query_source}
                    </Typography>
                    <Box
                      component="pre"
                      sx={{
                        m: 0,
                        whiteSpace: 'pre-wrap',
                        fontSize: '0.73rem',
                        lineHeight: 1.4,
                        fontFamily: 'Consolas, monospace',
                      }}
                    >
                      {JSON.stringify(row.test_result.sample, null, 2)}
                    </Box>
                  </Paper>
                )}
              </Paper>
            ))}
          </Box>
        )}
      </Box>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3500}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}
