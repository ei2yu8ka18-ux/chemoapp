import { useState, useEffect } from 'react';
import {
  Box, Typography, AppBar, Toolbar, Button,
  Table, TableHead, TableRow, TableCell, TableBody,
  Paper, CircularProgress, Chip, Dialog, DialogTitle,
  DialogContent, IconButton,
} from '@mui/material';
import { Print, Close, Delete } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { Treatment, BloodResults, TreatmentStatus } from '../types/treatment';

interface SnapshotItem {
  id: number;
  snapshot_date: string;
  total_patients: number;
  done_patients: number;
  created_by_name: string;
  created_at: string;
}

interface SnapshotDetail extends SnapshotItem {
  snapshot_data: {
    treatments: Treatment[];
    dateLabel: string;
    savedAt: string;
  };
}

// ── 採血項目（3行×5列） ─────────────────────────────────────
const BLOOD_ROWS: { key: keyof BloodResults; label: string }[][] = [
  [
    { key: 'wbc',  label: 'WBC'  },
    { key: 'hgb',  label: 'Hgb'  },
    { key: 'plt',  label: 'Plt'  },
    { key: 'anc',  label: 'ANC'  },
    { key: 'mono', label: 'Mono' },
  ],
  [
    { key: 'cre',  label: 'Cre'  },
    { key: 'egfr', label: 'eGFR' },
    { key: 'ast',  label: 'AST'  },
    { key: 'alt',  label: 'ALT'  },
    { key: 'tbil', label: 'Tbil' },
  ],
  [
    { key: 'crp',  label: 'CRP'  },
    { key: 'ca',   label: 'Ca'   },
    { key: 'mg',   label: 'Mg'   },
    { key: 'up',   label: 'UP'   },
    { key: 'upcr', label: 'UPCR' },
  ],
];

function getGrade(key: keyof BloodResults, value: number): 0 | 1 | 2 | 3 | 4 {
  switch (key) {
    case 'wbc':  return value < 1.0 ? 4 : value < 2.0 ? 3 : value < 3.0 ? 2 : value < 4.0 ? 1 : 0;
    case 'hgb':  return value < 6.5 ? 4 : value < 8.0 ? 3 : value < 10.0 ? 2 : value < 11.0 ? 1 : 0;
    case 'plt':  return value < 25  ? 4 : value < 50  ? 3 : value < 75   ? 2 : value < 100  ? 1 : 0;
    case 'anc':  return value < 0.5 ? 4 : value < 1.0 ? 3 : value < 1.5  ? 2 : value < 2.0  ? 1 : 0;
    case 'ast':
    case 'alt':  return value > 800 ? 4 : value > 200 ? 3 : value > 120  ? 2 : value > 40   ? 1 : 0;
    case 'cre':  return value > 6.0 ? 4 : value > 3.0 ? 3 : value > 1.5  ? 2 : value > 1.2  ? 1 : 0;
    case 'crp':  return value > 10  ? 4 : value > 5   ? 3 : value > 2    ? 2 : value > 0.5  ? 1 : 0;
    default:     return 0;
  }
}

const GRADE_BG: Record<0|1|2|3|4, string> = {
  0: 'transparent', 1: '#e3f2fd', 2: '#ffe0b2', 3: '#fff9c4', 4: '#ffcdd2',
};

const STATUS_LABEL: Record<TreatmentStatus, string> = {
  pending: '', done: '実施', changed: '変更', cancelled: '中止',
};
const STATUS_COLOR: Record<TreatmentStatus, string> = {
  pending: '#333', done: '#1565c0', changed: '#e65100', cancelled: '#c62828',
};

function getRowBg(t: Treatment): string {
  if (t.status === 'done')      return '#bbdefb';
  if (t.status === 'cancelled') return '#ffcdd2';
  if (t.status === 'changed')   return '#fff9c4';
  return '#ffffff';
}

const cellSx = { border: '1px solid #ddd', py: 0.4, px: 1, fontSize: '0.82rem' };

