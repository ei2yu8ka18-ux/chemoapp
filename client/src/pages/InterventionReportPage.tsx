import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, AppBar, Toolbar, Button, CircularProgress, Paper,
  Table, TableHead, TableRow, TableCell, TableBody, Select, MenuItem,
} from '@mui/material';
import { Print } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const PRINT_CSS = `
@media print {
  @page { size: A4 landscape; margin: 8mm; }
  html, body { font-size: 7pt !important; }
  .no-print { display: none !important; }
  table { border-collapse: collapse !important; width: 100% !important; page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  th, td { font-size: 6.5pt !important; padding: 1px 3px !important; line-height: 1.3; }
  .MuiPaper-root { box-shadow: none !important; border: 1px solid #bbb !important; }
}
@media screen { .print-only { display: none !important; } }
`;

const TH = ({ children, w }: { children: React.ReactNode; w?: number | string }) => (
  <TableCell sx={{ border: '1px solid #bbb', bgcolor: '#dce8f5', fontWeight: 'bold',
    fontSize: '0.68rem', p: '3px 5px', whiteSpace: 'nowrap', width: w }}>
    {children}
  </TableCell>
);
const TD = ({ children, bold, nowrap, maxW }: {
  children?: React.ReactNode; bold?: boolean; nowrap?: boolean; maxW?: number;
}) => (
  <TableCell sx={{ border: '1px solid #ddd', fontSize: '0.68rem', p: '2px 5px',
    fontWeight: bold ? 'bold' : 'normal',
    whiteSpace: nowrap ? 'nowrap' : 'pre-wrap',
    wordBreak: 'break-all',
    maxWidth: maxW }}>
    {children}
  </TableCell>
);

interface IntRecord {
  id: number;
  scheduled_date: string;
  patient_no: string;
  patient_name: string;
  diagnosis: string;
  regimen_name: string;
  intervention_type: string;
  consultation_timing: string;
  intervention_category: string;
  intervention_detail: string;
  intervention_content: string;
  pharmacist_name: string;
  prescription_changed: boolean;
  proxy_prescription: boolean;
  case_candidate: boolean;
  calc_cancer_guidance: boolean;
  calc_pre_consultation: boolean;
}

const now = new Date();

export default function InterventionReportPage() {
  const { user, logout } = useAuth();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [records, setRecords] = useState<IntRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<IntRecord[]>('/interventions/report', { params: { year, month } });
      setRecords(res.data);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  // 分類ごとにグループ化して表示
  let prevCat = '';

  return (
    <>
      <style>{PRINT_CSS}</style>
      <AppBar position="static" className="no-print" sx={{ bgcolor: '#1a5276' }}>
        <Toolbar sx={{ gap: 1.5, minHeight: 44 }}>
          <Typography fontWeight="bold" sx={{ fontSize: '0.9rem' }}>介入報告書</Typography>
          <Select size="small" value={year}
            onChange={e => setYear(Number(e.target.value))}
            sx={{ bgcolor: '#fff', height: 30, fontSize: '0.8rem' }}>
            {[now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1].map(y => (
              <MenuItem key={y} value={y}>{y}年</MenuItem>
            ))}
          </Select>
          <Select size="small" value={month}
            onChange={e => setMonth(Number(e.target.value))}
            sx={{ bgcolor: '#fff', height: 30, fontSize: '0.8rem' }}>
            {Array.from({length:12},(_,i)=>i+1).map(m => (
              <MenuItem key={m} value={m}>{m}月</MenuItem>
            ))}
          </Select>
          <Typography sx={{ fontSize: '0.75rem', color: '#d6eaf8' }}>
            {records.length}件
          </Typography>
          <Button variant="outlined" size="small" color="inherit"
            startIcon={<Print />} onClick={() => window.print()} sx={{ fontSize: '0.75rem' }}>
            印刷
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          <Typography sx={{ fontSize: '0.78rem' }}>{user?.displayName}</Typography>
          <Button color="inherit" size="small" onClick={logout} sx={{ fontSize: '0.72rem' }}>ログアウト</Button>
        </Toolbar>
      </AppBar>

      {/* 印刷タイトル */}
      <Box className="print-only" sx={{ textAlign: 'center', mb: '3mm' }}>
        <Typography sx={{ fontSize: '13pt', fontWeight: 'bold' }}>
          外来化学療法センター 介入報告書
        </Typography>
        <Typography sx={{ fontSize: '10pt' }}>{year}年{month}月</Typography>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>
      ) : (
        <Box sx={{ p: 1 }}>
          <Paper elevation={1} sx={{ p: 1 }}>
            {records.length === 0 ? (
              <Typography sx={{ color: '#888', p: 2 }}>介入記録なし</Typography>
            ) : (
              <Table size="small" sx={{ borderCollapse: 'collapse' }}>
                <TableHead>
                  <TableRow>
                    <TH w={18}>No</TH>
                    <TH w={160}>レジメン</TH>
                    <TH w={120}>介入分類</TH>
                    <TH w={120}>詳細</TH>
                    <TH>介入内容</TH>
                    <TH w={50}>薬剤師</TH>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {records.map((r, idx) => {
                    const showCatHeader = r.intervention_category !== prevCat;
                    if (showCatHeader) prevCat = r.intervention_category;

                    return [
                      showCatHeader && r.intervention_category ? (
                        <TableRow key={`cat-${r.intervention_category}-${idx}`}>
                          <TableCell colSpan={6} sx={{
                            bgcolor: '#2c3e50', color: '#fff', fontWeight: 'bold',
                            fontSize: '0.75rem', p: '3px 8px',
                            borderTop: idx > 0 ? '2px solid #2c3e50' : undefined,
                          }}>
                            ▍{r.intervention_category}
                          </TableCell>
                        </TableRow>
                      ) : null,
                      <TableRow key={r.id} sx={{ '&:hover': { bgcolor: '#f5f5f5' } }}>
                        <TD nowrap>{idx + 1}</TD>
                        <TD nowrap>{r.regimen_name}</TD>
                        <TD nowrap>{r.intervention_category}</TD>
                        <TD nowrap>{r.intervention_detail}</TD>
                        <TableCell sx={{
                          border: '1px solid #ddd', fontSize: '0.68rem', p: '2px 5px',
                          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                        }}>
                          {r.intervention_content}
                        </TableCell>
                        <TD nowrap>{r.pharmacist_name}</TD>
                      </TableRow>,
                    ];
                  })}
                </TableBody>
              </Table>
            )}
          </Paper>
        </Box>
      )}
    </>
  );
}
