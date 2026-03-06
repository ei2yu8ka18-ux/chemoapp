import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  Typography, Box, Divider, Tooltip, IconButton,
} from '@mui/material';
import {
  CalendarToday, Assignment, MenuBook, Book,
  History, BarChart, TrendingUp, ManageAccounts, LibraryBooks,
  Summarize, Lock, TableChart, Settings, Login,
  ChevronLeft, ChevronRight,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

const DRAWER_WIDTH = 176;
const COLLAPSED_WIDTH = 48;

export { DRAWER_WIDTH };

const NAV_ITEMS = [
  { label: '当日患者一覧',   path: '/',                     icon: <CalendarToday fontSize="small" /> },
  { label: 'レジメン監査',   path: '/regimen',               icon: <Assignment fontSize="small" />,   disabled: true },
  { label: '点滴説明',       path: '/guidance',              icon: <MenuBook fontSize="small" /> },
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

  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem('sidebar-collapsed') === 'true'
  );

  const toggle = () => {
    setCollapsed(prev => {
      localStorage.setItem('sidebar-collapsed', String(!prev));
      return !prev;
    });
  };

  const width = collapsed ? COLLAPSED_WIDTH : DRAWER_WIDTH;

  const itemSx = (active: boolean, disabled?: boolean) => ({
    py: 0.6,
    px: collapsed ? 0 : 1.5,
    justifyContent: collapsed ? 'center' : 'flex-start',
    bgcolor: active ? '#1a5276' : 'transparent',
    opacity: disabled ? 0.4 : 1,
    borderRadius: 1,
    mx: 0.5,
    minWidth: 0,
    '&:hover': { bgcolor: disabled ? 'transparent' : active ? '#1a5276' : 'rgba(255,255,255,0.12)' },
    cursor: disabled ? 'default' : 'pointer',
  });

  const renderNavItem = (item: typeof NAV_ITEMS[0]) => {
    const active = pathname === item.path;
    const btn = (
      <ListItemButton
        sx={itemSx(active, item.disabled)}
        onClick={() => !item.disabled && navigate(item.path)}
        disabled={false}
      >
        <ListItemIcon sx={{ minWidth: collapsed ? 0 : 28, color: active ? '#fff' : '#aed6f1', justifyContent: 'center' }}>
          {item.icon}
        </ListItemIcon>
        {!collapsed && (
          <ListItemText
            primary={item.label}
            primaryTypographyProps={{
              fontSize: '0.78rem',
              color: active ? '#fff' : item.disabled ? '#7f8c8d' : '#aed6f1',
              fontWeight: active ? 'bold' : 'normal',
            }}
          />
        )}
      </ListItemButton>
    );

    const tooltipTitle = collapsed
      ? (item.disabled ? `${item.label}（準備中）` : item.label)
      : (item.disabled ? '準備中' : '');

    return (
      <Tooltip key={item.path} title={tooltipTitle} placement="right" arrow>
        <span>{btn}</span>
      </Tooltip>
    );
  };

  return (
    <Drawer
      variant="permanent"
      sx={{
        width,
        flexShrink: 0,
        transition: 'width 0.2s',
        '@media print': { display: 'none' },
        '& .MuiDrawer-paper': {
          width,
          boxSizing: 'border-box',
          bgcolor: '#1c2833',
          color: '#ecf0f1',
          borderRight: 'none',
          overflowX: 'hidden',
          transition: 'width 0.2s',
          '@media print': { display: 'none' },
        },
      }}
    >
      {/* ロゴ/タイトル + トグルボタン */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        py: 1,
        px: collapsed ? 0 : 1.5,
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        minHeight: 52,
      }}>
        {!collapsed && (
          <Box>
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
        )}
        <Tooltip title={collapsed ? 'メニューを開く' : 'メニューを閉じる'} placement="right" arrow>
          <IconButton size="small" onClick={toggle} sx={{ color: '#aed6f1', p: 0.5 }}>
            {collapsed ? <ChevronRight fontSize="small" /> : <ChevronLeft fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>

      {/* メインメニュー */}
      <List dense sx={{ pt: 1, flexGrow: 1 }}>
        {NAV_ITEMS.map(renderNavItem)}
      </List>

      {/* パスワード変更 */}
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', mx: 1, my: 0.5 }} />
      <List dense sx={{ pb: 0.5 }}>
        <Tooltip title={collapsed ? 'パスワード変更' : ''} placement="right" arrow>
          <span>
            <ListItemButton
              sx={itemSx(pathname === '/change-password')}
              onClick={() => navigate('/change-password')}
            >
              <ListItemIcon sx={{ minWidth: collapsed ? 0 : 28, color: pathname === '/change-password' ? '#fff' : '#aed6f1', justifyContent: 'center' }}>
                <Lock fontSize="small" />
              </ListItemIcon>
              {!collapsed && (
                <ListItemText
                  primary="パスワード変更"
                  primaryTypographyProps={{
                    fontSize: '0.78rem',
                    color: pathname === '/change-password' ? '#fff' : '#aed6f1',
                    fontWeight: pathname === '/change-password' ? 'bold' : 'normal',
                  }}
                />
              )}
            </ListItemButton>
          </span>
        </Tooltip>
      </List>

      {/* 管理者メニュー */}
      {user?.role === 'admin' && (
        <>
          <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', mx: 1, my: 0.5 }} />
          {!collapsed && (
            <Typography sx={{ fontSize: '0.65rem', color: '#7f8c8d', px: 2, pt: 0.5, pb: 0.25 }}>
              管理者
            </Typography>
          )}
          <List dense sx={{ pb: 1 }}>
            {ADMIN_ITEMS.map(item => {
              const active = pathname === item.path;
              return (
                <Tooltip key={item.path} title={collapsed ? item.label : ''} placement="right" arrow>
                  <span>
                    <ListItemButton
                      sx={itemSx(active)}
                      onClick={() => navigate(item.path)}
                    >
                      <ListItemIcon sx={{ minWidth: collapsed ? 0 : 28, color: active ? '#fff' : '#aed6f1', justifyContent: 'center' }}>
                        {item.icon}
                      </ListItemIcon>
                      {!collapsed && (
                        <ListItemText
                          primary={item.label}
                          primaryTypographyProps={{
                            fontSize: '0.78rem',
                            color: active ? '#fff' : '#aed6f1',
                            fontWeight: active ? 'bold' : 'normal',
                          }}
                        />
                      )}
                    </ListItemButton>
                  </span>
                </Tooltip>
              );
            })}
          </List>
        </>
      )}
    </Drawer>
  );
}
