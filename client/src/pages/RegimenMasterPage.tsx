import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Stack,
  Button,
  TextField,
  Alert,
  CircularProgress,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  UploadFile,
  Link as LinkIcon,
  Delete,
  Edit,
  Visibility,
  Refresh,
  Analytics,
  LibraryBooks,
  Settings,
} from '@mui/icons-material';
import api from '../services/api';

const API = '/regimen-check';

interface GuidelineSourceSummary {
  id: number;
  department?: string | null;
  regimen_name: string;
  regimen_key: string;
  source_file: string | null;
  source_title?: string | null;
  imported_at?: string | null;
}

interface GuidelineSourceDetail extends GuidelineSourceSummary {
  markdown_content: string;
}

interface EditState {
  id: number;
  department: string;
  regimenName: string;
  sourceTitle: string;
  markdownContent: string;
}

interface DecisionCriteriaItem {
  id?: number;
  metric_key: string;
  comparator: string;
  threshold_value: number;
  threshold_unit: string | null;
  criterion_text: string;
  section_type?: string | null;
  source_section?: string | null;
}

interface DecisionDoseLevelItem {
  id?: number;
  drug_name: string;
  level_index: number;
  level_label: string;
  dose_text: string;
  dose_unit?: string | null;
  per_basis?: string | null;
  is_discontinue?: boolean;
  section_type?: string | null;
  source_section?: string | null;
}

interface DecisionToxicityActionItem {
  id?: number;
  toxicity_name: string;
  condition_text: string;
  action_text: string;
  level_delta?: number;
  hold_flag?: boolean;
  discontinue_flag?: boolean;
  priority?: number;
  section_type?: string | null;
  source_section?: string | null;
}

interface DecisionSupportEditorState {
  sourceId: number;
  regimenName: string;
  criteria: DecisionCriteriaItem[];
  doseLevels: DecisionDoseLevelItem[];
  toxicityActions: DecisionToxicityActionItem[];
}

const fmtDateTime = (value: string | null | undefined) => {
  if (!value) return '-';
  return value.slice(0, 16).replace('T', ' ');
};

const basename = (value: string | null | undefined) => {
  if (!value) return '';
  const parts = value.split(/[\\/]/);
  return parts[parts.length - 1] || value;
};

const isUrl = (value: string | null | undefined) => /^https?:\/\//i.test(value ?? '');

const looksLikeHtml = (value: string) => /<\s*(html|body|table|div|section|article|h1|p)\b/i.test(value);

