import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Button, TextField, Chip, Alert,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Dialog, DialogTitle, DialogContent, DialogActions, Stack,
  IconButton, Tooltip, Collapse, Switch, FormControlLabel,
  Divider, Select, MenuItem, FormControl, InputLabel, CircularProgress,
} from '@mui/material';
import {
  Add, Edit, Delete, ExpandMore, ExpandLess,
  MedicalServices, Save, Close,
} from '@mui/icons-material';
import api from '../services/api';

const API = '/regimen-check';

/* ─── 型定義 ────────────────────────────────────────────── */
interface RegimenMaster {
  id: number;
  regimen_name: string;
  category: string | null;
  cycle_days: number;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface RegimenDrug {
  id: number;
  regimen_id: number;
  sort_order: number;
  drug_name: string;
  drug_type: string;
  base_dose: number | null;
  dose_unit: string | null;
  dose_per: string;
  solvent_name: string | null;
  solvent_volume: number | null;
  route: string | null;
  drip_time: string | null;
  notes: string | null;
}

interface ToxicityRule {
  id: number;
  regimen_id: number;
  toxicity_item: string;
  grade1_action: string;
  grade2_action: string;
  grade3_action: string;
  grade4_action: string;
  notes: string | null;
}

/* ─── 薬剤タイプ定義 ─────────────────────────────────── */
const DRUG_TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  antineoplastic: { label: '抗腫瘍薬', color: '#b71c1c', bg: '#ffebee' },
  support:        { label: '支持療法', color: '#1565c0', bg: '#e3f2fd' },
  solvent:        { label: '溶媒',     color: '#555',    bg: '#f5f5f5' },
  hormone:        { label: 'ホルモン', color: '#6a1b9a', bg: '#f3e5f5' },
  immunotherapy:  { label: '免疫療法', color: '#00695c', bg: '#e0f2f1' },
};

const DOSE_PER_LABELS: Record<string, string> = {
  BSA:         'BSA (mg/m²)',
  body_weight: '体重 (mg/kg)',
  fixed:       '固定量',
};

/* ─── 薬剤フォームのデフォルト値 ──────────────────────── */
const emptyDrug = (): Partial<RegimenDrug> => ({
  sort_order: 1, drug_name: '', drug_type: 'antineoplastic',
  base_dose: undefined, dose_unit: '', dose_per: 'BSA',
  solvent_name: '', solvent_volume: undefined, route: '', drip_time: '', notes: '',
});

const emptyToxicity = (): Partial<ToxicityRule> => ({
  toxicity_item: '',
  grade1_action: '継続',
  grade2_action: '減量検討',
  grade3_action: '休薬または減量',
  grade4_action: '中止推奨',
  notes: '',
});

