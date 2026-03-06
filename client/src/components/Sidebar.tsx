import { useNavigate, useLocation } from 'react-router-dom';
import {
  Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  Typography, Box, Divider, Tooltip,
} from '@mui/material';
import {
  CalendarToday, Assignment, MenuBook, Book,
  History, BarChart, TrendingUp, ManageAccounts, LibraryBooks,
  Summarize, Lock, TableChart, Settings, Login,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

export const DRAWER_WIDTH = 176;

const NAV_ITEMS = [
  { label: '当日患者一覧',   path: '/',                     icon: <CalendarToday fontSize="small" /> },
  { label: 'レジメン監査',   path: '/regimen',               icon: <Assignment fontSize="small" />,   disabled: true },
  { label: '点滴説明',       path: '/guidance',              icon: <MenuBook fontSize="small" />,     disabled: true },
  { label: '業務日誌作成',   path: '/diary',                 icon: <Book fontSize="small" /> },
  { label: '業務日誌一覧',   path: '/diary-list',            icon: <LibraryBooks fontSize="small" /> },
  { label: '実施一覧',       path: '/snapshot-list',         icon: <TableChart fontSize="small" /> },
  { label: '指導歴',         path: '/history',               icon: <History fontSize="small" /> },
  { label: '月報',           path: '/monthly',               icon: <BarChart fontSize="small" /> },
  { label: '介入報告書',     path: '/intervention-report',   icon: <Summarize fontSize="small" /> },
  { label: '年報',           path: '/annual',                icon: <TrendingUp fontSize="small" />,   disabled: true },
];

const ADMIN_ITEMS = [
  { label: 'ユーザー管理',     path: '/admin/users',                icon: <ManageAccounts fontSize="small" /> },
  { label: '診察前面談設定',   path: '/admin/pre-consult-settings', icon: <Settings fontSize="small" /> },
  { label: 'ログイン記録',     path: '/admin/auth-logs',            icon: <Login fontSize="small" /> },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useAuth();

  const itemSx = (active: boolean, disabled?: boolean) => ({
    py: 0.6, px: 1.5,
    bgcolor: active ? '#1a5276' : 'transparent',
    opacity: disabled ? 0.4 : 1,
    borderRadius: 1,
    mx: 0.5,
    '&:hover': { bgcolor: disabled ? 'transparent' : active ? '#1a5276' : 'rgba(255,255,255,0.12)' },
    cursor: disabled ? 'default' : 'pointer',
  });

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '@media print': { display: 'none' },
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
          bgcolor: '#1c2833',
          color: '#ecf0f1',
          borderRight: 'none',
          '@media print': { display: 'none' },
        },
      }}
    >
      {/* ロゴ/タイトル */}
      <Box sx={{ py: 1.5, px: 1.5, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <Typography sx={{ fontSize: '0.72rem', color: '#aed6f1', fontWeight: 'bold', lineHeight: 1.3 }}>
          京都桂病院
        </Typography>
        <Typography sx={{ fontSize: '0.68rem', color: '#aed6f1', fontWeight: 'bold', lineHeight: 1.3 }}>
          外来化学療法センター
        </Typography>
        <Typography sx={{ fontSize: '0.68rem', color: '#aed6f1', fontWeight: 'bold', lineHeight: 1.3 }}>
          薬剤師業務
        </Typography>
      </Box>

      {/* メインメニュー */}
      <List dense sx={{ pt: 1, flexGrow: 1 }}>
        {NAV_ITEMS.map(item => (
          <Tooltip
            key={item.path}
            title={item.disabled ? '準備中' : ''}
            placement="right"
            arrow
          >
            <span>
              <ListItemButton
                sx={itemSx(pathname === item.path, item.disabled)}
                onClick={() => !item.disabled && navigate(item.path)}
                disabled={false}
              >
                <ListItemIcon sx={{ minWidth: 28, color: pathname === item.path ? '#fff' : '#aed6f1' }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{
                    fontSize: '0.78rem',
                    color: pathname === item.path ? '#fff' : item.disabled ? '#7f8c8d' : '#aed6f1',
                    fontWeight: pathname === item.path ? 'bold' : 'normal',
                  }}
                />
              </ListItemButton>
            </span>
          </Tooltip>
        ))}
      </List>

      {/* パスワード変更（全ユーザー） */}
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', mx: 1, my: 0.5 }} />
      <List dense sx={{ pb: 0.5 }}>
        <ListItemButton
          sx={itemSx(pathname === '/change-password')}
          onClick={() => navigate('/change-password')}
        >
          <ListItemIcon sx={{ minWidth: 28, color: pathname === '/change-password' ? '#fff' : '#aed6f1' }}>
            <Lock fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="パスワード変更"
            primaryTypographyProps={{
              fontSize: '0.78rem',
              color: pathname === '/change-password' ? '#fff' : '#aed6f1',
              fontWeight: pathname === '/change-password' ? 'bold' : 'normal',
            }}
          />
        </ListItemButton>
      </List>

      {/* 管理者メニュー */}
      {user?.role === 'admin' && (
        <>
          <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', mx: 1, my: 0.5 }} />
          <Typography sx={{ fontSize: '0.65rem', color: '#7f8c8d', px: 2, pt: 0.5, pb: 0.25 }}>
            管理者
          </Typography>
          <List dense sx={{ pb: 1 }}>
            {ADMIN_ITEMS.map(item => (
              <ListItemButton
                key={item.path}
                sx={itemSx(pathname === item.path)}
                onClick={() => navigate(item.path)}
              >
                <ListItemIcon sx={{ minWidth: 28, color: pathname === item.path ? '#fff' : '#aed6f1' }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{
                    fontSize: '0.78rem',
                    color: pathname === item.path ? '#fff' : '#aed6f1',
                    fontWeight: pathname === item.path ? 'bold' : 'normal',
                  }}
                />
              </ListItemButton>
            ))}
          </List>
        </>
      )}
    </Drawer>
  );
}
