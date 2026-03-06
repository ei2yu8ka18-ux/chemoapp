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
import { Treatment, TreatmentStatus } from '../types/treatment';

interface SnapshotItem {
  id: number;
  snapshot_date: string;
  total_patients: number;
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

const cellSx = { border: '1px solid #ddd', py: 0.4, px: 1, fontSize: '0.82rem' };

const STATUS_LABEL: Record<TreatmentStatus, string> = {
  pending: '', done: '実施', changed: '変更', cancelled: '中止',
};
const STATUS_COLOR: Record<TreatmentStatus, string> = {
  pending: '#333', done: '#1565c0', changed: '#e65100', cancelled: '#c62828',
};

function formatDate(dateStr: string): string {
  const weekdays = ['日','月','火','水','木','金','土'];
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日（${weekdays[d.getDay()]}）`;
}

function formatDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 8mm; }
  html, body { font-size: 6pt !important; }
  .no-print { display: none !important; }
  .MuiDialog-root .no-print { display: none !important; }
  table { border-collapse: collapse !important; width: 100% !important; }
  th, td { font-size: 5.5pt !important; padding: 1px 2px !important; line-height: 1.2 !important; border: 1px solid #aaa !important; }
  .print-header { display: block !important; text-align: center; margin-bottom: 4mm; }
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
    if (!window.confirm('この実施一覧表を削除しますか？')) return;
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
          <Typography fontWeight="bold" sx={{ fontSize: '0.9rem' }}>実施一覧表</Typography>
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
                  {['日付', '患者数', '保存者', '保存日時', '操作'].map(h => (
                    <TableCell key={h} sx={{ ...cellSx, color: '#fff', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {snapshots.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} sx={{ textAlign: 'center', py: 4, color: '#888' }}>
                      保存済みの実施一覧表はありません。<br/>
                      当日実施患者一覧の「保存」ボタンで保存できます。
                    </TableCell>
                  </TableRow>
                ) : (
                  snapshots.map(snap => (
                    <TableRow key={snap.id} sx={{ '&:hover': { bgcolor: '#f0f7ff' } }}>
                      <TableCell sx={{ ...cellSx, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                        {formatDate(snap.snapshot_date)}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, textAlign: 'center' }}>
                        <Chip label={`${snap.total_patients}件`} size="small"
                          sx={{ fontSize: '0.72rem', height: 20, bgcolor: '#e3f2fd' }} />
                      </TableCell>
                      <TableCell sx={cellSx}>{snap.created_by_name || '-'}</TableCell>
                      <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                        {formatDateTime(snap.created_at)}
                      </TableCell>
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
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Paper>
        )}
      </Box>

      {/* 一覧表示ダイアログ（印刷可） */}
      <Dialog
        open={!!viewDetail}
        onClose={() => setViewDetail(null)}
        maxWidth="xl"
        fullWidth
        PaperProps={{ sx: { height: '90vh' } }}
      >
        <DialogTitle sx={{ pb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }} className="no-print">
          <Typography fontWeight="bold" sx={{ flexGrow: 1, fontSize: '0.95rem' }}>
            {viewDetail ? formatDate(viewDetail.snapshot_date) : ''} 実施一覧表
          </Typography>
          <Button startIcon={<Print />} variant="contained" size="small" onClick={() => window.print()}
            sx={{ fontSize: '0.78rem' }}>
            印刷
          </Button>
          <IconButton size="small" onClick={() => setViewDetail(null)}>
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 1, overflowX: 'auto' }}>
          {/* 印刷用ヘッダー */}
          <div className="print-header">
            <div style={{ fontSize: '13pt', fontWeight: 'bold' }}>
              外来化学療法センター 当日患者一覧
            </div>
            <div style={{ fontSize: '10pt' }}>
              {viewDetail ? formatDate(viewDetail.snapshot_date) : ''}
              保存者: {viewDetail?.created_by_name || ''}
            </div>
          </div>

          {viewLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>
          ) : viewDetail ? (
            <>
              {/* 集計（画面表示のみ） */}
              <Box className="no-print" sx={{ mb: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip label={`全 ${treatments.length}件`} size="small" sx={{ bgcolor: '#e3f2fd' }} />
                <Chip label={`実施 ${doneCount}件`} size="small" sx={{ bgcolor: '#bbdefb' }} />
                <Chip label={`中止 ${cancelCount}件`} size="small" sx={{ bgcolor: '#ffcdd2' }} />
                <Chip label={`変更 ${changedCount}件`} size="small" sx={{ bgcolor: '#fff9c4' }} />
              </Box>

              <Table size="small" sx={{ borderCollapse: 'collapse', width: '100%' }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#27ae60' }}>
                    {['予定時間','診療科','医師','患者氏名','患者番号','レジメン','実施状況','備考'].map(h => (
                      <TableCell key={h} sx={{ ...cellSx, color: '#fff', fontWeight: 'bold', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {treatments.map(t => (
                    <TableRow key={t.id} sx={{
                      bgcolor: t.status === 'done'      ? '#bbdefb' :
                               t.status === 'cancelled' ? '#ffcdd2' :
                               t.status === 'changed'   ? '#fff9c4' : '#fff',
                    }}>
                      <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap', fontWeight: 'bold', textAlign: 'center' }}>
                        {t.scheduled_time ? t.scheduled_time.substring(0, 5) : ''}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, fontSize: '0.72rem', color: '#1565c0' }}>{t.department}</TableCell>
                      <TableCell sx={{ ...cellSx, fontSize: '0.72rem' }}>{t.doctor}</TableCell>
                      <TableCell sx={{ ...cellSx, fontWeight: 'bold' }}>{t.patient_name}</TableCell>
                      <TableCell sx={{ ...cellSx, fontSize: '0.72rem' }}>{t.patient_no}</TableCell>
                      <TableCell sx={cellSx}>{t.regimen_name}</TableCell>
                      <TableCell sx={{ ...cellSx, textAlign: 'center' }}>
                        {t.status !== 'pending' && (
                          <Typography sx={{ fontSize: '0.72rem', fontWeight: 'bold', color: STATUS_COLOR[t.status] }}>
                            {STATUS_LABEL[t.status]}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, fontSize: '0.72rem', maxWidth: 200 }}>
                        {t.memo || ''}
                        {t.status_note ? ` [${STATUS_LABEL[t.status]}: ${t.status_note}]` : ''}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
