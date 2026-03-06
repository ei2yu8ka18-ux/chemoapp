import { useState, useEffect } from 'react';
import {
  Box, Typography, AppBar, Toolbar, Button,
  Table, TableHead, TableRow, TableCell, TableBody,
  Paper, CircularProgress, Chip, TextField,
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

interface AuthLog {
  id: number;
  action: string;
  created_at: string;
  username: string;
  display_name: string;
}

const cellSx = { border: '1px solid #ddd', py: 0.4, px: 1, fontSize: '0.82rem' };

function formatDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
}

const ACTION_LABEL: Record<string, string> = {
  login: 'ログイン', logout: 'ログアウト', password_change: 'パスワード変更',
};
const ACTION_COLOR: Record<string, string> = {
  login: '#c8e6c9', logout: '#ffcdd2', password_change: '#fff3e0',
};

export default function AuthLogsPage() {
  const { user, logout } = useAuth();
  const today = new Date().toISOString().split('T')[0];
  const monthAgo = new Date(Date.now() - 30*86400*1000).toISOString().split('T')[0];

  const [dateFrom, setDateFrom] = useState(monthAgo);
  const [dateTo, setDateTo] = useState(today);
  const [logs, setLogs] = useState<AuthLog[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<AuthLog[]>('/admin/auth-logs', {
        params: { dateFrom, dateTo },
      });
      setLogs(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <AppBar position="static" sx={{ bgcolor: '#1a5276' }}>
        <Toolbar sx={{ gap: 1.5, minHeight: 44 }}>
          <Typography fontWeight="bold" sx={{ fontSize: '0.9rem' }}>ログイン記録</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>{user?.displayName}</Typography>
          <Button color="inherit" size="small" onClick={logout} sx={{ fontSize: '0.72rem' }}>ログアウト</Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ p: 1.5 }}>
        <Paper sx={{ p: 1.5, mb: 1.5, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField size="small" type="date" label="開始日" value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            InputLabelProps={{ shrink: true }} sx={{ width: 150 }} />
          <TextField size="small" type="date" label="終了日" value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            InputLabelProps={{ shrink: true }} sx={{ width: 150 }} />
          <Button variant="contained" size="small" onClick={fetchLogs}
            sx={{ fontSize: '0.78rem' }}>検索</Button>
          <Typography sx={{ fontSize: '0.78rem', color: '#888' }}>
            {logs.length}件
          </Typography>
        </Paper>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>
        ) : (
          <Paper elevation={1} sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ borderCollapse: 'collapse' }}>
              <TableHead>
                <TableRow sx={{ bgcolor: '#1a5276' }}>
                  {['日時', 'ユーザーID', '氏名', '操作'].map(h => (
                    <TableCell key={h} sx={{ ...cellSx, color: '#fff', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} sx={{ textAlign: 'center', py: 4, color: '#888' }}>
                      ログがありません
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map(log => (
                    <TableRow key={log.id} sx={{ '&:hover': { bgcolor: '#f0f7ff' } }}>
                      <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                        {formatDateTime(log.created_at)}
                      </TableCell>
                      <TableCell sx={cellSx}>{log.username}</TableCell>
                      <TableCell sx={{ ...cellSx, fontWeight: 'bold' }}>{log.display_name}</TableCell>
                      <TableCell sx={cellSx}>
                        <Chip
                          label={ACTION_LABEL[log.action] ?? log.action}
                          size="small"
                          sx={{ fontSize: '0.72rem', height: 20, bgcolor: ACTION_COLOR[log.action] ?? '#e0e0e0' }}
                        />
                      </TableCell>
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
