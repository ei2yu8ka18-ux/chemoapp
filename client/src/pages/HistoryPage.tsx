import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, AppBar, Toolbar, Button,
  Table, TableHead, TableRow, TableCell, TableBody,
  Paper, TextField, CircularProgress, Chip,
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

interface InterventionRecord {
  id: number;
  treatment_id: number;
  record_id: string;
  recorded_at: string;
  scheduled_date: string;
  patient_no: string;
  patient_name: string;
  department: string;
  doctor: string;
  regimen_name: string;
  intervention_type: string;
  consultation_timing: string;
  calc_cancer_guidance: boolean;
  calc_pre_consultation: boolean;
  intervention_category: string;
  intervention_detail: string;
  intervention_content: string;
  pharmacist_name: string;
  memo: string;
  prescription_changed: boolean;
  proxy_prescription: boolean;
  case_candidate: boolean;
}

const TYPE_COLOR: Record<string, string> = {
  '提案': '#c8e6c9',
  '疑義': '#ffccbc',
  '問い合わせ': '#bbdefb',
};

const cellSx = {
  border: '1px solid #ddd',
  py: 0.3,
  px: 0.75,
  fontSize: '0.75rem',
};

function fmtDate(iso: string) {
  if (!iso) return '';
  return iso.substring(0, 10);
}
function fmtDateTime(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${d.getFullYear()}/${mm}/${dd} ${hh}:${mi}`;
}

// 今日の日付をデフォルトのdateToに使用
const todayStr = new Date().toISOString().split('T')[0];
// 30日前をデフォルトのdateFromに使用
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

export default function HistoryPage() {
  const { user, logout } = useAuth();
  const [records, setRecords] = useState<InterventionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgoStr);
  const [dateTo, setDateTo]   = useState(todayStr);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<InterventionRecord[]>('/interventions', {
        params: { dateFrom, dateTo },
      });
      setRecords(res.data);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      {/* ヘッダー */}
      <AppBar position="static" sx={{ bgcolor: '#1a5276' }}>
        <Toolbar sx={{ gap: 1.5, minHeight: 44 }}>
          <Typography fontWeight="bold" sx={{ fontSize: '0.9rem' }}>
            指導歴
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>{user?.displayName}</Typography>
          <Button color="inherit" size="small" onClick={logout} sx={{ fontSize: '0.72rem' }}>ログアウト</Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ p: 1.5 }}>
        {/* 検索フォーム */}
        <Paper elevation={1} sx={{ p: 1.5, mb: 1.5, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: '0.82rem', fontWeight: 'bold' }}>期間：</Typography>
          <TextField
            type="date" size="small" label="開始日"
            value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 160 }}
          />
          <Typography sx={{ fontSize: '0.82rem' }}>〜</Typography>
          <TextField
            type="date" size="small" label="終了日"
            value={dateTo} onChange={e => setDateTo(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 160 }}
          />
          <Button variant="contained" size="small" onClick={load}>検索</Button>
          <Typography sx={{ fontSize: '0.78rem', color: '#555', ml: 1 }}>
            {records.length} 件
          </Typography>
        </Paper>

        {/* テーブル */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Paper elevation={1} sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ borderCollapse: 'collapse', minWidth: 1100 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: '#1a5276' }}>
                  {[
                    '実施日', '記録日時', '患者番号', '患者氏名', '診療科/医師',
                    'レジメン', '介入種別', '前/後', '介入分類', '介入詳細',
                    '介入内容', '算定', '結果', '薬剤師',
                  ].map(h => (
                    <TableCell key={h} sx={{ ...cellSx, color: '#fff', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={14} sx={{ textAlign: 'center', py: 4, color: '#888' }}>
                      データがありません
                    </TableCell>
                  </TableRow>
                ) : (
                  records.map(r => (
                    <TableRow key={r.id} sx={{ '&:nth-of-type(even)': { bgcolor: '#f9f9f9' } }}>
                      <TableCell sx={cellSx}>{fmtDate(r.scheduled_date)}</TableCell>
                      <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }}>{fmtDateTime(r.recorded_at)}</TableCell>
                      <TableCell sx={cellSx}>{r.patient_no}</TableCell>
                      <TableCell sx={{ ...cellSx, fontWeight: 'bold' }}>{r.patient_name}</TableCell>
                      <TableCell sx={cellSx}>
                        <Typography sx={{ fontSize: '0.68rem', color: '#1565c0' }}>{r.department}</Typography>
                        <Typography sx={{ fontSize: '0.72rem' }}>{r.doctor}</Typography>
                      </TableCell>
                      <TableCell sx={cellSx}>{r.regimen_name}</TableCell>
                      <TableCell sx={cellSx}>
                        {r.intervention_type && (
                          <Chip label={r.intervention_type} size="small"
                            sx={{ fontSize: '0.65rem', height: 18, bgcolor: TYPE_COLOR[r.intervention_type] ?? '#e0e0e0' }} />
                        )}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, textAlign: 'center' }}>{r.consultation_timing}</TableCell>
                      <TableCell sx={cellSx}>{r.intervention_category}</TableCell>
                      <TableCell sx={cellSx}>{r.intervention_detail}</TableCell>
                      <TableCell sx={{ ...cellSx, maxWidth: 200, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {r.intervention_content}
                      </TableCell>
                      <TableCell sx={cellSx}>
                        <Box sx={{ display: 'flex', gap: 0.3, flexWrap: 'wrap' }}>
                          {r.calc_cancer_guidance  && <Chip label="がん指導" size="small" sx={{ fontSize: '0.6rem', height: 16, bgcolor: '#e8f5e9' }} />}
                          {r.calc_pre_consultation && <Chip label="診察前" size="small"  sx={{ fontSize: '0.6rem', height: 16, bgcolor: '#e3f2fd' }} />}
                        </Box>
                      </TableCell>
                      <TableCell sx={cellSx}>
                        <Box sx={{ display: 'flex', gap: 0.3, flexWrap: 'wrap' }}>
                          {r.prescription_changed && <Chip label="処方変更" size="small" sx={{ fontSize: '0.6rem', height: 16, bgcolor: '#fff3e0' }} />}
                          {r.proxy_prescription   && <Chip label="代行処方" size="small" sx={{ fontSize: '0.6rem', height: 16, bgcolor: '#fce4ec' }} />}
                          {r.case_candidate       && <Chip label="症例候補" size="small" sx={{ fontSize: '0.6rem', height: 16, bgcolor: '#f3e5f5' }} />}
                        </Box>
                      </TableCell>
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
