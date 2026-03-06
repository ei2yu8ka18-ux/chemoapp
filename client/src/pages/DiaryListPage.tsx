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

/** "2026-03-06" → "2026-03-06(金)" */
function formatDiaryDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return `${dateStr}(${WEEKDAYS[d.getDay()]})`;
}

/** "田中・鈴木・山田" → { primary: "田中", sub: "鈴木、山田" } */
function splitPharmacists(names: string): { primary: string; sub: string } {
  if (!names) return { primary: '-', sub: '' };
  const parts = names.split('・').map(s => s.trim()).filter(Boolean);
  return {
    primary: parts[0] || '-',
    sub: parts.slice(1).join('、'),
  };
}

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
                    '操作', '日付', '主担当 / 副担当',
                    '注射予定', '注射実施',
                    '介入件数',
                    '患者指導', '初回指導',
                    '経口予定', '経口実施',
                    '備考',
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
                    <TableCell colSpan={11} sx={{ textAlign: 'center', py: 4, color: '#888' }}>
                      保存済みの業務日誌はありません
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map(item => {
                    const d = new Date(item.diary_date + 'T00:00:00');
                    const dow = d.getDay();
                    const rowBg = item.int_count > 0 ? '#fff8e1' : '#fff';
                    const { primary, sub } = splitPharmacists(item.pharmacist_names);
                    return (
                      <TableRow key={item.id} sx={{ bgcolor: rowBg, '&:hover': { bgcolor: '#f0f7ff' }, cursor: 'pointer' }}
                        onClick={() => goToDiary(item.diary_date)}>

                        {/* 操作（最左） */}
                        <TableCell sx={{ ...cellSx, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                          <Button size="small" variant="outlined" endIcon={<OpenInNew />}
                            onClick={() => goToDiary(item.diary_date)}
                            sx={{ fontSize: '0.68rem', py: 0.1, px: 0.75 }}>
                            表示
                          </Button>
                        </TableCell>

                        {/* 日付（曜日込み） */}
                        <TableCell sx={{ ...cellSx, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                          <Typography sx={{
                            fontSize: '0.82rem', fontWeight: 'bold',
                            color: dow === 0 ? '#c62828' : dow === 6 ? '#1565c0' : 'inherit',
                          }}>
                            {formatDiaryDate(item.diary_date)}
                          </Typography>
                        </TableCell>

                        {/* 主担当 / 副担当 */}
                        <TableCell sx={{ ...cellSx, minWidth: 120 }}>
                          <Typography sx={{ fontSize: '0.78rem', fontWeight: 'bold', lineHeight: 1.3 }}>
                            {primary}
                          </Typography>
                          {sub && (
                            <Typography sx={{ fontSize: '0.70rem', color: '#555', lineHeight: 1.3 }}>
                              副: {sub}
                            </Typography>
                          )}
                        </TableCell>

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
