import { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, AppBar, Toolbar, Button,
  Table, TableHead, TableRow, TableCell, TableBody,
  Paper, CircularProgress, Chip, TextField, Select,
  MenuItem, FormControl, InputLabel, FormControlLabel, Checkbox,
} from '@mui/material';
import { FileDownload } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

interface InterventionRecord {
  id: number;
  treatment_date: string;
  recorded_at: string;
  patient_no: string;
  patient_name: string;
  department: string;
  doctor: string;
  regimen_name: string;
  intervention_type: string;
  consultation_timing: string;
  intervention_category: string;
  intervention_detail: string;
  intervention_content: string;
  calc_cancer_guidance: boolean;
  calc_pre_consultation: boolean;
  prescription_changed: boolean;
  proxy_prescription: boolean;
  case_candidate: boolean;
  result: string | null;
  pharmacist_name: string;
  drug_route: string;
}

const cellSx = { border: '1px solid #ddd', py: 0.4, px: 0.75, fontSize: '0.78rem' };

function formatDate(iso: string): string {
  return iso ? iso.split('T')[0] : '';
}
function formatDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

const TYPE_COLOR: Record<string, string> = {
  '提案': '#c8e6c9', '疑義': '#ffe0b2', '問い合わせ': '#bbdefb',
};