export default function RegimenMasterPage() {
  const [sources, setSources] = useState<GuidelineSourceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const [regimenNameInput, setRegimenNameInput] = useState('');
  const [departmentInput, setDepartmentInput] = useState('');
  const [importUrl, setImportUrl] = useState('');

  const [preview, setPreview] = useState<GuidelineSourceDetail | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [convertingSourceId, setConvertingSourceId] = useState<number | null>(null);
  const [decisionEdit, setDecisionEdit] = useState<DecisionSupportEditorState | null>(null);
  const [savingDecisionEdit, setSavingDecisionEdit] = useState(false);

  const loadSources = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<GuidelineSourceSummary[]>(`${API}/guideline-sources`);
      setSources(response.data ?? []);
    } catch (e: any) {
      setError(e?.response?.data?.error || '取り込み済みデータの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  const grouped = useMemo(() => {
    const map = new Map<string, { regimenName: string; items: GuidelineSourceSummary[] }>();
    for (const row of sources) {
      const key = row.regimen_key || row.regimen_name;
      const existing = map.get(key);
      if (existing) {
        existing.items.push(row);
        if (row.regimen_name.length > existing.regimenName.length) {
          existing.regimenName = row.regimen_name;
        }
      } else {
        map.set(key, { regimenName: row.regimen_name, items: [row] });
      }
    }
    return Array.from(map.entries())
      .map(([key, value]) => ({
        regimenKey: key,
        regimenName: value.regimenName,
        items: value.items.sort((a, b) => (b.imported_at || '').localeCompare(a.imported_at || '')),
      }))
      .sort((a, b) => a.regimenName.localeCompare(b.regimenName, 'ja'));
  }, [sources]);

  const handleImportFile = async (file: File) => {
    setInfo('');
    setError('');
    setImporting(true);
    try {
      const content = await file.text();
      const fallbackName = file.name.replace(/\.[^.]+$/, '');
      const regimenName = regimenNameInput.trim() || fallbackName;
      await api.post(`${API}/guideline-sources/import-text`, {
        department: departmentInput.trim(),
        regimenName,
        sourceName: file.name,
        content,
      });
      setInfo(`取り込み完了: ${file.name}`);
      await loadSources();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'ファイル取り込みに失敗しました');
    } finally {
      setImporting(false);
    }
  };

  const handleImportUrl = async () => {
    const url = importUrl.trim();
    if (!url) return;
    setInfo('');
    setError('');
    setImporting(true);
    try {
      const map = regimenNameInput.trim() ? { [url]: regimenNameInput.trim() } : {};
      await api.post(`${API}/guideline-rules/import`, {
        filePaths: [url],
        regimenNameMap: map,
      });
      setInfo('URL取り込みが完了しました');
      await loadSources();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'URL取り込みに失敗しました');
    } finally {
      setImporting(false);
    }
  };

  const handleImportDecisionPackageFile = async (file: File) => {
    setInfo('');
    setError('');
    setImporting(true);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const response = await api.post(`${API}/decision-support/import-package`, payload);
      const data = response.data || {};
      setInfo(
        `構造化JSON取り込み完了: ソース ${data.importedSources ?? 0}件 / 適格基準 ${data.importedCriteria ?? 0}件 / 用量レベル ${data.importedDoseLevels ?? 0}件 / 有害事象 ${data.importedToxicityActions ?? 0}件`
      );
      await loadSources();
    } catch (e: any) {
      if (e instanceof SyntaxError) {
        setError('JSONの形式が不正です');
      } else {
        setError(e?.response?.data?.error || '構造化JSON取り込みに失敗しました');
      }
    } finally {
      setImporting(false);
    }
  };

  const handleClearAll = async () => {
    const ok = window.confirm('取り込み済みガイドラインをすべて削除します。よろしいですか？');
    if (!ok) return;
    setInfo('');
    setError('');
    setImporting(true);
    try {
      await api.post(`${API}/guideline-sources/clear`);
      setInfo('ガイドラインマスタを初期化しました');
      await loadSources();
    } catch (e: any) {
      setError(e?.response?.data?.error || '初期化に失敗しました');
    } finally {
      setImporting(false);
    }
  };

  const openPreview = async (id: number) => {
    setError('');
    try {
      const response = await api.get<GuidelineSourceDetail>(`${API}/guideline-sources/${id}`);
      setPreview(response.data);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'プレビュー読込に失敗しました');
    }
  };

  const openEdit = async (id: number) => {
    setError('');
    try {
      const response = await api.get<GuidelineSourceDetail>(`${API}/guideline-sources/${id}`);
      const row = response.data;
      setEdit({
        id: row.id,
        department: row.department || '',
        regimenName: row.regimen_name,
        sourceTitle: row.source_title || '',
        markdownContent: row.markdown_content || '',
      });
    } catch (e: any) {
      setError(e?.response?.data?.error || '編集データの読込に失敗しました');
    }
  };

  const handleSaveEdit = async () => {
    if (!edit) return;
    if (!edit.regimenName.trim()) {
      setError('レジメン名は必須です');
      return;
    }
    setSavingEdit(true);
    setError('');
    setInfo('');
    try {
      await api.patch(`${API}/guideline-sources/${edit.id}`, {
        department: edit.department.trim(),
        regimenName: edit.regimenName.trim(),
        sourceTitle: edit.sourceTitle.trim(),
        markdownContent: edit.markdownContent,
      });
      setEdit(null);
      setInfo('更新しました');
      await loadSources();
    } catch (e: any) {
      setError(e?.response?.data?.error || '更新に失敗しました');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteSource = async (id: number) => {
    const ok = window.confirm('このソースを削除しますか？');
    if (!ok) return;
    setInfo('');
    setError('');
    try {
      await api.delete(`${API}/guideline-sources/${id}`);
      setInfo('削除しました');
      await loadSources();
    } catch (e: any) {
      setError(e?.response?.data?.error || '削除に失敗しました');
    }
  };

  const handleBuildDecisionSupport = async (id: number) => {
    setInfo('');
    setError('');
    setConvertingSourceId(id);
    try {
      const response = await api.post(`${API}/decision-support/import-from-source/${id}`);
      const counts = response.data?.counts || {};
      setInfo(
        `DB化完了: 適格基準 ${counts.criteria ?? 0}件 / 用量レベル ${counts.doseLevels ?? 0}件 / 有害事象 ${counts.toxicityActions ?? 0}件`
      );
      await loadSources();
    } catch (e: any) {
      setError(e?.response?.data?.error || '構造化ルールのDB化に失敗しました');
    } finally {
      setConvertingSourceId(null);
    }
  };

  const openDecisionEdit = async (item: GuidelineSourceSummary) => {
    setError('');
    try {
      const response = await api.get<{
        sourceId: number | null;
        criteria: DecisionCriteriaItem[];
        doseLevels: DecisionDoseLevelItem[];
        toxicityActions: DecisionToxicityActionItem[];
      }>(`${API}/decision-support/${encodeURIComponent(item.regimen_key || item.regimen_name)}`, {
        params: { sourceId: item.id },
      });

      setDecisionEdit({
        sourceId: item.id,
        regimenName: item.regimen_name,
        criteria: (response.data.criteria || []).map((row) => ({
          ...row,
          comparator: row.comparator || '>=',
          threshold_value: Number(row.threshold_value ?? 0),
        })),
        doseLevels: (response.data.doseLevels || []).map((row) => ({
          ...row,
          level_index: Number(row.level_index ?? 0),
          is_discontinue: Boolean(row.is_discontinue),
        })),
        toxicityActions: (response.data.toxicityActions || []).map((row) => ({
          ...row,
          level_delta: Number(row.level_delta ?? 0),
          hold_flag: Boolean(row.hold_flag),
          discontinue_flag: Boolean(row.discontinue_flag),
          priority: Number(row.priority ?? 100),
        })),
      });
    } catch (e: any) {
      setError(e?.response?.data?.error || '構造化データの取得に失敗しました');
    }
  };

  const handleSaveDecisionEdit = async () => {
    if (!decisionEdit) return;
    setSavingDecisionEdit(true);
    setError('');
    setInfo('');
    try {
      await api.put(`${API}/decision-support/source/${decisionEdit.sourceId}`, {
        criteria: decisionEdit.criteria.map((row) => ({
          ...row,
          threshold_value: Number(row.threshold_value ?? 0),
          comparator: row.comparator || '>=',
          section_type: row.section_type || 'start_criteria',
        })),
        doseLevels: decisionEdit.doseLevels.map((row) => ({
          ...row,
          level_index: Number(row.level_index ?? 0),
          section_type: row.section_type || 'dose_level',
        })),
        toxicityActions: decisionEdit.toxicityActions.map((row) => ({
          ...row,
          level_delta: Number(row.level_delta ?? 0),
          priority: Number(row.priority ?? 100),
          section_type: row.section_type || 'adverse_event',
        })),
      });
      setInfo('DB化データを更新しました');
      setDecisionEdit(null);
      await loadSources();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'DB化データの更新に失敗しました');
    } finally {
      setSavingDecisionEdit(false);
    }
  };

  return (
    <Box sx={{ p: 2, maxWidth: 1280, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <LibraryBooks sx={{ color: '#1565c0' }} />
        <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
          レジメンマスタ（ガイドライン取り込み管理）
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Tooltip title="再読込">
          <IconButton onClick={() => void loadSources()}>
            <Refresh />
          </IconButton>
        </Tooltip>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {info && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setInfo('')}>
          {info}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography sx={{ fontSize: '0.95rem', fontWeight: 'bold', mb: 1 }}>
          取り込み
        </Typography>
        <Stack spacing={1}>
          <TextField
            size="small"
            label="診療科（任意）"
            value={departmentInput}
            onChange={(e) => setDepartmentInput(e.target.value)}
          />
          <TextField
            size="small"
            label="レジメン名（空欄ならファイル名から推定）"
            value={regimenNameInput}
            onChange={(e) => setRegimenNameInput(e.target.value)}
          />
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
            <Button
              variant="contained"
              startIcon={<UploadFile />}
              component="label"
              disabled={importing}
              sx={{ whiteSpace: 'nowrap' }}
            >
              ファイル取り込み
              <input
                hidden
                type="file"
                accept=".md,.txt,.html,.htm"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) await handleImportFile(file);
                  e.currentTarget.value = '';
                }}
              />
            </Button>
            <Button
              variant="outlined"
              startIcon={<UploadFile />}
              component="label"
              disabled={importing}
              sx={{ whiteSpace: 'nowrap' }}
            >
              構造化JSON取り込み
              <input
                hidden
                type="file"
                accept=".json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) await handleImportDecisionPackageFile(file);
                  e.currentTarget.value = '';
                }}
              />
            </Button>
            <TextField
              size="small"
              fullWidth
              label="URL取り込み（ネット接続時のみ）"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
            />
            <Button
              variant="outlined"
              startIcon={<LinkIcon />}
              disabled={importing || !importUrl.trim()}
              onClick={() => void handleImportUrl()}
              sx={{ whiteSpace: 'nowrap' }}
            >
              URL取り込み
            </Button>
            <Button
              variant="outlined"
              color="error"
              disabled={importing}
              onClick={() => void handleClearAll()}
              sx={{ whiteSpace: 'nowrap' }}
            >
              全削除
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {loading ? (
        <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      ) : grouped.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography sx={{ color: '#607d8b' }}>取り込み済みデータはありません</Typography>
        </Paper>
      ) : (
        <Stack spacing={2}>
          {grouped.map((group) => (
            <Paper key={group.regimenKey} variant="outlined" sx={{ overflow: 'hidden' }}>
              <Box sx={{ px: 1.5, py: 0.9, bgcolor: '#f4f7fb', borderBottom: '1px solid #dfe6ee' }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography sx={{ fontWeight: 'bold' }}>{group.regimenName}</Typography>
                  <Chip size="small" label={`${group.items.length} 件`} />
                </Stack>
              </Box>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: 120 }}>診療科</TableCell>
                      <TableCell sx={{ width: 280 }}>タイトル</TableCell>
                      <TableCell>ソース</TableCell>
                      <TableCell sx={{ width: 180 }}>取込日時</TableCell>
                      <TableCell sx={{ width: 210 }} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {group.items.map((item) => {
                      const title = item.source_title || basename(item.source_file) || item.regimen_name;
                      return (
                        <TableRow key={item.id} hover>
                          <TableCell>{item.department || '-'}</TableCell>
                          <TableCell>{title}</TableCell>
                          <TableCell sx={{ color: '#546e7a' }}>{item.source_file || '-'}</TableCell>
                          <TableCell>{fmtDateTime(item.imported_at)}</TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                              <Tooltip title="表示">
                                <IconButton size="small" onClick={() => void openPreview(item.id)}>
                                  <Visibility sx={{ fontSize: 18 }} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="編集">
                                <IconButton size="small" onClick={() => void openEdit(item.id)}>
                                  <Edit sx={{ fontSize: 18 }} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="DB化（適格基準/用量/有害事象）">
                                <span>
                                  <IconButton
                                    size="small"
                                    color="primary"
                                    disabled={convertingSourceId === item.id}
                                    onClick={() => void handleBuildDecisionSupport(item.id)}
                                  >
                                    <Analytics sx={{ fontSize: 18 }} />
                                  </IconButton>
                                </span>
                              </Tooltip>
                              <Tooltip title="DB化データ確認/編集">
                                <IconButton size="small" color="secondary" onClick={() => void openDecisionEdit(item)}>
                                  <Settings sx={{ fontSize: 18 }} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="削除">
                                <IconButton size="small" color="error" onClick={() => void handleDeleteSource(item.id)}>
                                  <Delete sx={{ fontSize: 18 }} />
                                </IconButton>
                              </Tooltip>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          ))}
        </Stack>
      )}

      <Dialog open={Boolean(preview)} onClose={() => setPreview(null)} maxWidth="lg" fullWidth>
        <DialogTitle>
          {preview ? `プレビュー: ${preview.regimen_name}` : 'プレビュー'}
        </DialogTitle>
        <DialogContent dividers>
          {!preview ? null : isUrl(preview.source_file) ? (
            <Box sx={{ height: '72vh' }}>
              <iframe
                title="guideline-preview-url"
                src={preview.source_file || ''}
                style={{ width: '100%', height: '100%', border: 'none' }}
              />
            </Box>
          ) : looksLikeHtml(preview.markdown_content) ? (
            <Box sx={{ height: '72vh' }}>
              <iframe
                title="guideline-preview-html"
                srcDoc={preview.markdown_content}
                style={{ width: '100%', height: '100%', border: 'none' }}
              />
            </Box>
          ) : (
            <Typography
              component="pre"
              sx={{
                m: 0,
                fontSize: '0.8rem',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              }}
            >
              {preview.markdown_content}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreview(null)}>閉じる</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(decisionEdit)} onClose={() => setDecisionEdit(null)} maxWidth="xl" fullWidth>
        <DialogTitle>
          {decisionEdit ? `DB化データ編集: ${decisionEdit.regimenName}` : 'DB化データ編集'}
        </DialogTitle>
        <DialogContent dividers>
          {!decisionEdit ? null : (
            <Stack spacing={2}>
              <Paper variant="outlined" sx={{ p: 1 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography sx={{ fontWeight: 'bold' }}>適格基準（開始基準）</Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setDecisionEdit((prev) => prev ? ({
                      ...prev,
                      criteria: [...prev.criteria, {
                        metric_key: 'anc',
                        comparator: '>=',
                        threshold_value: 1.5,
                        threshold_unit: 'x10^3/uL',
                        criterion_text: '',
                        section_type: 'start_criteria',
                        source_section: '',
                      }],
                    }) : prev)}
                  >
                    行追加
                  </Button>
                </Stack>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>項目</TableCell>
                      <TableCell>比較</TableCell>
                      <TableCell>閾値</TableCell>
                      <TableCell>単位</TableCell>
                      <TableCell>基準文</TableCell>
                      <TableCell sx={{ width: 80 }} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {decisionEdit.criteria.map((row, index) => (
                      <TableRow key={`criteria-${index}`}>
                        <TableCell>
                          <TextField size="small" value={row.metric_key} onChange={(e) => setDecisionEdit((prev) => {
                            if (!prev) return prev;
                            const next = [...prev.criteria];
                            next[index] = { ...next[index], metric_key: e.target.value };
                            return { ...prev, criteria: next };
                          })} />
                        </TableCell>
                        <TableCell>
                          <TextField size="small" value={row.comparator} onChange={(e) => setDecisionEdit((prev) => {
                            if (!prev) return prev;
                            const next = [...prev.criteria];
                            next[index] = { ...next[index], comparator: e.target.value };
                            return { ...prev, criteria: next };
                          })} />
                        </TableCell>
                        <TableCell>
                          <TextField size="small" type="number" value={row.threshold_value} onChange={(e) => setDecisionEdit((prev) => {
                            if (!prev) return prev;
                            const next = [...prev.criteria];
                            next[index] = { ...next[index], threshold_value: Number(e.target.value || 0) };
                            return { ...prev, criteria: next };
                          })} />
                        </TableCell>
                        <TableCell>
                          <TextField size="small" value={row.threshold_unit || ''} onChange={(e) => setDecisionEdit((prev) => {
                            if (!prev) return prev;
                            const next = [...prev.criteria];
                            next[index] = { ...next[index], threshold_unit: e.target.value };
                            return { ...prev, criteria: next };
                          })} />
                        </TableCell>
                        <TableCell>
                          <TextField size="small" fullWidth value={row.criterion_text} onChange={(e) => setDecisionEdit((prev) => {
                            if (!prev) return prev;
                            const next = [...prev.criteria];
                            next[index] = { ...next[index], criterion_text: e.target.value };
                            return { ...prev, criteria: next };
                          })} />
                        </TableCell>
                        <TableCell align="right">
                          <Button size="small" color="error" onClick={() => setDecisionEdit((prev) => {
                            if (!prev) return prev;
                            return { ...prev, criteria: prev.criteria.filter((_, i) => i !== index) };
                          })}>
                            削除
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Paper>

              <Paper variant="outlined" sx={{ p: 1 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography sx={{ fontWeight: 'bold' }}>用量レベル</Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setDecisionEdit((prev) => prev ? ({
                      ...prev,
                      doseLevels: [...prev.doseLevels, {
                        drug_name: '',
                        level_index: 0,
                        level_label: '通常量',
                        dose_text: '',
                        dose_unit: '',
                        per_basis: '',
                        is_discontinue: false,
                        section_type: 'dose_level',
                        source_section: '',
                      }],
                    }) : prev)}
                  >
                    行追加
                  </Button>
                </Stack>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>薬剤名</TableCell>
                      <TableCell>段階</TableCell>
                      <TableCell>ラベル</TableCell>
                      <TableCell>用量</TableCell>
                      <TableCell>中止</TableCell>
                      <TableCell sx={{ width: 80 }} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {decisionEdit.doseLevels.map((row, index) => (
                      <TableRow key={`dose-${index}`}>
                        <TableCell>
                          <TextField size="small" value={row.drug_name} onChange={(e) => setDecisionEdit((prev) => {
                            if (!prev) return prev;
                            const next = [...prev.doseLevels];
                            next[index] = { ...next[index], drug_name: e.target.value };
                            return { ...prev, doseLevels: next };
                          })} />
                        </TableCell>
                        <TableCell>
                          <TextField size="small" type="number" value={row.level_index} onChange={(e) => setDecisionEdit((prev) => {
                            if (!prev) return prev;
                            const next = [...prev.doseLevels];
                            next[index] = { ...next[index], level_index: Number(e.target.value || 0) };
                            return { ...prev, doseLevels: next };
                          })} />
                        </TableCell>
                        <TableCell>
                          <TextField size="small" value={row.level_label} onChange={(e) => setDecisionEdit((prev) => {
                            if (!prev) return prev;
                            const next = [...prev.doseLevels];
                            next[index] = { ...next[index], level_label: e.target.value };
                            return { ...prev, doseLevels: next };
                          })} />
                        </TableCell>
                        <TableCell>
                          <TextField size="small" fullWidth value={row.dose_text} onChange={(e) => setDecisionEdit((prev) => {
                            if (!prev) return prev;
                            const next = [...prev.doseLevels];
                            next[index] = { ...next[index], dose_text: e.target.value };
                            return { ...prev, doseLevels: next };
                          })} />
                        </TableCell>
                        <TableCell>
                          <Button size="small" variant={row.is_discontinue ? 'contained' : 'outlined'} onClick={() => setDecisionEdit((prev) => {
                            if (!prev) return prev;
                            const next = [...prev.doseLevels];
                            next[index] = { ...next[index], is_discontinue: !next[index].is_discontinue };
                            return { ...prev, doseLevels: next };
                          })}>
                            {row.is_discontinue ? '中止' : '継続'}
                          </Button>
                        </TableCell>
                        <TableCell align="right">
                          <Button size="small" color="error" onClick={() => setDecisionEdit((prev) => {
                            if (!prev) return prev;
                            return { ...prev, doseLevels: prev.doseLevels.filter((_, i) => i !== index) };
                          })}>
                            削除
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Paper>

              <Paper variant="outlined" sx={{ p: 1 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography sx={{ fontWeight: 'bold' }}>有害事象対応</Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setDecisionEdit((prev) => prev ? ({
                      ...prev,
                      toxicityActions: [...prev.toxicityActions, {
                        toxicity_name: '',
                        condition_text: '',
                        action_text: '',
                        level_delta: 0,
                        hold_flag: false,
                        discontinue_flag: false,
                        priority: 100,
                        section_type: 'adverse_event',
                        source_section: '',
                      }],
                    }) : prev)}
                  >
                    行追加
                  </Button>
                </Stack>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>有害事象</TableCell>
                      <TableCell>基準</TableCell>
                      <TableCell>処置</TableCell>
                      <TableCell>減量段階</TableCell>
                      <TableCell>休薬/中止</TableCell>
                      <TableCell sx={{ width: 80 }} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {decisionEdit.toxicityActions.map((row, index) => (
                      <TableRow key={`tox-${index}`}>
                        <TableCell>
                          <TextField size="small" value={row.toxicity_name} onChange={(e) => setDecisionEdit((prev) => {
                            if (!prev) return prev;
                            const next = [...prev.toxicityActions];
                            next[index] = { ...next[index], toxicity_name: e.target.value };
                            return { ...prev, toxicityActions: next };
                          })} />
                        </TableCell>
                        <TableCell>
                          <TextField size="small" fullWidth value={row.condition_text} onChange={(e) => setDecisionEdit((prev) => {
                            if (!prev) return prev;
                            const next = [...prev.toxicityActions];
                            next[index] = { ...next[index], condition_text: e.target.value };
                            return { ...prev, toxicityActions: next };
                          })} />
                        </TableCell>
                        <TableCell>
                          <TextField size="small" fullWidth value={row.action_text} onChange={(e) => setDecisionEdit((prev) => {
                            if (!prev) return prev;
                            const next = [...prev.toxicityActions];
                            next[index] = { ...next[index], action_text: e.target.value };
                            return { ...prev, toxicityActions: next };
                          })} />
                        </TableCell>
                        <TableCell>
                          <TextField size="small" type="number" value={row.level_delta ?? 0} onChange={(e) => setDecisionEdit((prev) => {
                            if (!prev) return prev;
                            const next = [...prev.toxicityActions];
                            next[index] = { ...next[index], level_delta: Number(e.target.value || 0) };
                            return { ...prev, toxicityActions: next };
                          })} />
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5}>
                            <Button size="small" variant={row.hold_flag ? 'contained' : 'outlined'} onClick={() => setDecisionEdit((prev) => {
                              if (!prev) return prev;
                              const next = [...prev.toxicityActions];
                              next[index] = { ...next[index], hold_flag: !next[index].hold_flag };
                              return { ...prev, toxicityActions: next };
                            })}>休薬</Button>
                            <Button size="small" color="error" variant={row.discontinue_flag ? 'contained' : 'outlined'} onClick={() => setDecisionEdit((prev) => {
                              if (!prev) return prev;
                              const next = [...prev.toxicityActions];
                              next[index] = { ...next[index], discontinue_flag: !next[index].discontinue_flag };
                              return { ...prev, toxicityActions: next };
                            })}>中止</Button>
                          </Stack>
                        </TableCell>
                        <TableCell align="right">
                          <Button size="small" color="error" onClick={() => setDecisionEdit((prev) => {
                            if (!prev) return prev;
                            return { ...prev, toxicityActions: prev.toxicityActions.filter((_, i) => i !== index) };
                          })}>
                            削除
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Paper>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDecisionEdit(null)} disabled={savingDecisionEdit}>キャンセル</Button>
          <Button variant="contained" onClick={() => void handleSaveDecisionEdit()} disabled={savingDecisionEdit || !decisionEdit}>
            保存
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(edit)} onClose={() => setEdit(null)} maxWidth="lg" fullWidth>
        <DialogTitle>ガイドライン編集</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.2} sx={{ mt: 0.5 }}>
            <TextField
              size="small"
              label="診療科"
              value={edit?.department || ''}
              onChange={(e) => setEdit((prev) => (prev ? { ...prev, department: e.target.value } : prev))}
            />
            <TextField
              size="small"
              label="レジメン名"
              value={edit?.regimenName || ''}
              onChange={(e) => setEdit((prev) => (prev ? { ...prev, regimenName: e.target.value } : prev))}
            />
            <TextField
              size="small"
              label="タイトル"
              value={edit?.sourceTitle || ''}
              onChange={(e) => setEdit((prev) => (prev ? { ...prev, sourceTitle: e.target.value } : prev))}
            />
            <TextField
              label="内容"
              multiline
              minRows={16}
              value={edit?.markdownContent || ''}
              onChange={(e) => setEdit((prev) => (prev ? { ...prev, markdownContent: e.target.value } : prev))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEdit(null)} disabled={savingEdit}>キャンセル</Button>
          <Button variant="contained" onClick={() => void handleSaveEdit()} disabled={savingEdit || !edit}>
            保存
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
