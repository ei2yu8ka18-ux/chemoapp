import { useState, useEffect } from 'react';
import {
  Box, Typography, AppBar, Toolbar, Button,
  Table, TableHead, TableRow, TableCell, TableBody,
  Paper, CircularProgress, Chip,
} from '@mui/material';
import { OpenInNew } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

interface DiaryListItem {
  id: number;
  diary_date: string;
  pharmacist_names: string;
  patient_counseling: number;
  first_visit_counseling: number;
  oral_scheduled: number;
  oral_done: number;
  notes: string | null;
  inj_done: number;
  inj_total: number;
  int_count: number;
}

const cellSx = { border: '1px solid #ddd', py: 0.4, px: 1, fontSize: '0.82rem' };

export default function DiaryListPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [items, setItems]   = useState<DiaryListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get<DiaryListItem[]>('/workdiaries');
        setItems(data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const goToDiary = (date: string) => navigate(`/diary?date=${date}`);

  return (
    <>
      <AppBar position="static" sx={{ bgcolor: '#1a5276' }}>
        <Toolbar sx={{ gap: 1.5, minHeight: 44 }}>
          <Typography fontWeight="bold" sx={{ fontSize: '0.9rem' }}>業務日誌一覧</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>{user?.displayName}</Typography>
          <Button color="inherit" size="small" onClick={logout} sx={{ fontSize: '0.72rem' }}>ログアウト</Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ p: 1.5 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>
        ) : (
          <Paper elevation={1} sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ borderCollapse: 'collapse' }}>
              <TableHead>
                <TableRow sx={{ bgcolor: '#1a5276' }}>
                  {[
                    '日付', '曜日', '担当薬剤師',
                    '注射予定', '注射実施',
                    '介入件数',
                    '患者指導', '初回指導',
                    '経口予定', '経口実施',
                    '備考', '操作',
                  ].map(h => (
                    <TableCell key={h} sx={{ ...cellSx, color: '#fff', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} sx={{ textAlign: 'center', py: 4, color: '#888' }}>
                      保存済みの業務日誌はありません
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map(item => {
                    const d = new Date(item.diary_date + 'T00:00:00');
                    const dow = d.getDay();
                    const rowBg = item.int_count > 0 ? '#fff8e1' : '#fff';
                    return (
                      <TableRow key={item.id} sx={{ bgcolor: rowBg, '&:hover': { bgcolor: '#f0f7ff' }, cursor: 'pointer' }}
                        onClick={() => goToDiary(item.diary_date)}>
                        <TableCell sx={{ ...cellSx, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                          {item.diary_date}
                        </TableCell>
                        <TableCell sx={{ ...cellSx, textAlign: 'center' }}>
                          <Chip label={WEEKDAYS[dow]} size="small"
                            sx={{
                              fontSize: '0.7rem', height: 20,
                              bgcolor: dow === 0 ? '#ffcdd2' : dow === 6 ? '#e3f2fd' : '#e8f5e9',
                            }} />
                        </TableCell>
                        <TableCell sx={cellSx}>{item.pharmacist_names || '-'}</TableCell>
                        <TableCell sx={{ ...cellSx, textAlign: 'center' }}>{item.inj_total}</TableCell>
                        <TableCell sx={{ ...cellSx, textAlign: 'center', fontWeight: 'bold', color: '#1565c0' }}>
                          {item.inj_done}
                        </TableCell>
                        <TableCell sx={{ ...cellSx, textAlign: 'center' }}>
                          {item.int_count > 0 ? (
                            <Chip label={`${item.int_count}件`} size="small"
                              sx={{ fontSize: '0.7rem', height: 20, bgcolor: '#fff3e0' }} />
                          ) : (
                            <Typography sx={{ fontSize: '0.78rem', color: '#aaa' }}>-</Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ ...cellSx, textAlign: 'center' }}>{item.patient_counseling}</TableCell>
                        <TableCell sx={{ ...cellSx, textAlign: 'center' }}>{item.first_visit_counseling}</TableCell>
                        <TableCell sx={{ ...cellSx, textAlign: 'center' }}>{item.oral_scheduled}</TableCell>
                        <TableCell sx={{ ...cellSx, textAlign: 'center' }}>{item.oral_done}</TableCell>
                        <TableCell sx={{ ...cellSx, maxWidth: 180,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          fontSize: '0.75rem', color: '#555' }}>
                          {item.notes || ''}
                        </TableCell>
                        <TableCell sx={{ ...cellSx, textAlign: 'center' }}>
                          <Button size="small" variant="outlined" endIcon={<OpenInNew />}
                            onClick={e => { e.stopPropagation(); goToDiary(item.diary_date); }}
                            sx={{ fontSize: '0.68rem', py: 0.1, px: 0.75 }}>
                            表示
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Paper>
        )}
      </Box>
    </>
  );
}
