import { useState, useEffect } from 'react';
import {
  Box, Typography, Table, TableHead, TableRow, TableCell,
  TableBody, Button, TextField, AppBar, Toolbar, Paper,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Select, MenuItem, FormControl, InputLabel, Chip, IconButton,
  FormGroup, FormControlLabel, Checkbox,
} from '@mui/material';
import { Add, Edit, PowerSettingsNew } from '@mui/icons-material';
import api from '../services/api';

// 0=日 1=月 2=火 3=水 4=木 5=金 6=土
const WEEK_DAYS = ['日', '月', '火', '水', '木', '金', '土'];
// 業務日は月〜土（0=日は省略）
const WORK_DAYS = [1, 2, 3, 4, 5, 6];

interface UserRow {
  id: number;
  username: string;
  display_name: string;
  role: string;
  is_active: boolean;
  employee_no: string | null;
  primary_days: number[];
  secondary_days: number[];
}

const ROLE_LABELS: Record<string, string> = {
  admin: '管理者', doctor: '医師', nurse: '看護師', pharmacist: '薬剤師',
};
const ROLE_COLOR: Record<string, string> = {
  admin: '#ffccbc', doctor: '#c8e6c9', nurse: '#bbdefb', pharmacist: '#e8eaf6',
};

const EMPTY_FORM = () => ({
  username: '', display_name: '', password: '', role: 'pharmacist',
  employee_no: '', primary_days: [] as number[], secondary_days: [] as number[],
});

function DayChips({ days }: { days: number[] }) {
  if (!days || days.length === 0) return <Typography sx={{ fontSize: '0.72rem', color: '#aaa' }}>-</Typography>;
  return (
    <Box sx={{ display: 'flex', gap: 0.3, flexWrap: 'wrap' }}>
      {[1, 2, 3, 4, 5, 6].filter(d => days.includes(d)).map(d => (
        <Chip key={d} label={WEEK_DAYS[d]} size="small"
          sx={{ fontSize: '0.65rem', height: 18, bgcolor: '#bbdefb' }} />
      ))}
    </Box>
  );
}

function DayCheckboxes({
  label, value, onChange,
}: {
  label: string;
  value: number[];
  onChange: (v: number[]) => void;
}) {
  const toggle = (d: number) => {
    if (value.includes(d)) onChange(value.filter(x => x !== d));
    else onChange([...value, d].sort());
  };
  return (
    <Box>
      <Typography sx={{ fontSize: '0.8rem', fontWeight: 'bold', mb: 0.3, color: '#444' }}>{label}</Typography>
      <FormGroup row>
        {WORK_DAYS.map(d => (
          <FormControlLabel key={d}
            control={
              <Checkbox size="small" checked={value.includes(d)}
                onChange={() => toggle(d)} sx={{ py: 0.25, px: 0.5 }} />
            }
            label={<Typography sx={{ fontSize: '0.78rem' }}>{WEEK_DAYS[d]}</Typography>}
            sx={{ mr: 0.5 }}
          />
        ))}
      </FormGroup>
    </Box>
  );
}