export default function HistoryPage() {
  const { user, logout } = useAuth();
  const today = new Date().toISOString().split('T')[0];
  const monthAgo = new Date(Date.now() - 30*86400*1000).toISOString().split('T')[0];

  const [dateFrom, setDateFrom] = useState(monthAgo);
  const [dateTo,   setDateTo]   = useState(today);
  const [records,  setRecords]  = useState<InterventionRecord[]>([]);
  const [loading,  setLoading]  = useState(false);

  // フィルター
  const [pharmacistFilter, setPharmacistFilter] = useState('全員');
  const [caseCandidateOnly, setCaseCandidateOnly] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<InterventionRecord[]>('/interventions', {
        params: { dateFrom, dateTo },
      });
      setRecords(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 薬剤師リスト（ユニーク）
  const pharmacistList = useMemo(() => {
    const names = [...new Set(records.map(r => r.pharmacist_name).filter(Boolean))].sort();
    return ['全員', ...names];
  }, [records]);

  // フィルター済みデータ
  const filtered = useMemo(() => {
    return records.filter(r => {
      if (pharmacistFilter !== '全員' && r.pharmacist_name !== pharmacistFilter) return false;
      if (caseCandidateOnly && !r.case_candidate) return false;
      return true;
    });
  }, [records, pharmacistFilter, caseCandidateOnly]);

  // CSV出力
  const handleCsvExport = () => {
    const headers = [
      '実施日', '記録日時', '患者番号', '患者氏名', '診療科', '医師', 'レジメン',
      '薬剤種別', '介入種別', '前後', '介入分類', '介入詳細', '介入内容',
      'がん指導', '診察前', '処方変更', '代行処方', '症例候補', '結果', '薬剤師名',
    ];
    const rows = filtered.map(r => [
      formatDate(r.treatment_date),
      formatDateTime(r.recorded_at),
      r.patient_no,
      r.patient_name,
      r.department,
      r.doctor,
      r.regimen_name,
      r.drug_route || '',
      r.intervention_type,
      r.consultation_timing,
      r.intervention_category,
      r.intervention_detail,
      r.intervention_content,
      r.calc_cancer_guidance ? '○' : '',
      r.calc_pre_consultation ? '○' : '',
      r.prescription_changed ? '○' : '',
      r.proxy_prescription ? '○' : '',
      r.case_candidate ? '○' : '',
      r.result || '',
      r.pharmacist_name,
    ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`));

    const bom = '\uFEFF';
    const csv = bom + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interventions_${dateFrom}_${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <AppBar position="static" sx={{ bgcolor: '#1a5276' }}>
        <Toolbar sx={{ gap: 1.5, minHeight: 44, flexWrap: 'wrap' }}>
          <Typography fontWeight="bold" sx={{ fontSize: '0.9rem' }}>指導歴</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>{user?.displayName}</Typography>
          <Button color="inherit" size="small" onClick={logout} sx={{ fontSize: '0.72rem' }}>ログアウト</Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ p: 1.5 }}>
        {/* 検索・フィルターフォーム */}
        <Paper sx={{ p: 1.5, mb: 1.5, display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField size="small" type="date" label="開始日" value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            InputLabelProps={{ shrink: true }} sx={{ width: 150 }} />
          <TextField size="small" type="date" label="終了日" value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            InputLabelProps={{ shrink: true }} sx={{ width: 150 }} />

          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>薬剤師</InputLabel>
            <Select value={pharmacistFilter} label="薬剤師"
              onChange={e => setPharmacistFilter(e.target.value)}>
              {pharmacistList.map(p => (
                <MenuItem key={p} value={p} sx={{ fontSize: '0.85rem' }}>{p}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControlLabel
            control={
              <Checkbox size="small" checked={caseCandidateOnly}
                onChange={e => setCaseCandidateOnly(e.target.checked)} />
            }
            label={<Typography sx={{ fontSize: '0.85rem' }}>症例候補のみ</Typography>}
          />

          <Button variant="contained" size="small" onClick={fetchData}
            sx={{ fontSize: '0.78rem' }}>検索</Button>

          <Button variant="outlined" size="small"
            startIcon={<FileDownload />}
            onClick={handleCsvExport}
            disabled={filtered.length === 0}
            sx={{ fontSize: '0.78rem' }}>
            CSV出力 ({filtered.length}件)
          </Button>
        </Paper>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>
        ) : (
          <Paper elevation={1} sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ borderCollapse: 'collapse', minWidth: 1200 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: '#1a5276' }}>
                  {['実施日','記録日時','患者番号','患者氏名','診療科/医師','レジメン','薬剤種別','介入種別','前/後','介入分類','介入詳細','介入内容','算定','結果','薬剤師'].map(h => (
                    <TableCell key={h} sx={{ ...cellSx, color: '#fff', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={15} sx={{ textAlign: 'center', py: 4, color: '#888' }}>
                      データがありません
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(r => (
                    <TableRow key={r.id} sx={{ '&:hover': { bgcolor: '#f0f7ff' } }}>
                      <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }}>{formatDate(r.treatment_date)}</TableCell>
                      <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap', fontSize: '0.72rem' }}>{formatDateTime(r.recorded_at)}</TableCell>
                      <TableCell sx={cellSx}>{r.patient_no}</TableCell>
                      <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap', fontWeight: 'bold' }}>{r.patient_name}</TableCell>
                      <TableCell sx={{ ...cellSx, fontSize: '0.72rem' }}>
                        <Typography sx={{ fontSize: '0.68rem', color: '#666' }}>{r.department}</Typography>
                        <Typography sx={{ fontSize: '0.72rem' }}>{r.doctor}</Typography>
                      </TableCell>
                      <TableCell sx={{ ...cellSx, fontSize: '0.75rem', maxWidth: 120 }}>{r.regimen_name}</TableCell>
                      <TableCell sx={cellSx}>
                        {r.drug_route && (
                          <Chip label={r.drug_route} size="small" sx={{ fontSize: '0.65rem', height: 18,
                            bgcolor: r.drug_route === '注射' ? '#e3f2fd' : '#f3e5f5' }} />
                        )}
                      </TableCell>
                      <TableCell sx={cellSx}>
                        <Chip label={r.intervention_type} size="small" sx={{
                          fontSize: '0.65rem', height: 18,
                          bgcolor: TYPE_COLOR[r.intervention_type] ?? '#e0e0e0',
                        }} />
                      </TableCell>
                      <TableCell sx={{ ...cellSx, textAlign: 'center' }}>{r.consultation_timing}</TableCell>
                      <TableCell sx={cellSx}>{r.intervention_category}</TableCell>
                      <TableCell sx={cellSx}>{r.intervention_detail}</TableCell>
                      <TableCell sx={{ ...cellSx, maxWidth: 200, fontSize: '0.72rem' }}>{r.intervention_content}</TableCell>
                      <TableCell sx={{ ...cellSx, fontSize: '0.65rem' }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                          {r.calc_cancer_guidance && <Chip label="がん指導" size="small" sx={{ fontSize: '0.6rem', height: 16, bgcolor: '#e8f5e9' }} />}
                          {r.calc_pre_consultation && <Chip label="診察前" size="small" sx={{ fontSize: '0.6rem', height: 16, bgcolor: '#e3f2fd' }} />}
                          {r.prescription_changed && <Chip label="処方変更" size="small" sx={{ fontSize: '0.6rem', height: 16, bgcolor: '#fff3e0' }} />}
                          {r.proxy_prescription && <Chip label="代行処方" size="small" sx={{ fontSize: '0.6rem', height: 16, bgcolor: '#fce4ec' }} />}
                          {r.case_candidate && <Chip label="症例候補" size="small" sx={{ fontSize: '0.6rem', height: 16, bgcolor: '#f3e5f5' }} />}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ ...cellSx, fontSize: '0.72rem' }}>{r.result || ''}</TableCell>
                      <TableCell sx={cellSx}>{r.pharmacist_name}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Paper>
        )}
      </Box>
    </>
  );
}
