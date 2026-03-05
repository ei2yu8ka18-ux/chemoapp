import { Box, Typography, Button, AppBar, Toolbar } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';

const ROLE_LABEL: Record<string, string> = {
  admin: '管理者',
  doctor: '医師',
  nurse: '看護師',
  pharmacist: '薬剤師',
};

export default function DashboardPage() {
  const { user, logout } = useAuth();

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            化学療法管理システム
          </Typography>
          <Typography variant="body2" sx={{ mr: 2 }}>
            {user?.displayName}（{ROLE_LABEL[user?.role ?? ''] ?? user?.role}）
          </Typography>
          <Button color="inherit" onClick={logout}>
            ログアウト
          </Button>
        </Toolbar>
      </AppBar>
      <Box p={4}>
        <Typography variant="h5" gutterBottom>
          ダッシュボード
        </Typography>
        <Typography color="text.secondary">
          ログインに成功しました。
        </Typography>
      </Box>
    </>
  );
}