/* ─── コンポーネント ────────────────────────────────── */
export default function RegimenMasterPage() {
  const [masters, setMasters] = useState<RegimenMaster[]>([]);
  const [drugs, setDrugs] = useState<RegimenDrug[]>([]);
  const [toxicity, setToxicity] = useState<ToxicityRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // マスタ編集ダイアログ
  const [masterDialog, setMasterDialog] = useState<{ open: boolean; data: Partial<RegimenMaster> }>({ open: false, data: {} });
  const [masterSaving, setMasterSaving] = useState(false);

  // 薬剤編集ダイアログ
  const [drugDialog, setDrugDialog] = useState<{ open: boolean; regimenId: number; data: Partial<RegimenDrug>; editId?: number }>({
    open: false, regimenId: 0, data: emptyDrug(),
  });
  const [drugSaving, setDrugSaving] = useState(false);

  // 毒性ルール編集ダイアログ
  const [toxDialog, setToxDialog] = useState<{ open: boolean; regimenId: number; data: Partial<ToxicityRule>; editId?: number }>({
    open: false, regimenId: 0, data: emptyToxicity(),
  });
  const [toxSaving, setToxSaving] = useState(false);

  // 削除確認
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'master' | 'drug' | 'toxicity'; id: number } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await api.get<{ masters: RegimenMaster[]; drugs: RegimenDrug[]; toxicity: ToxicityRule[] }>(`${API}/regimen-master`);
      setMasters(r.data.masters);
      setDrugs(r.data.drugs);
      setToxicity(r.data.toxicity);
    } catch {
      setError('データ取得に失敗しました');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  /* ── マスタ保存 ── */
  const handleSaveMaster = async () => {
    const d = masterDialog.data;
    if (!d.regimen_name?.trim()) return;
    setMasterSaving(true);
    try {
      if (d.id) {
        await api.patch(`${API}/regimen-master/${d.id}`, d);
      } else {
        await api.post(`${API}/regimen-master`, d);
      }
      setMasterDialog({ open: false, data: {} });
      await loadData();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'マスタ保存に失敗しました');
    } finally { setMasterSaving(false); }
  };

  /* ── 薬剤保存 ── */
  const handleSaveDrug = async () => {
    const d = drugDialog.data;
    if (!d.drug_name?.trim()) return;
    setDrugSaving(true);
    try {
      if (drugDialog.editId) {
        await api.patch(`${API}/regimen-master/drugs/${drugDialog.editId}`, d);
      } else {
        await api.post(`${API}/regimen-master/${drugDialog.regimenId}/drugs`, d);
      }
      setDrugDialog(prev => ({ ...prev, open: false }));
      await loadData();
    } catch {
      setError('薬剤保存に失敗しました');
    } finally { setDrugSaving(false); }
  };

  /* ── 毒性ルール保存 ── */
  const handleSaveToxicity = async () => {
    const d = toxDialog.data;
    if (!d.toxicity_item?.trim()) return;
    setToxSaving(true);
    try {
      if (toxDialog.editId) {
        await api.patch(`${API}/regimen-master/toxicity/${toxDialog.editId}`, d);
      } else {
        await api.post(`${API}/regimen-master/${toxDialog.regimenId}/toxicity`, d);
      }
      setToxDialog(prev => ({ ...prev, open: false }));
      await loadData();
    } catch {
      setError('毒性ルール保存に失敗しました');
    } finally { setToxSaving(false); }
  };

  /* ── 削除 ── */
  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      if (deleteConfirm.type === 'master') await api.delete(`${API}/regimen-master/${deleteConfirm.id}`);
      else if (deleteConfirm.type === 'drug') await api.delete(`${API}/regimen-master/drugs/${deleteConfirm.id}`);
      else await api.delete(`${API}/regimen-master/toxicity/${deleteConfirm.id}`);
      setDeleteConfirm(null);
      await loadData();
    } catch { setError('削除に失敗しました'); }
  };

  /* ── カテゴリ一覧（既存から抽出） ── */
  const categories = [...new Set(masters.map(m => m.category).filter(Boolean) as string[])].sort();

  const gradeColor = (g: 1 | 2 | 3 | 4) => {
    if (g === 1) return { color: '#2e7d32', bg: '#f1f8e9' };
    if (g === 2) return { color: '#e65100', bg: '#fff8e1' };
    if (g === 3) return { color: '#c62828', bg: '#ffebee' };
    return { color: '#6a1b9a', bg: '#f3e5f5' };
  };

  return (
    <Box sx={{ p: 2, maxWidth: 1200, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <MedicalServices sx={{ color: '#1565c0', fontSize: 28 }} />
        <Typography variant="h6" sx={{ fontWeight: 'bold' }}>レジメンマスタ管理</Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Button variant="contained" startIcon={<Add />}
          onClick={() => setMasterDialog({ open: true, data: { cycle_days: 21, is_active: true } })}>
          新規レジメン追加
        </Button>
        <IconButton onClick={loadData} size="small"><MedicalServices sx={{ fontSize: 18 }} /></IconButton>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>}

      {!loading && masters.map(m => {
        const mDrugs = drugs.filter(d => d.regimen_id === m.id).sort((a, b) => a.sort_order - b.sort_order);
        const mTox = toxicity.filter(t => t.regimen_id === m.id).sort((a, b) => a.toxicity_item.localeCompare(b.toxicity_item));
        const isExpanded = expandedId === m.id;

        return (
          <Paper key={m.id} variant="outlined" sx={{ mb: 2, overflow: 'hidden' }}>
            {/* ── レジメンヘッダー ── */}
            <Box sx={{
              px: 2, py: 1, bgcolor: m.is_active ? '#1c2833' : '#78909c',
              display: 'flex', alignItems: 'center', gap: 1,
              cursor: 'pointer', userSelect: 'none',
            }}
              onClick={() => setExpandedId(isExpanded ? null : m.id)}>
              <Typography sx={{ fontWeight: 'bold', color: '#fff', fontSize: '0.92rem', flexGrow: 1 }}>
                {m.regimen_name}
              </Typography>
              {m.category && <Chip label={m.category} size="small" sx={{ bgcolor: '#455a64', color: '#fff', fontSize: '0.7rem', height: 20 }} />}
              <Chip label={`${m.cycle_days}日周期`} size="small" sx={{ bgcolor: '#37474f', color: '#cfd8dc', fontSize: '0.7rem', height: 20 }} />
              {!m.is_active && <Chip label="無効" size="small" sx={{ bgcolor: '#b0bec5', color: '#fff', fontSize: '0.7rem', height: 20 }} />}
              <Tooltip title="編集">
                <IconButton size="small" onClick={e => { e.stopPropagation(); setMasterDialog({ open: true, data: { ...m } }); }} sx={{ color: '#90caf9', p: 0.5 }}>
                  <Edit sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="削除">
                <IconButton size="small" onClick={e => { e.stopPropagation(); setDeleteConfirm({ type: 'master', id: m.id }); }} sx={{ color: '#ef9a9a', p: 0.5 }}>
                  <Delete sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
              {isExpanded ? <ExpandLess sx={{ color: '#aed6f1', fontSize: 20 }} /> : <ExpandMore sx={{ color: '#aed6f1', fontSize: 20 }} />}
            </Box>
            {m.description && (
              <Box sx={{ px: 2, py: 0.5, bgcolor: '#263238' }}>
                <Typography sx={{ fontSize: '0.75rem', color: '#b0bec5' }}>{m.description}</Typography>
              </Box>
            )}

            <Collapse in={isExpanded}>
              <Box sx={{ p: 2 }}>

                {/* ── 薬剤テーブル ── */}
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Typography sx={{ fontWeight: 'bold', fontSize: '0.82rem', color: '#b71c1c' }}>💊 薬剤構成</Typography>
                    <Box sx={{ flexGrow: 1 }} />
                    <Button size="small" variant="outlined" startIcon={<Add />}
                      sx={{ fontSize: '0.72rem', py: 0.2 }}
                      onClick={() => setDrugDialog({ open: true, regimenId: m.id, data: { ...emptyDrug(), sort_order: mDrugs.length + 1 } })}>
                      薬剤追加
                    </Button>
                  </Box>
                  {mDrugs.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">薬剤登録なし</Typography>
                  ) : (
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead sx={{ bgcolor: '#fce4e4' }}>
                          <TableRow>
                            <TableCell sx={{ fontSize: '0.7rem', py: 0.4, fontWeight: 'bold', width: 36 }}>順</TableCell>
                            <TableCell sx={{ fontSize: '0.7rem', py: 0.4, fontWeight: 'bold' }}>薬品名</TableCell>
                            <TableCell sx={{ fontSize: '0.7rem', py: 0.4, fontWeight: 'bold' }}>種別</TableCell>
                            <TableCell sx={{ fontSize: '0.7rem', py: 0.4, fontWeight: 'bold' }} align="right">用量</TableCell>
                            <TableCell sx={{ fontSize: '0.7rem', py: 0.4, fontWeight: 'bold' }}>単位/換算</TableCell>
                            <TableCell sx={{ fontSize: '0.7rem', py: 0.4, fontWeight: 'bold' }}>溶媒</TableCell>
                            <TableCell sx={{ fontSize: '0.7rem', py: 0.4, fontWeight: 'bold' }}>経路</TableCell>
                            <TableCell sx={{ fontSize: '0.7rem', py: 0.4, fontWeight: 'bold' }}>滴下時間</TableCell>
                            <TableCell sx={{ fontSize: '0.7rem', py: 0.4, fontWeight: 'bold' }}>備考</TableCell>
                            <TableCell sx={{ width: 60 }} />
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {mDrugs.map(d => {
                            const dt = DRUG_TYPE_LABELS[d.drug_type] || { label: d.drug_type, color: '#555', bg: '#f5f5f5' };
                            return (
                              <TableRow key={d.id} sx={{ bgcolor: dt.bg }}>
                                <TableCell sx={{ fontSize: '0.75rem', py: 0.3, textAlign: 'center' }}>{d.sort_order}</TableCell>
                                <TableCell sx={{ fontSize: '0.78rem', py: 0.3, fontWeight: d.drug_type === 'antineoplastic' ? 'bold' : 'normal', color: dt.color }}>
                                  {d.drug_name}
                                </TableCell>
                                <TableCell sx={{ py: 0.3 }}>
                                  <Chip label={dt.label} size="small"
                                    sx={{ fontSize: '0.62rem', height: 16, bgcolor: dt.bg, color: dt.color, border: `1px solid ${dt.color}` }} />
                                </TableCell>
                                <TableCell sx={{ fontSize: '0.75rem', py: 0.3 }} align="right">
                                  {d.base_dose ?? '—'}
                                </TableCell>
                                <TableCell sx={{ fontSize: '0.72rem', py: 0.3 }}>
                                  {d.dose_unit && <span>{d.dose_unit}</span>}
                                  {d.dose_per && <span style={{ color: '#888' }}> / {DOSE_PER_LABELS[d.dose_per] || d.dose_per}</span>}
                                </TableCell>
                                <TableCell sx={{ fontSize: '0.72rem', py: 0.3, color: '#555' }}>
                                  {d.solvent_name ? `${d.solvent_name}${d.solvent_volume ? ` ${d.solvent_volume}mL` : ''}` : '—'}
                                </TableCell>
                                <TableCell sx={{ fontSize: '0.72rem', py: 0.3 }}>{d.route || '—'}</TableCell>
                                <TableCell sx={{ fontSize: '0.72rem', py: 0.3 }}>{d.drip_time || '—'}</TableCell>
                                <TableCell sx={{ fontSize: '0.7rem', py: 0.3, color: '#777' }}>{d.notes || ''}</TableCell>
                                <TableCell sx={{ py: 0.2 }}>
                                  <Box sx={{ display: 'flex', gap: 0.3 }}>
                                    <IconButton size="small" sx={{ p: 0.3 }}
                                      onClick={() => setDrugDialog({ open: true, regimenId: m.id, data: { ...d }, editId: d.id })}>
                                      <Edit sx={{ fontSize: 14 }} />
                                    </IconButton>
                                    <IconButton size="small" sx={{ p: 0.3, color: '#c62828' }}
                                      onClick={() => setDeleteConfirm({ type: 'drug', id: d.id })}>
                                      <Delete sx={{ fontSize: 14 }} />
                                    </IconButton>
                                  </Box>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>

                <Divider sx={{ my: 1.5 }} />

                {/* ── 毒性ルールテーブル ── */}
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Typography sx={{ fontWeight: 'bold', fontSize: '0.82rem', color: '#6a1b9a' }}>⚠️ 毒性対処ルール（CTCAE）</Typography>
                    <Box sx={{ flexGrow: 1 }} />
                    <Button size="small" variant="outlined" startIcon={<Add />}
                      sx={{ fontSize: '0.72rem', py: 0.2 }}
                      onClick={() => setToxDialog({ open: true, regimenId: m.id, data: emptyToxicity() })}>
                      ルール追加
                    </Button>
                  </Box>
                  {mTox.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">毒性ルール登録なし</Typography>
                  ) : (
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead sx={{ bgcolor: '#f3e5f5' }}>
                          <TableRow>
                            <TableCell sx={{ fontSize: '0.7rem', py: 0.4, fontWeight: 'bold' }}>毒性項目</TableCell>
                            {([1, 2, 3, 4] as const).map(g => (
                              <TableCell key={g} sx={{ fontSize: '0.7rem', py: 0.4, fontWeight: 'bold', ...gradeColor(g), borderRadius: 0 }}>
                                Grade {g}
                              </TableCell>
                            ))}
                            <TableCell sx={{ fontSize: '0.7rem', py: 0.4, fontWeight: 'bold' }}>備考</TableCell>
                            <TableCell sx={{ width: 60 }} />
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {mTox.map(t => (
                            <TableRow key={t.id}>
                              <TableCell sx={{ fontSize: '0.78rem', py: 0.3, fontWeight: 'bold' }}>{t.toxicity_item}</TableCell>
                              {([1, 2, 3, 4] as const).map(g => {
                                const action = t[`grade${g}_action` as keyof ToxicityRule] as string;
                                const gc = gradeColor(g);
                                return (
                                  <TableCell key={g} sx={{ fontSize: '0.72rem', py: 0.3, bgcolor: gc.bg, color: gc.color }}>
                                    {action}
                                  </TableCell>
                                );
                              })}
                              <TableCell sx={{ fontSize: '0.7rem', py: 0.3, color: '#777' }}>{t.notes || ''}</TableCell>
                              <TableCell sx={{ py: 0.2 }}>
                                <Box sx={{ display: 'flex', gap: 0.3 }}>
                                  <IconButton size="small" sx={{ p: 0.3 }}
                                    onClick={() => setToxDialog({ open: true, regimenId: m.id, data: { ...t }, editId: t.id })}>
                                    <Edit sx={{ fontSize: 14 }} />
                                  </IconButton>
                                  <IconButton size="small" sx={{ p: 0.3, color: '#c62828' }}
                                    onClick={() => setDeleteConfirm({ type: 'toxicity', id: t.id })}>
                                    <Delete sx={{ fontSize: 14 }} />
                                  </IconButton>
                                </Box>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>

              </Box>
            </Collapse>
          </Paper>
        );
      })}

      {/* ── レジメンマスタ 編集ダイアログ ── */}
      <Dialog open={masterDialog.open} onClose={() => setMasterDialog({ open: false, data: {} })} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: '0.95rem', pb: 1 }}>
          {masterDialog.data.id ? 'レジメン編集' : '新規レジメン追加'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <TextField required label="レジメン名" size="small" fullWidth
              value={masterDialog.data.regimen_name || ''}
              onChange={e => setMasterDialog(prev => ({ ...prev, data: { ...prev.data, regimen_name: e.target.value } }))} />
            <TextField label="カテゴリ（例: 大腸癌, 乳癌）" size="small" fullWidth
              value={masterDialog.data.category || ''}
              onChange={e => setMasterDialog(prev => ({ ...prev, data: { ...prev.data, category: e.target.value } }))}
              InputProps={{ inputProps: { list: 'category-list' } }}
            />
            <datalist id="category-list">
              {categories.map(c => <option key={c} value={c} />)}
            </datalist>
            <TextField label="サイクル日数" size="small" type="number" fullWidth
              value={masterDialog.data.cycle_days ?? 21}
              onChange={e => setMasterDialog(prev => ({ ...prev, data: { ...prev.data, cycle_days: Number(e.target.value) } }))} />
            <TextField label="説明・備考" size="small" multiline rows={2} fullWidth
              value={masterDialog.data.description || ''}
              onChange={e => setMasterDialog(prev => ({ ...prev, data: { ...prev.data, description: e.target.value } }))} />
            <FormControlLabel
              control={<Switch checked={masterDialog.data.is_active !== false}
                onChange={e => setMasterDialog(prev => ({ ...prev, data: { ...prev.data, is_active: e.target.checked } }))} />}
              label="有効" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMasterDialog({ open: false, data: {} })}>キャンセル</Button>
          <Button variant="contained" startIcon={<Save />} onClick={handleSaveMaster}
            disabled={masterSaving || !masterDialog.data.regimen_name?.trim()}>
            保存
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── 薬剤 編集ダイアログ ── */}
      <Dialog open={drugDialog.open} onClose={() => setDrugDialog(prev => ({ ...prev, open: false }))} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: '0.95rem', pb: 1 }}>
          {drugDialog.editId ? '薬剤編集' : '薬剤追加'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: 1 }}>
              <TextField label="順序" size="small" type="number"
                value={drugDialog.data.sort_order ?? 1}
                onChange={e => setDrugDialog(prev => ({ ...prev, data: { ...prev.data, sort_order: Number(e.target.value) } }))} />
              <TextField required label="薬品名" size="small"
                value={drugDialog.data.drug_name || ''}
                onChange={e => setDrugDialog(prev => ({ ...prev, data: { ...prev.data, drug_name: e.target.value } }))} />
            </Box>
            <FormControl size="small" fullWidth>
              <InputLabel>種別</InputLabel>
              <Select value={drugDialog.data.drug_type || 'antineoplastic'} label="種別"
                onChange={e => setDrugDialog(prev => ({ ...prev, data: { ...prev.data, drug_type: e.target.value } }))}>
                {Object.entries(DRUG_TYPE_LABELS).map(([k, v]) => (
                  <MenuItem key={k} value={k}>{v.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 100px 1fr', gap: 1 }}>
              <TextField label="基準用量" size="small" type="number"
                value={drugDialog.data.base_dose ?? ''}
                onChange={e => setDrugDialog(prev => ({ ...prev, data: { ...prev.data, base_dose: e.target.value ? Number(e.target.value) : undefined } }))} />
              <TextField label="単位" size="small"
                value={drugDialog.data.dose_unit || ''}
                onChange={e => setDrugDialog(prev => ({ ...prev, data: { ...prev.data, dose_unit: e.target.value } }))} />
              <FormControl size="small">
                <InputLabel>換算基準</InputLabel>
                <Select value={drugDialog.data.dose_per || 'BSA'} label="換算基準"
                  onChange={e => setDrugDialog(prev => ({ ...prev, data: { ...prev.data, dose_per: e.target.value } }))}>
                  {Object.entries(DOSE_PER_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
                </Select>
              </FormControl>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 1 }}>
              <TextField label="溶媒名" size="small"
                value={drugDialog.data.solvent_name || ''}
                onChange={e => setDrugDialog(prev => ({ ...prev, data: { ...prev.data, solvent_name: e.target.value } }))} />
              <TextField label="溶媒量(mL)" size="small" type="number"
                value={drugDialog.data.solvent_volume ?? ''}
                onChange={e => setDrugDialog(prev => ({ ...prev, data: { ...prev.data, solvent_volume: e.target.value ? Number(e.target.value) : undefined } }))} />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              <TextField label="投与経路" size="small"
                value={drugDialog.data.route || ''}
                onChange={e => setDrugDialog(prev => ({ ...prev, data: { ...prev.data, route: e.target.value } }))} />
              <TextField label="点滴時間" size="small"
                value={drugDialog.data.drip_time || ''}
                onChange={e => setDrugDialog(prev => ({ ...prev, data: { ...prev.data, drip_time: e.target.value } }))} />
            </Box>
            <TextField label="備考" size="small" multiline rows={2} fullWidth
              value={drugDialog.data.notes || ''}
              onChange={e => setDrugDialog(prev => ({ ...prev, data: { ...prev.data, notes: e.target.value } }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDrugDialog(prev => ({ ...prev, open: false }))}>キャンセル</Button>
          <Button variant="contained" startIcon={<Save />} onClick={handleSaveDrug}
            disabled={drugSaving || !drugDialog.data.drug_name?.trim()}>
            保存
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── 毒性ルール 編集ダイアログ ── */}
      <Dialog open={toxDialog.open} onClose={() => setToxDialog(prev => ({ ...prev, open: false }))} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: '0.95rem', pb: 1 }}>
          {toxDialog.editId ? '毒性ルール編集' : '毒性ルール追加'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <TextField required label="毒性項目（例: ANC, 末梢神経障害）" size="small" fullWidth
              value={toxDialog.data.toxicity_item || ''}
              onChange={e => setToxDialog(prev => ({ ...prev, data: { ...prev.data, toxicity_item: e.target.value } }))} />
            {([1, 2, 3, 4] as const).map(g => {
              const gc = gradeColor(g);
              const key = `grade${g}_action` as keyof ToxicityRule;
              return (
                <TextField key={g}
                  label={`Grade ${g} 対処`} size="small" fullWidth
                  value={(toxDialog.data[key] as string) || ''}
                  onChange={e => setToxDialog(prev => ({ ...prev, data: { ...prev.data, [key]: e.target.value } }))}
                  sx={{ '& .MuiInputBase-root': { bgcolor: gc.bg } }} />
              );
            })}
            <TextField label="備考" size="small" multiline rows={2} fullWidth
              value={toxDialog.data.notes || ''}
              onChange={e => setToxDialog(prev => ({ ...prev, data: { ...prev.data, notes: e.target.value } }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setToxDialog(prev => ({ ...prev, open: false }))}>キャンセル</Button>
          <Button variant="contained" startIcon={<Save />} onClick={handleSaveToxicity}
            disabled={toxSaving || !toxDialog.data.toxicity_item?.trim()}>
            保存
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── 削除確認ダイアログ ── */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} maxWidth="xs">
        <DialogTitle sx={{ fontSize: '0.92rem' }}>削除の確認</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {deleteConfirm?.type === 'master' ? 'このレジメン（薬剤・ルールを含む）' :
             deleteConfirm?.type === 'drug' ? 'この薬剤' : 'この毒性ルール'}
            を削除しますか？
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)} startIcon={<Close />}>キャンセル</Button>
          <Button variant="contained" color="error" startIcon={<Delete />} onClick={handleDelete}>削除</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