/** Fix NaN: handle Date object or "2026-03-06" string from PostgreSQL */
function formatDate(dateStr: unknown): string {
  const weekdays = ['日','月','火','水','木','金','土'];
  let d: Date;
  if (dateStr instanceof Date) {
    d = dateStr;
  } else {
    const s = String(dateStr ?? '').split('T')[0];
    if (!s) return String(dateStr ?? '');
    d = new Date(s + 'T00:00:00');
  }
  if (isNaN(d.getTime())) return String(dateStr ?? '');
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日（${weekdays[d.getDay()]}）`;
}

function formatDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return '';
  const dt = new Date(iso);
  return `${dt.getHours().toString().padStart(2,'0')}:${dt.getMinutes().toString().padStart(2,'0')}`;
}

const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 5mm; }
  html, body { font-size: 5.5pt !important; }
  .no-print { display: none !important; }
  .MuiDialog-root .no-print { display: none !important; }
  table { border-collapse: collapse !important; width: 100% !important; }
  th, td { font-size: 5pt !important; padding: 1px 1px !important; line-height: 1.1 !important; border: 1px solid #aaa !important; }
  .print-header { display: block !important; text-align: center; margin-bottom: 3mm; }
}
@media screen { .print-header { display: none; } }
`;

export default function DailySnapshotListPage() {
  const { user, logout } = useAuth();
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewDetail, setViewDetail] = useState<SnapshotDetail | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<SnapshotItem[]>('/daily-snapshots');
      setSnapshots(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleView = async (id: number) => {
    setViewLoading(true);
    try {
      const { data } = await api.get<SnapshotDetail>(`/daily-snapshots/${id}`);
      setViewDetail(data);
    } finally {
      setViewLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('この実施一覧を削除しますか？')) return;
    await api.delete(`/daily-snapshots/${id}`);
    setSnapshots(prev => prev.filter(s => s.id !== id));
    if (viewDetail?.id === id) setViewDetail(null);
  };

  const treatments = viewDetail?.snapshot_data?.treatments ?? [];
  const doneCount    = treatments.filter(t => t.status === 'done').length;
  const cancelCount  = treatments.filter(t => t.status === 'cancelled').length;
  const changedCount = treatments.filter(t => t.status === 'changed').length;

  return (
    <>
      <style>{PRINT_CSS}</style>

      <AppBar position="static" className="no-print" sx={{ bgcolor: '#1a5276' }}>
        <Toolbar sx={{ gap: 1.5, minHeight: 44 }}>
          <Typography fontWeight="bold" sx={{ fontSize: '0.9rem' }}>実施一覧</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>{user?.displayName}</Typography>
          <Button color="inherit" size="small" onClick={logout} sx={{ fontSize: '0.72rem' }}>ログアウト</Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ p: 1.5 }} className="no-print">
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>
        ) : (
          <Paper elevation={1} sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ borderCollapse: 'collapse' }}>
              <TableHead>
                <TableRow sx={{ bgcolor: '#1a5276' }}>
                  {['操作', '日付', '予定患者数', '実施患者数', '保存者', '保存日時'].map(h => (
                    <TableCell key={h} sx={{ ...cellSx, color: '#fff', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {snapshots.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ textAlign: 'center', py: 4, color: '#888' }}>
                      保存済みの実施一覧はありません。<br/>
                      当日実施患者一覧の「保存」ボタンで保存できます。
                    </TableCell>
                  </TableRow>
                ) : (
                  snapshots.map(snap => (
                    <TableRow key={snap.id} sx={{ '&:hover': { bgcolor: '#f0f7ff' } }}>
                      {/* 操作（最左） */}
                      <TableCell sx={{ ...cellSx, textAlign: 'center' }}>
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                          <Button size="small" variant="outlined"
                            onClick={() => handleView(snap.id)}
                            sx={{ fontSize: '0.68rem', py: 0.1, px: 0.75 }}>
                            表示
                          </Button>
                          <IconButton size="small" color="error"
                            onClick={() => handleDelete(snap.id)}
                            sx={{ p: 0.25 }}>
                            <Delete sx={{ fontSize: '0.9rem' }} />
                          </IconButton>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ ...cellSx, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                        {formatDate(snap.snapshot_date)}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, textAlign: 'center' }}>
                        <Chip label={`${snap.total_patients}件`} size="small"
                          sx={{ fontSize: '0.72rem', height: 20, bgcolor: '#e3f2fd' }} />
                      </TableCell>
                      <TableCell sx={{ ...cellSx, textAlign: 'center' }}>
                        <Chip label={`${snap.done_patients ?? 0}件`} size="small"
                          sx={{ fontSize: '0.72rem', height: 20, bgcolor: '#bbdefb' }} />
                      </TableCell>
                      <TableCell sx={cellSx}>{snap.created_by_name || '-'}</TableCell>
                      <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                        {formatDateTime(snap.created_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Paper>
        )}
      </Box>

      {/* 一覧表示ダイアログ（A4縦・採血情報含む完全版） */}
      <Dialog
        open={!!viewDetail}
        onClose={() => setViewDetail(null)}
        maxWidth="xl"
        fullWidth
        PaperProps={{ sx: { height: '95vh' } }}
      >
        <DialogTitle sx={{ pb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }} className="no-print">
          <Typography fontWeight="bold" sx={{ flexGrow: 1, fontSize: '0.95rem' }}>
            {viewDetail ? formatDate(viewDetail.snapshot_date) : ''} 実施一覧
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
            <Chip label={`全 ${treatments.length}件`} size="small" sx={{ bgcolor: '#e3f2fd' }} />
            <Chip label={`実施 ${doneCount}件`} size="small" sx={{ bgcolor: '#bbdefb' }} />
            <Chip label={`中止 ${cancelCount}件`} size="small" sx={{ bgcolor: '#ffcdd2' }} />
            <Chip label={`変更 ${changedCount}件`} size="small" sx={{ bgcolor: '#fff9c4' }} />
          </Box>
          <Button startIcon={<Print />} variant="contained" size="small" onClick={() => window.print()}
            sx={{ fontSize: '0.78rem' }}>
            印刷
          </Button>
          <IconButton size="small" onClick={() => setViewDetail(null)}>
            <Close />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ pt: 1, overflowX: 'auto', px: 1 }}>
          {/* 印刷用ヘッダー */}
          <div className="print-header">
            <div style={{ fontSize: '13pt', fontWeight: 'bold' }}>外来化学療法センター 当日患者一覧</div>
            <div style={{ fontSize: '10pt' }}>
              {viewDetail ? formatDate(viewDetail.snapshot_date) : ''}
              　保存者: {viewDetail?.created_by_name || ''}
            </div>
          </div>

          {viewLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>
          ) : viewDetail ? (
            <Table size="small" sx={{ borderCollapse: 'collapse', minWidth: 1050 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: '#27ae60' }}>
                  <TableCell sx={{ border: '1px solid #ddd', color: '#fff', fontWeight: 'bold', py: 0.25, px: 0.5, fontSize: '0.72rem', width: 40, textAlign: 'center' }}>
                    予定時間
                  </TableCell>
                  <TableCell sx={{ border: '1px solid #ddd', color: '#fff', fontWeight: 'bold', py: 0.25, px: 0.5, fontSize: '0.68rem', width: 50 }}>
                    診療科<br/>医師
                  </TableCell>
                  <TableCell sx={{ border: '1px solid #ddd', color: '#fff', fontWeight: 'bold', py: 0.25, px: 0.5, fontSize: '0.72rem', width: 100 }}>
                    患者氏名
                  </TableCell>
                  <TableCell sx={{ border: '1px solid #ddd', color: '#fff', fontWeight: 'bold', py: 0.25, px: 0.5, fontSize: '0.72rem', width: 120 }}>
                    レジメン / 実施状況
                  </TableCell>
                  <TableCell colSpan={5} sx={{ border: '1px solid #ddd', color: '#fff', fontWeight: 'bold', py: 0.25, px: 0.5, textAlign: 'center', fontSize: '0.68rem' }}>
                    採血情報（CTCAE v5.0）<br/>
                    <span style={{ color: '#90caf9' }}>■</span>G1&nbsp;
                    <span style={{ color: '#ffe0b2' }}>■</span>G2&nbsp;
                    <span style={{ color: '#fff9c4' }}>■</span>G3&nbsp;
                    <span style={{ color: '#ffcdd2' }}>■</span>G4
                  </TableCell>
                  <TableCell sx={{ border: '1px solid #ddd', color: '#fff', fontWeight: 'bold', py: 0.25, px: 0.5, fontSize: '0.72rem', width: 150 }}>
                    備考
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {treatments.map((t) => {
                  const bg = getRowBg(t);
                  const spanBorder = '2px solid #888';
                  return BLOOD_ROWS.map((rowFields, rowIdx) => {
                    const isLastRow = rowIdx === 2;
                    const bloodBorder = isLastRow ? '2px solid #888' : '1px solid #ddd';
                    return (
                      <TableRow key={`${t.id}-${rowIdx}`} sx={{ bgcolor: bg }}>

                        {/* 予定時間 */}
                        {rowIdx === 0 && (
                          <TableCell rowSpan={3} sx={{
                            border: '1px solid #ddd', borderBottom: spanBorder,
                            verticalAlign: 'middle', textAlign: 'center',
                            fontWeight: 'bold', fontSize: '0.8rem', py: 0.25, px: 0.5,
                          }}>
                            {t.scheduled_time ? t.scheduled_time.substring(0, 5) : ''}
                          </TableCell>
                        )}

                        {/* 診療科/医師 */}
                        {rowIdx === 0 && (
                          <TableCell rowSpan={3} sx={{
                            border: '1px solid #ddd', borderBottom: spanBorder,
                            verticalAlign: 'top', py: 0.25, px: 0.5,
                          }}>
                            <Typography sx={{ fontSize: '0.6rem', color: '#1565c0', lineHeight: 1.2 }}>{t.department}</Typography>
                            <Typography sx={{ fontSize: '0.68rem', fontWeight: 'bold', lineHeight: 1.2 }}>{t.doctor}</Typography>
                          </TableCell>
                        )}

                        {/* 患者氏名 */}
                        {rowIdx === 0 && (
                          <TableCell rowSpan={3} sx={{
                            border: '1px solid #ddd', borderBottom: spanBorder,
                            verticalAlign: 'top', py: 0.25, px: 0.5,
                          }}>
                            <Typography sx={{ fontSize: '0.56rem', color: '#888', lineHeight: 1.1 }}>{t.furigana || ''}</Typography>
                            <Typography sx={{ fontSize: '0.88rem', fontWeight: 'bold', color: '#0d47a1', lineHeight: 1.2 }}>
                              {t.patient_name}
                            </Typography>
                            <Typography sx={{ fontSize: '0.6rem', color: '#666' }}>{t.patient_no}</Typography>
                          </TableCell>
                        )}

                        {/* レジメン / 実施状況 */}
                        {rowIdx === 0 && (
                          <TableCell rowSpan={3} sx={{
                            border: '1px solid #ddd', borderBottom: spanBorder,
                            verticalAlign: 'top', py: 0.25, px: 0.5,
                          }}>
                            <Typography sx={{ fontSize: '0.62rem', color: '#666' }}>{t.diagnosis}</Typography>
                            <Typography sx={{ fontSize: '0.82rem', fontWeight: 'bold' }}>{t.regimen_name}</Typography>
                            {t.status !== 'pending' && (
                              <Box sx={{ mt: 0.25 }}>
                                <Typography sx={{ fontSize: '0.65rem', fontWeight: 'bold', color: STATUS_COLOR[t.status], lineHeight: 1.4 }}>
                                  【{STATUS_LABEL[t.status]} {fmtTime(t.status_changed_at)}】
                                </Typography>
                                {t.scheduled_time && (
                                  <Typography sx={{ fontSize: '0.6rem', color: '#555', lineHeight: 1.4 }}>
                                    【開始 {t.scheduled_time.substring(0, 5)}～】
                                  </Typography>
                                )}
                              </Box>
                            )}
                          </TableCell>
                        )}

                        {/* 採血5列 */}
                        {rowFields.map(f => {
                          const rawVal = t[f.key];
                          const numVal = rawVal != null ? Number(rawVal) : null;
                          const grade  = numVal != null ? getGrade(f.key, numVal) : 0;
                          return (
                            <TableCell key={f.key} sx={{
                              border: '1px solid #ddd',
                              borderBottom: bloodBorder,
                              p: '1px 2px',
                              bgcolor: grade > 0 ? GRADE_BG[grade] : bg,
                              width: 52, minWidth: 52, maxWidth: 52,
                              verticalAlign: 'middle',
                              textAlign: 'center',
                            }}>
                              <Typography sx={{ fontSize: '0.52rem', color: '#888', lineHeight: 1, display: 'block' }}>
                                {f.label}
                              </Typography>
                              <Typography sx={{
                                fontSize: '0.62rem',
                                fontWeight: grade > 0 ? 'bold' : 'normal',
                                color: grade > 0 ? '#333' : '#555',
                                lineHeight: 1.2,
                                display: 'block',
                              }}>
                                {numVal != null ? numVal : '-'}
                              </Typography>
                            </TableCell>
                          );
                        })}

                        {/* 備考 */}
                        {rowIdx === 0 && (
                          <TableCell rowSpan={3} sx={{
                            border: '1px solid #ddd', borderBottom: spanBorder,
                            verticalAlign: 'top', py: 0.25, px: 0.5,
                          }}>
                            <Typography sx={{ fontSize: '0.68rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                              {t.memo || ''}
                            </Typography>
                            {t.status_note && (
                              <Typography sx={{ fontSize: '0.62rem', color: STATUS_COLOR[t.status], fontStyle: 'italic', mt: 0.25 }}>
                                [{STATUS_LABEL[t.status]}] {t.status_note}
                              </Typography>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  });
                })}
              </TableBody>
            </Table>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