export default function UserManagementPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<{ mode: 'create' | 'edit'; user?: UserRow } | null>(null);
  const [form, setForm] = useState(EMPTY_FORM());
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get<UserRow[]>('/users');
      setUsers(res.data);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm(EMPTY_FORM());
    setError('');
    setDialog({ mode: 'create' });
  };

  const openEdit = (u: UserRow) => {
    setForm({
      username: u.username,
      display_name: u.display_name,
      password: '',
      role: u.role,
      employee_no: u.employee_no || '',
      primary_days: u.primary_days || [],
      secondary_days: u.secondary_days || [],
    });
    setError('');
    setDialog({ mode: 'edit', user: u });
  };

  const handleSave = async () => {
    setError('');
    try {
      if (dialog?.mode === 'create') {
        await api.post('/users', form);
      } else if (dialog?.user) {
        await api.put(`/users/${dialog.user.id}`, form);
      }
      setDialog(null);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || 'エラーが発生しました');
    }
  };

  const handleToggle = async (id: number) => {
    await api.patch(`/users/${id}/toggle`);
    load();
  };

  const setF = <K extends keyof ReturnType<typeof EMPTY_FORM>>(k: K, v: ReturnType<typeof EMPTY_FORM>[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const cellSx = { border: '1px solid #ddd', py: 0.5, px: 1, fontSize: '0.8rem' };

  return (
    <>
      <AppBar position="static" sx={{ bgcolor: '#1a5276' }}>
        <Toolbar sx={{ minHeight: 44, gap: 2 }}>
          <Typography variant="subtitle1" fontWeight="bold">ユーザーマスタ管理</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Button variant="contained" size="small" startIcon={<Add />} onClick={openCreate}
            sx={{ bgcolor: '#27ae60', '&:hover': { bgcolor: '#1e8449' } }}>
            新規追加
          </Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ p: 2 }}>
        {loading ? (
          <Typography>読み込み中...</Typography>
        ) : (
          <Paper elevation={1} sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ borderCollapse: 'collapse' }}>
              <TableHead>
                <TableRow sx={{ bgcolor: '#27ae60' }}>
                  {['ID','職員番号','ログインID','氏名','権限','主担当曜日','副担当曜日','状態','操作'].map(h => (
                    <TableCell key={h} sx={{ ...cellSx, color: '#fff', fontWeight: 'bold' }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.id} sx={{ bgcolor: u.is_active ? '#fff' : '#f5f5f5' }}>
                    <TableCell sx={cellSx}>{u.id}</TableCell>
                    <TableCell sx={{ ...cellSx, fontFamily: 'monospace' }}>{u.employee_no || '-'}</TableCell>
                    <TableCell sx={{ ...cellSx, fontFamily: 'monospace', fontSize: '0.72rem' }}>{u.username}</TableCell>
                    <TableCell sx={{ ...cellSx, fontWeight: 'bold' }}>{u.display_name}</TableCell>
                    <TableCell sx={cellSx}>
                      <Chip label={ROLE_LABELS[u.role] ?? u.role} size="small"
                        sx={{ fontSize: '0.72rem', height: 20, bgcolor: ROLE_COLOR[u.role] ?? '#e0e0e0' }} />
                    </TableCell>
                    <TableCell sx={cellSx}><DayChips days={u.primary_days} /></TableCell>
                    <TableCell sx={cellSx}><DayChips days={u.secondary_days} /></TableCell>
                    <TableCell sx={{ ...cellSx, textAlign: 'center' }}>
                      <Chip label={u.is_active ? '有効' : '無効'} size="small"
                        sx={{ fontSize: '0.72rem', height: 20, bgcolor: u.is_active ? '#c8e6c9' : '#ffcdd2' }} />
                    </TableCell>
                    <TableCell sx={{ ...cellSx, textAlign: 'center' }}>
                      <IconButton size="small" onClick={() => openEdit(u)} title="編集">
                        <Edit fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => handleToggle(u.id)}
                        title={u.is_active ? '無効化' : '有効化'}
                        color={u.is_active ? 'error' : 'success'}>
                        <PowerSettingsNew fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}
      </Box>

      {/* 作成/編集ダイアログ */}
      <Dialog open={!!dialog} onClose={() => setDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          {dialog?.mode === 'create' ? 'ユーザー新規作成' : 'ユーザー編集'}
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: '12px !important' }}>

          {/* 基本情報 */}
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <TextField label="職員番号" value={form.employee_no}
              onChange={e => setF('employee_no', e.target.value)}
              size="small" sx={{ width: 130 }} />
            <TextField label="ログインID（職員ID）" value={form.username}
              onChange={e => setF('username', e.target.value)}
              disabled={dialog?.mode === 'edit'}
              size="small" sx={{ flex: 1 }} />
          </Box>

          <TextField label="氏名" value={form.display_name}
            onChange={e => setF('display_name', e.target.value)}
            fullWidth size="small" />

          <TextField
            label={dialog?.mode === 'edit' ? 'パスワード（変更する場合のみ）' : 'パスワード'}
            type="password" value={form.password}
            onChange={e => setF('password', e.target.value)}
            fullWidth size="small" />

          <FormControl size="small" fullWidth>
            <InputLabel>権限</InputLabel>
            <Select value={form.role} label="権限"
              onChange={e => setF('role', e.target.value)}>
              <MenuItem value="pharmacist">薬剤師</MenuItem>
              <MenuItem value="nurse">看護師</MenuItem>
              <MenuItem value="doctor">医師</MenuItem>
              <MenuItem value="admin">管理者</MenuItem>
            </Select>
          </FormControl>

          {/* 担当曜日（薬剤師のみ有効） */}
          <Box sx={{ border: '1px solid #e0e0e0', borderRadius: 1, p: 1, bgcolor: '#fafafa' }}>
            <Typography sx={{ fontSize: '0.72rem', color: '#888', mb: 0.75 }}>
              ※ 薬剤師のみ設定。業務日誌の初期表示に使用されます（8:30〜17:30）
            </Typography>
            <DayCheckboxes label="主担当曜日"
              value={form.primary_days}
              onChange={v => setF('primary_days', v)} />
            <Box sx={{ mt: 0.75 }}>
              <DayCheckboxes label="副担当曜日"
                value={form.secondary_days}
                onChange={v => setF('secondary_days', v)} />
            </Box>
          </Box>

          {error && <Typography color="error" variant="body2">{error}</Typography>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>キャンセル</Button>
          <Button variant="contained" onClick={handleSave}>保存</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
