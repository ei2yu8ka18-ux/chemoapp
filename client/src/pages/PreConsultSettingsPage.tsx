import { useState, useEffect } from 'react';
import {
  Box, Typography, AppBar, Toolbar, Button,
  Paper, FormControlLabel, Checkbox, CircularProgress,
  Snackbar, Alert, Divider,
} from '@mui/material';
import { Settings } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

interface DeptSetting {
  department_name: string;
  is_enabled: boolean;
}

export default function PreConsultSettingsPage() {
  const { user, logout } = useAuth();
  const [depts, setDepts] = useState<DeptSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; msg: string; severity: 'success' | 'error' }>({
    open: false, msg: '', severity: 'success',
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/settings/pre-consult-departments');
        setDepts(data.departments);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleToggle = (name: string) => {
    setDepts(prev => prev.map(d =>
      d.department_name === name ? { ...d, is_enabled: !d.is_enabled } : d
    ));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await api.put('/settings/pre-consult-departments', { departments: depts });
      setDepts(data.departments);
      setSnackbar({ open: true, msg: '設定を保存しました', severity: 'success' });
    } catch {
      setSnackbar({ open: true, msg: '保存に失敗しました', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <AppBar position="static" sx={{ bgcolor: '#1a5276' }}>
        <Toolbar sx={{ gap: 1.5, minHeight: 44 }}>
          <Settings sx={{ fontSize: '1.1rem' }} />
          <Typography fontWeight="bold" sx={{ fontSize: '0.9rem' }}>診察前面談設定</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>{user?.displayName}</Typography>
          <Button color="inherit" size="small" onClick={logout} sx={{ fontSize: '0.72rem' }}>ログアウト</Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ p: 2, maxWidth: 640 }}>
        <Paper sx={{ p: 2.5 }}>
          <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 'bold', mb: 1 }}>
            診察前面談 算定対象診療科
          </Typography>
          <Typography sx={{ fontSize: '0.82rem', color: '#666', mb: 2 }}>
            チェックを入れた診療科の患者に、当日実施患者一覧の「診察前面談」付箋を表示します。
          </Typography>
          <Divider sx={{ mb: 2 }} />

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
          ) : (
            <>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 3 }}>
                {depts.map(d => (
                  <FormControlLabel
                    key={d.department_name}
                    control={
                      <Checkbox
                        checked={d.is_enabled}
                        onChange={() => handleToggle(d.department_name)}
                        sx={{ py: 0.5 }}
                      />
                    }
                    label={
                      <Typography sx={{
                        fontSize: '0.88rem',
                        fontWeight: d.is_enabled ? 'bold' : 'normal',
                        color: d.is_enabled ? '#1a5276' : '#555',
                      }}>
                        {d.department_name}
                      </Typography>
                    }
                    sx={{
                      bgcolor: d.is_enabled ? '#e3f2fd' : '#f5f5f5',
                      borderRadius: 1,
                      border: `1px solid ${d.is_enabled ? '#1565c0' : '#ddd'}`,
                      px: 1, py: 0.25, m: 0,
                      minWidth: 90,
                    }}
                  />
                ))}
              </Box>

              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Button
                  variant="contained"
                  onClick={handleSave}
                  disabled={saving}
                  sx={{ fontSize: '0.88rem' }}
                >
                  {saving ? '保存中...' : '設定を保存'}
                </Button>
                <Typography sx={{ fontSize: '0.78rem', color: '#888' }}>
                  現在有効: {depts.filter(d => d.is_enabled).map(d => d.department_name).join('、') || 'なし'}
                </Typography>
              </Box>
            </>
          )}
        </Paper>
      </Box>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity}>{snackbar.msg}</Alert>
      </Snackbar>
    </>
  );
}
