import { useState } from 'react';
import {
  Box, Typography, Paper, TextField, Button,
  Alert, AppBar, Toolbar,
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

export default function PasswordChangePage() {
  const { user, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword]         = useState('');
  const [confirm, setConfirm]                 = useState('');
  const [saving, setSaving]   = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError]     = useState('');

  const handleSubmit = async () => {
    setError('');
    setSuccess(false);
    if (newPassword !== confirm) {
      setError('新しいパスワードと確認が一致しません');
      return;
    }
    if (newPassword.length < 4) {
      setError('パスワードは4文字以上にしてください');
      return;
    }
    setSaving(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'パスワード変更に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <AppBar position="static" sx={{ bgcolor: '#1a5276' }}>
        <Toolbar sx={{ gap: 1.5, minHeight: 44 }}>
          <Typography fontWeight="bold" sx={{ fontSize: '0.9rem' }}>パスワード変更</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>{user?.displayName}</Typography>
          <Button color="inherit" size="small" onClick={logout} sx={{ fontSize: '0.72rem' }}>ログアウト</Button>
        </Toolbar>
      </AppBar>
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4, px: 2 }}>
        <Paper sx={{ p: 3, maxWidth: 400, width: '100%' }}>
          <Typography variant="h6" sx={{ mb: 2, fontSize: '1rem', fontWeight: 'bold' }}>
            パスワード変更
          </Typography>
          <Typography sx={{ fontSize: '0.85rem', color: '#555', mb: 2 }}>
            ユーザー: {user?.displayName} ({user?.username})
          </Typography>

          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>パスワードを変更しました</Alert>
          )}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
          )}

          <TextField
            fullWidth label="現在のパスワード" type="password"
            value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
            sx={{ mb: 2 }} size="small"
          />
          <TextField
            fullWidth label="新しいパスワード" type="password"
            value={newPassword} onChange={e => setNewPassword(e.target.value)}
            sx={{ mb: 2 }} size="small"
          />
          <TextField
            fullWidth label="新しいパスワード（確認）" type="password"
            value={confirm} onChange={e => setConfirm(e.target.value)}
            sx={{ mb: 3 }} size="small"
          />
          <Button variant="contained" fullWidth onClick={handleSubmit} disabled={saving}>
            {saving ? '変更中...' : 'パスワードを変更する'}
          </Button>
        </Paper>
      </Box>
    </>
  );
}
