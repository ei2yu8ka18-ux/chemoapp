import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box, Typography, Table, TableHead, TableRow, TableCell,
  TableBody, Button, TextField, Chip, AppBar,
  Toolbar, CircularProgress, Paper, Dialog, DialogTitle,
  DialogContent, DialogActions, IconButton, FormControlLabel,
  Checkbox, FormGroup, Snackbar, Alert,
} from '@mui/material';
import { Logout, Add, Remove, Save, TableRows, Warning, InvertColors } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { Treatment, BloodResults, TreatmentStatus } from '../types/treatment';
import InterventionModal from '../components/InterventionModal';

// 印刷CSS（A4縦・患者一覧）
const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 5mm; }
  html, body { font-size: 5.5pt !important; }
  .no-print { display: none !important; }
  table { border-collapse: collapse !important; width: 100% !important; }
  th, td { font-size: 5pt !important; padding: 1px 1px !important; line-height: 1.1 !important; }
  .status-col { display: none; }
}
@media screen { .print-only { display: none !important; } }
/* リサイズハンドル */
.rh { position: absolute; right: 0; top: 0; bottom: 0; width: 5px; cursor: col-resize; user-select: none; z-index: 1; }
.rh:hover { background: rgba(255,255,255,0.5); }
`;

// ── 採血項目（3行×5列） ────────────────────────────────────────
const BLOOD_ROWS: { key: keyof BloodResults; label: string }[][] = [
  [
    { key: 'wbc',  label: 'WBC'  },
    { key: 'hgb',  label: 'Hgb'  },
    { key: 'plt',  label: 'Plt'  },
    { key: 'anc',  label: 'ANC'  },
    { key: 'mono', label: 'Mono' },
  ],
  [
    { key: 'cre',  label: 'Cre'  },
    { key: 'egfr', label: 'eGFR' },
    { key: 'ast',  label: 'AST'  },
    { key: 'alt',  label: 'ALT'  },
    { key: 'tbil', label: 'Tbil' },
  ],
  [
    { key: 'crp',  label: 'CRP'  },
    { key: 'ca',   label: 'Ca'   },
    { key: 'mg',   label: 'Mg'   },
    { key: 'up',   label: 'UP'   },
    { key: 'upcr', label: 'UPCR' },
  ],
];

// ── CTCAE v5.0 Grade判定 ──────────────────────────────────────
function getGrade(key: keyof BloodResults, value: number): 0 | 1 | 2 | 3 | 4 {
  switch (key) {
    case 'wbc':  return value < 1.0 ? 4 : value < 2.0 ? 3 : value < 3.0 ? 2 : value < 4.0 ? 1 : 0;
    case 'hgb':  return value < 6.5 ? 4 : value < 8.0 ? 3 : value < 10.0 ? 2 : value < 11.0 ? 1 : 0;
    case 'plt':  return value < 25  ? 4 : value < 50  ? 3 : value < 75   ? 2 : value < 100  ? 1 : 0;
    case 'anc':  return value < 0.5 ? 4 : value < 1.0 ? 3 : value < 1.5  ? 2 : value < 2.0  ? 1 : 0;
    case 'ast':
    case 'alt':  return value > 800 ? 4 : value > 200 ? 3 : value > 120  ? 2 : value > 40   ? 1 : 0;
    case 'cre':  return value > 6.0 ? 4 : value > 3.0 ? 3 : value > 1.5  ? 2 : value > 1.2  ? 1 : 0;
    case 'crp':  return value > 10  ? 4 : value > 5   ? 3 : value > 2    ? 2 : value > 0.5  ? 1 : 0;
    default:     return 0;
  }
}

const GRADE_BG: Record<0|1|2|3|4, string> = {
  0: 'transparent', 1: '#e3f2fd', 2: '#ffe0b2', 3: '#fff9c4', 4: '#ffcdd2',
};

function getTimeBg(scheduledTime: string | null): string {
  if (!scheduledTime) return '#ffffff';
  const t = scheduledTime.substring(0, 5);
  if (t === '11:30') return '#fffde7';
  if (t === '13:00') return '#f1f8e9';
  return '#ffffff';
}
function getRowBg(t: Treatment): string {
  if (t.status === 'done')      return '#bbdefb';
  if (t.status === 'cancelled') return '#ffcdd2';
  if (t.status === 'changed')   return '#fff9c4';
  return getTimeBg(t.scheduled_time);
}

const STATUS_LABEL: Record<TreatmentStatus, string> = {
  pending: '', done: '実施', changed: '変更', cancelled: '中止',
};
const STATUS_COLOR: Record<TreatmentStatus, string> = {
  pending: '', done: '#1565c0', changed: '#e65100', cancelled: '#c62828',
};

const PRESC_BG: Record<string, string> = {
  '緊急': '#ffccbc', '院内': '#c8e6c9', '院外': '#bbdefb',
};
function PrescChips({ value }: { value: string | null }) {
  if (!value) return null;
  const types = value.split(',').map(s => s.trim()).filter(Boolean);
  return (
    <Box sx={{ display: 'flex', gap: 0.25, flexWrap: 'wrap', mt: 0.25 }}>
      {types.map(t => (
        <Chip key={t} label={t} size="small" sx={{
          fontSize: '0.6rem', height: 15,
          bgcolor: PRESC_BG[t] ?? '#e0e0e0',
        }} />
      ))}
    </Box>
  );
}

function getSurname(furigana: string | null): string {
  if (!furigana) return '';
  return furigana.trim().split(/[\s　]+/)[0] || '';
}

function formatDateLabel(dateStr: string): string {
  const weekdays = ['日','月','火','水','木','金','土'];
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日（${weekdays[d.getDay()]}）`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return '';
  const dt = new Date(iso);
  return `${dt.getHours().toString().padStart(2,'0')}:${dt.getMinutes().toString().padStart(2,'0')}`;
}

/** 採血数値フォーマット: 整数→そのまま / 小数→小数点以下2桁 */
function fmtBlood(v: number): string {
  if (v === Math.floor(v)) return v.toString();
  return v.toFixed(2);
}

const todayStr = new Date().toISOString().split('T')[0];
const cellSx = { border: '1px solid #ddd', py: 0.25, px: 0.5, fontSize: '0.875rem' };

// 変更/中止の頻出理由
const QUICK_REASONS = ['骨髄抑制', 'PD', '体調不良', '本人都合'] as const;

// ── カラム定義（リサイズ対応） ────────────────────────────────
const COL_KEYS = ['time','dept','patient','regimen','presc','inj','blood','status','memo'] as const;
type ColKey = typeof COL_KEYS[number];
const COL_DEFAULT_WIDTHS: Record<ColKey, number> = {
  time: 44, dept: 50, patient: 110, regimen: 115,
  presc: 74, inj: 62, blood: 52, status: 60, memo: 162,
};
const COL_STORAGE_KEY = 'treatment_list_col_widths_v1';

function loadColWidths(): Record<ColKey, number> {
  try {
    const s = localStorage.getItem(COL_STORAGE_KEY);
    if (s) return { ...COL_DEFAULT_WIDTHS, ...JSON.parse(s) };
  } catch { /* ignore */ }
  return { ...COL_DEFAULT_WIDTHS };
}

// ─────────────────────────────────────────────────────────────
export default function TreatmentListPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [loading, setLoading]       = useState(true);
  const [regimenOpCount, setRegimenOpCount] = useState(0);
  const [selectedDate, setSelectedDate] = useState(todayStr);

  // 診察前面談対象診療科
  const [preConsultDepts, setPreConsultDepts] = useState<string[]>(['腫瘍内', '内科']);

  // 採血自動取込
  const [autoBlood1, setAutoBlood1] = useState(false);
  const [autoBlood5, setAutoBlood5] = useState(false);

  // DWH同期状態
  const [syncingBlood, setSyncingBlood] = useState(false);
  const [bloodSyncedAt, setBloodSyncedAt] = useState<string | null>(null);

  // 変更/中止ダイアログ
  const [dialog, setDialog] = useState<{
    id: number; status: TreatmentStatus; note: string; quickReasons: string[];
  } | null>(null);

  // 備考追記ダイアログ
  const [memoDialog, setMemoDialog] = useState<{
    id: number; memo: string;
  } | null>(null);

  // 介入記録モーダル
  const [interventionTarget, setInterventionTarget] = useState<Treatment | null>(null);

  // 保存状態
  const [snackbar, setSnackbar] = useState<{ open: boolean; msg: string; severity: 'success' | 'error' }>({
    open: false, msg: '', severity: 'success',
  });
  const [saving, setSaving] = useState(false);

  // カラムリサイズ
  const [colWidths, setColWidths] = useState<Record<ColKey, number>>(loadColWidths);
  const resizeRef = useRef<{ key: ColKey; startX: number; startW: number } | null>(null);

  const startResize = useCallback((key: ColKey, e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = { key, startX: e.clientX, startW: colWidths[key] };
    const onMove = (mv: MouseEvent) => {
      if (!resizeRef.current) return;
      const diff = mv.clientX - resizeRef.current.startX;
      const newW = Math.max(30, resizeRef.current.startW + diff);
      setColWidths(prev => ({ ...prev, [resizeRef.current!.key]: newW }));
    };
    const onUp = () => {
      setColWidths(prev => {
        localStorage.setItem(COL_STORAGE_KEY, JSON.stringify(prev));
        return prev;
      });
      resizeRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [colWidths]);

  const load = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const [treatRes, diaryRes] = await Promise.all([
        api.get<Treatment[]>('/treatments', { params: { date } }),
        api.get(`/workdiaries/${date}`).catch(() => null),
      ]);
      setTreatments(treatRes.data);
      if (diaryRes?.data?.diary) {
        setRegimenOpCount(diaryRes.data.diary.regimen_operation || 0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // DWH採血・緊急処方同期 → PostgreSQL upsert → 画面リロード
  const syncBlood = useCallback(async (date: string) => {
    setSyncingBlood(true);
    try {
      await Promise.allSettled([
        api.post(`/dwh-sync/blood?date=${date}`),
        api.post(`/dwh-sync/urgent?date=${date}`),
      ]);
      setBloodSyncedAt(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch {
      // 同期失敗時も画面データは更新する
    } finally {
      setSyncingBlood(false);
      load(date);
    }
  }, [load]);

  // 初回: 設定 + データ読み込み
  useEffect(() => {
    api.get('/settings/pre-consult-departments')
      .then(res => {
        const enabled = (res.data.departments as { department_name: string; is_enabled: boolean }[])
          .filter(d => d.is_enabled)
          .map(d => d.department_name);
        setPreConsultDepts(enabled);
      })
      .catch(() => {});
    load(todayStr);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 採血自動取込タイマー（DWH同期→PostgreSQL→画面更新）
  useEffect(() => {
    if (!autoBlood1 && !autoBlood5) return;
    const intervalMs = autoBlood1 ? 60_000 : 300_000;
    const timer = setInterval(() => { syncBlood(selectedDate); }, intervalMs);
    return () => clearInterval(timer);
  }, [autoBlood1, autoBlood5, syncBlood, selectedDate]);

  // 同姓チェック
  const duplicateSurnames = useMemo(() => {
    const counts: Record<string, number> = {};
    treatments.forEach(t => {
      const s = getSurname(t.furigana);
      if (s) counts[s] = (counts[s] || 0) + 1;
    });
    return new Set(Object.keys(counts).filter(k => counts[k] > 1));
  }, [treatments]);

  const applyStatus = async (id: number, status: TreatmentStatus, note?: string) => {
    const res = await api.patch(`/treatments/${id}/status`, { status, note: note || null });
    setTreatments(prev => prev.map(t =>
      t.id === id ? { ...t, status, status_note: note || null, status_changed_at: res.data.status_changed_at } : t
    ));
  };

  const handleStatusClick = (id: number, status: TreatmentStatus) => {
    const current = treatments.find(t => t.id === id);
    if (current?.status === status) {
      applyStatus(id, 'pending');
      return;
    }
    if (status === 'changed' || status === 'cancelled') {
      setDialog({ id, status, note: '', quickReasons: [] });
    } else {
      applyStatus(id, status);
    }
  };

  const handleDialogConfirm = async () => {
    if (!dialog) return;
    const note = [
      ...dialog.quickReasons,
      dialog.note,
    ].filter(Boolean).join('、');
    await applyStatus(dialog.id, dialog.status, note);
    setDialog(null);
  };

  // レジメン操作 +/- （業務日誌連動）
  const handleRegimenOp = async (delta: number) => {
    if (delta < 0 && regimenOpCount <= 0) return;
    try {
      const res = await api.patch(`/workdiaries/${selectedDate}/increment`, {
        field: 'regimen_operation', delta,
      });
      setRegimenOpCount(res.data.new_value);
    } catch {
      setRegimenOpCount(c => Math.max(0, c + delta));
    }
  };

  // 注射/内服区分切替
  const handleCategoryToggle = async (id: number, current: '注射' | '内服') => {
    const next: '注射' | '内服' = current === '注射' ? '内服' : '注射';
    try {
      await api.patch(`/treatments/${id}/category`, { treatment_category: next });
      setTreatments(prev => prev.map(t =>
        t.id === id ? { ...t, treatment_category: next } : t
      ));
    } catch {
      /* ignore */
    }
  };

  // 備考保存
  const handleMemoSave = async () => {
    if (!memoDialog) return;
    const res = await api.patch(`/treatments/${memoDialog.id}/memo`, { memo: memoDialog.memo });
    setTreatments(prev => prev.map(t =>
      t.id === memoDialog.id ? { ...t, memo: res.data.memo } : t
    ));
    setMemoDialog(null);
  };

  // 一覧保存
  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post('/daily-snapshots', {
        snapshot_date: selectedDate,
        snapshot_data: {
          treatments,
          dateLabel: formatDateLabel(selectedDate),
          savedAt: new Date().toISOString(),
        },
        total_patients: treatments.length,
      });
      setSnackbar({ open: true, msg: '一覧を保存しました', severity: 'success' });
    } catch {
      setSnackbar({ open: true, msg: '保存に失敗しました', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const dateLabel = formatDateLabel(selectedDate);
  const doneCount    = treatments.filter(t => t.status === 'done').length;
  const cancelCount  = treatments.filter(t => t.status === 'cancelled').length;
  const changedCount = treatments.filter(t => t.status === 'changed').length;
  const remaining    = treatments.length - doneCount - cancelCount - changedCount;

  const btnSx = {
    fontSize: '0.68rem', py: 0.25, px: 0.75,
    borderColor: 'rgba(255,255,255,0.4)',
    minWidth: 0,
  };

  return (
    <>
      <style>{PRINT_CSS}</style>

      {/* ── ヘッダー ── */}
      <AppBar position="static" className="no-print" sx={{ bgcolor: '#1a5276' }}>
        <Toolbar sx={{ gap: 0.75, minHeight: 44, flexWrap: 'wrap' }}>
          {/* 日付ピッカー */}
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.4)',
              borderRadius: 4,
              color: '#fff',
              fontSize: '1.05rem',
              padding: '3px 8px',
              height: 34,
              colorScheme: 'dark',
            }}
          />
          {/* あと〇件(赤) / 全〇件(白) */}
          <Box sx={{
            display: 'flex', alignItems: 'center',
            bgcolor: '#2c3e50', borderRadius: 1, px: 0.75, py: 0.2,
          }}>
            <Typography component="span" sx={{ fontSize: '1.15rem', fontWeight: 'bold', color: '#e74c3c' }}>
              あと {remaining}件
            </Typography>
            <Typography component="span" sx={{ fontSize: '0.85rem', color: '#ecf0f1' }}>
              &nbsp;/&nbsp;全 {treatments.length}件
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ fontSize: '0.65rem', color: '#d6eaf8' }}>
            （実施 {doneCount}・中止 {cancelCount}・変更 {changedCount}）
          </Typography>

          <Box sx={{ flexGrow: 1 }} />

          {/* 一覧作成ボタン */}
          <Button size="small" color="inherit" variant="outlined"
            onClick={() => load(selectedDate)}
            startIcon={<TableRows sx={{ fontSize: '0.85rem !important' }} />}
            sx={btnSx}>一覧作成</Button>

          {/* 保存ボタン */}
          <Button size="small" color="inherit" variant="outlined"
            onClick={handleSave}
            disabled={saving || treatments.length === 0}
            startIcon={<Save sx={{ fontSize: '0.8rem' }} />}
            sx={btnSx}>
            {saving ? '保存中...' : '保存'}
          </Button>

          {/* レジメン操作 ± */}
          <Box sx={{ display: 'flex', alignItems: 'center', border: '1px solid rgba(255,255,255,0.4)',
            borderRadius: 0.5, px: 0.25 }}>
            <Typography sx={{ fontSize: '0.62rem', color: '#fff', px: 0.5 }}>レジメン操作</Typography>
            <IconButton size="small" onClick={() => handleRegimenOp(-1)}
              disabled={regimenOpCount <= 0}
              sx={{ color: 'white', p: 0.2, '&.Mui-disabled': { color: 'rgba(255,255,255,0.3)' } }}>
              <Remove sx={{ fontSize: '0.8rem' }} />
            </IconButton>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 'bold', minWidth: 16, textAlign: 'center',
              color: regimenOpCount > 0 ? '#f39c12' : 'rgba(255,255,255,0.5)' }}>
              {regimenOpCount}
            </Typography>
            <IconButton size="small" onClick={() => handleRegimenOp(1)}
              sx={{ color: 'white', p: 0.2 }}>
              <Add sx={{ fontSize: '0.8rem' }} />
            </IconButton>
          </Box>

          <Button size="small" color="inherit" variant="outlined"
            onClick={() => alert('アレルギーチェック機能は電子カルテ連携後に実装予定です')}
            startIcon={<Warning sx={{ fontSize: '0.85rem !important' }} />}
            sx={btnSx}>アレルギーチェック</Button>

          {/* 採血情報ボタン（任意タイミング手動DWH取得） */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Button size="small" color="inherit" variant="outlined"
              onClick={() => syncBlood(selectedDate)}
              disabled={syncingBlood}
              startIcon={syncingBlood
                ? <CircularProgress size={10} color="inherit" />
                : <InvertColors sx={{ fontSize: '0.85rem !important' }} />}
              sx={btnSx}>採血情報</Button>
            {bloodSyncedAt && (
              <Typography sx={{ fontSize: '0.52rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.1 }}>
                {bloodSyncedAt}
              </Typography>
            )}
          </Box>

          {/* 自動取込：1分/5分チェックボックス */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25,
            border: '1px solid rgba(255,255,255,0.4)', borderRadius: 0.5, px: 0.5, py: 0.2 }}>
            <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.8)', mr: 0.25 }}>自動</Typography>
            <FormControlLabel
              control={
                <Checkbox size="small" checked={autoBlood1}
                  onChange={e => { setAutoBlood1(e.target.checked); if (e.target.checked) setAutoBlood5(false); }}
                  sx={{ p: 0, color: 'rgba(255,255,255,0.7)', '&.Mui-checked': { color: '#f39c12' } }} />
              }
              label={<Typography sx={{ fontSize: '0.6rem', color: '#fff' }}>1分</Typography>}
              sx={{ ml: 0, mr: 0.25 }} />
            <FormControlLabel
              control={
                <Checkbox size="small" checked={autoBlood5}
                  onChange={e => { setAutoBlood5(e.target.checked); if (e.target.checked) setAutoBlood1(false); }}
                  sx={{ p: 0, color: 'rgba(255,255,255,0.7)', '&.Mui-checked': { color: '#f39c12' } }} />
              }
              label={<Typography sx={{ fontSize: '0.6rem', color: '#fff' }}>5分</Typography>}
              sx={{ ml: 0 }} />
          </Box>

          <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>{user?.displayName}</Typography>
          <Button color="inherit" size="small" onClick={logout}
            sx={{ fontSize: '0.72rem', display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 0, lineHeight: 1.2, py: 0.25, minWidth: 0, px: 0.75 }}>
            ログアウト
            <Logout sx={{ fontSize: '1rem', mt: 0.25 }} />
          </Button>
        </Toolbar>
      </AppBar>

      {/* 印刷用タイトル */}
      <Box className="print-only" sx={{ textAlign: 'center', py: '2mm' }}>
        <Typography sx={{ fontSize: '11pt', fontWeight: 'bold' }}>外来化学療法センター 当日患者一覧</Typography>
        <Typography sx={{ fontSize: '9pt' }}>{dateLabel}</Typography>
      </Box>

      {/* ── メイン ── */}
      <Box sx={{ p: 0.75, overflowX: 'auto' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>
        ) : (
          <Paper elevation={1}>
            <Table size="small" sx={{ borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 800 }}>
              <colgroup>
                <col style={{ width: colWidths.time }} />
                <col style={{ width: colWidths.dept }} />
                <col style={{ width: colWidths.patient }} />
                <col style={{ width: colWidths.regimen }} />
                <col style={{ width: colWidths.presc }} />
                <col style={{ width: colWidths.inj }} />
                {/* 採血 5列 */}
                <col style={{ width: colWidths.blood }} />
                <col style={{ width: colWidths.blood }} />
                <col style={{ width: colWidths.blood }} />
                <col style={{ width: colWidths.blood }} />
                <col style={{ width: colWidths.blood }} />
                <col className="status-col" style={{ width: colWidths.status }} />
                <col style={{ width: colWidths.memo }} />
              </colgroup>
              <TableHead>
                <TableRow sx={{ bgcolor: '#27ae60' }}>
                  {([
                    ['time',    '予定時間',       'center'],
                    ['dept',    '診療科\n医師',    'left'],
                    ['patient', '実施予定患者',    'left'],
                    ['regimen', 'レジメン',        'left'],
                    ['presc',   '緊急処方\n（前回）', 'left'],
                    ['inj',     '注射情報\n(Bis/VB12)', 'left'],
                  ] as [ColKey, string, string][]).map(([key, label, align]) => (
                    <TableCell key={key} sx={{
                      ...cellSx, color: '#fff', fontWeight: 'bold', fontSize: '0.78rem',
                      textAlign: align as 'left'|'center', position: 'relative', overflow: 'hidden',
                      whiteSpace: 'pre-wrap',
                    }}>
                      {label}
                      <span className="rh no-print" onMouseDown={e => startResize(key, e)} />
                    </TableCell>
                  ))}
                  <TableCell colSpan={5} sx={{ ...cellSx, color: '#fff', fontWeight: 'bold', textAlign: 'center', fontSize: '0.78rem', position: 'relative' }}>
                    採血情報（CTCAE v5.0）<br/>
                    <span style={{ color: '#90caf9' }}>■</span>G1&nbsp;
                    <span style={{ color: '#ffe0b2' }}>■</span>G2&nbsp;
                    <span style={{ color: '#fff9c4' }}>■</span>G3&nbsp;
                    <span style={{ color: '#ffcdd2' }}>■</span>G4
                    <span className="rh no-print" onMouseDown={e => startResize('blood', e)} />
                  </TableCell>
                  <TableCell className="status-col" sx={{ ...cellSx, color: '#fff', fontWeight: 'bold', textAlign: 'center', fontSize: '0.78rem', position: 'relative' }}>
                    実施可否
                    <span className="rh no-print" onMouseDown={e => startResize('status', e)} />
                  </TableCell>
                  <TableCell sx={{ ...cellSx, color: '#fff', fontWeight: 'bold', fontSize: '0.78rem', position: 'relative' }}>
                    備考
                    <span className="rh no-print" onMouseDown={e => startResize('memo', e)} />
                  </TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {treatments.map((t) => {
                  const bg     = getRowBg(t);
                  const timeBg = getTimeBg(t.scheduled_time);
                  const surname = getSurname(t.furigana);
                  const isDup   = surname ? duplicateSurnames.has(surname) : false;
                  // 診察前面談対象診療科かどうか
                  const isPreConsultDept = preConsultDepts.includes(t.department ?? '');
                  // 算定可かどうか（0件=算定可）
                  const canClaimPreConsult = t.pre_consultation_this_month === 0;

                  return BLOOD_ROWS.map((rowFields, rowIdx) => {
                    const isLastRow = rowIdx === 2;
                    const bloodBorder = isLastRow ? '2px solid #888' : '1px solid #ddd';
                    const spanBorder  = '2px solid #888';

                    return (
                      <TableRow key={`${t.id}-${rowIdx}`} sx={{ bgcolor: bg }}>

                        {/* 予定時間 */}
                        {rowIdx === 0 && (
                          <TableCell rowSpan={3} sx={{
                            ...cellSx, verticalAlign: 'middle', textAlign: 'center',
                            bgcolor: t.status === 'pending' ? timeBg : bg,
                            fontWeight: 'bold', fontSize: '0.8rem',
                            borderBottom: spanBorder,
                          }}>
                            {t.scheduled_time ? t.scheduled_time.substring(0, 5) : ''}
                          </TableCell>
                        )}

                        {/* 診療科 / 医師 */}
                        {rowIdx === 0 && (
                          <TableCell rowSpan={3} sx={{ ...cellSx, verticalAlign: 'top', bgcolor: bg, borderBottom: spanBorder, width: 48 }}>
                            <Typography sx={{ fontSize: '0.65rem', color: '#1565c0', lineHeight: 1.2 }}>{t.department}</Typography>
                            <Typography sx={{ fontSize: '0.72rem', fontWeight: 'bold', lineHeight: 1.2 }}>{t.doctor}</Typography>
                          </TableCell>
                        )}

                        {/* 実施予定患者 */}
                        {rowIdx === 0 && (
                          <TableCell rowSpan={3} sx={{ ...cellSx, verticalAlign: 'top', bgcolor: bg, borderBottom: spanBorder }}>
                            <Typography sx={{ fontSize: '0.58rem', color: isDup ? '#c62828' : '#888', lineHeight: 1.1 }}>
                              {t.furigana || ''}　{isDup && '⚠'}
                            </Typography>
                            <Typography
                              sx={{
                                fontSize: '0.92rem', fontWeight: 'bold',
                                color: isDup ? '#c62828' : '#0d47a1',
                                cursor: 'pointer', textDecoration: 'underline',
                                '&:hover': { color: '#1565c0' },
                                lineHeight: 1.2,
                              }}
                              onClick={() => setInterventionTarget(t)}
                            >
                              {t.patient_name}
                            </Typography>
                            <Typography sx={{ fontSize: '0.65rem', color: '#666' }}>{t.patient_no}</Typography>
                          </TableCell>
                        )}

                        {/* レジメン */}
                        {rowIdx === 0 && (
                          <TableCell rowSpan={3} sx={{ ...cellSx, verticalAlign: 'top', bgcolor: bg, borderBottom: spanBorder }}>
                            <Typography sx={{ fontSize: '0.68rem', color: '#666' }}>{t.diagnosis}</Typography>
                            <Typography sx={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#000' }}>
                              {t.regimen_name}
                            </Typography>
                            <PrescChips value={t.prescription_type} />
                            {/* 注射/内服切替チップ */}
                            <Chip
                              className="no-print"
                              label={t.treatment_category ?? '注射'}
                              size="small"
                              onClick={() => handleCategoryToggle(t.id, t.treatment_category ?? '注射')}
                              sx={{
                                mt: 0.3,
                                height: 16,
                                fontSize: '0.6rem',
                                cursor: 'pointer',
                                bgcolor: (t.treatment_category ?? '注射') === '内服' ? '#f3e5f5' : '#e8f5e9',
                                color:   (t.treatment_category ?? '注射') === '内服' ? '#6a1b9a' : '#1b5e20',
                                border: `1px solid ${(t.treatment_category ?? '注射') === '内服' ? '#ab47bc' : '#43a047'}`,
                                '& .MuiChip-label': { px: 0.75 },
                              }}
                            />
                            {t.status !== 'pending' && (
                              <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
                                <Typography sx={{ fontSize: '0.75rem', fontWeight: 'bold', color: STATUS_COLOR[t.status], lineHeight: 1.4 }}>
                                  【{STATUS_LABEL[t.status]} {fmtTime(t.status_changed_at)}】
                                </Typography>
                                {t.status === 'done' && t.scheduled_time && (
                                  <Typography sx={{ fontSize: '0.72rem', color: '#333', lineHeight: 1.4 }}>
                                    【開始 {t.scheduled_time.substring(0, 5)}～】
                                  </Typography>
                                )}
                              </Box>
                            )}
                          </TableCell>
                        )}

                        {/* 前回の緊急処方情報 - 診察前面談付箋オーバーレイ付き */}
                        {rowIdx === 0 && (
                          <TableCell rowSpan={3} sx={{
                            ...cellSx, verticalAlign: 'top', bgcolor: bg, borderBottom: spanBorder,
                            position: 'relative', overflow: 'visible',
                          }}>
                            {t.prescription_type === '緊急' && t.prescription_info ? (
                              <Typography sx={{ fontSize: '0.65rem', whiteSpace: 'pre-wrap', color: '#b71c1c' }}>
                                {t.prescription_info}
                              </Typography>
                            ) : t.prescription_type === '緊急' ? (
                              <Typography sx={{ fontSize: '0.6rem', color: '#999', fontStyle: 'italic' }}>（取込待ち）</Typography>
                            ) : null}

                            {/* 診察前面談 付箋オーバーレイ（「前回の緊急処方情報」+「注射情報」の2列スパン） */}
                            {isPreConsultDept && (
                              <Box sx={{
                                position: 'absolute',
                                top: 3,
                                left: 3,
                                right: -63,
                                bottom: 3,
                                bgcolor: canClaimPreConsult
                                  ? 'rgba(255,152,0,0.93)'
                                  : 'rgba(135,206,250,0.90)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexDirection: 'column',
                                zIndex: 10,
                                borderRadius: '4px',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.28)',
                                border: `2px solid ${canClaimPreConsult ? '#e65100' : '#0288d1'}`,
                                pointerEvents: 'none',
                              }}>
                                <Typography sx={{
                                  fontSize: '0.9rem',
                                  fontWeight: 'bold',
                                  color: canClaimPreConsult ? '#4a1500' : '#01579b',
                                  textAlign: 'center',
                                  lineHeight: 1.5,
                                  letterSpacing: '-0.01em',
                                }}>
                                  診察前面談<br/>
                                  {canClaimPreConsult ? '（算定可）' : '（算定不可）'}
                                </Typography>
                              </Box>
                            )}
                          </TableCell>
                        )}

                        {/* 注射情報（Bis剤・VB12製剤）*/}
                        {rowIdx === 0 && (
                          <TableCell rowSpan={3} sx={{
                            ...cellSx, verticalAlign: 'top', bgcolor: bg, borderBottom: spanBorder,
                            position: 'relative', zIndex: 0,
                          }} />
                        )}

                        {/* 採血結果（5列）*/}
                        {rowFields.map(f => {
                          const rawVal = t[f.key];
                          const numVal = rawVal != null ? Number(rawVal) : null;
                          const grade  = numVal != null ? getGrade(f.key, numVal) : 0;
                          return (
                            <TableCell key={f.key} sx={{
                              border: '1px solid #ddd',
                              borderBottom: bloodBorder,
                              p: '1px 3px',
                              bgcolor: grade > 0 ? GRADE_BG[grade] : bg,
                              verticalAlign: 'middle',
                              overflow: 'hidden',
                            }}>
                              <Typography sx={{
                                fontSize: '0.6rem',
                                fontWeight: grade > 0 ? 'bold' : 'normal',
                                whiteSpace: 'nowrap',
                              }}>
                                <span style={{ color: '#888' }}>{f.label}: </span>
                                <span style={{ color: grade > 0 ? '#333' : '#555' }}>
                                  {numVal != null ? fmtBlood(numVal) : '-'}
                                </span>
                              </Typography>
                            </TableCell>
                          );
                        })}

                        {/* 実施可否ボタン */}
                        {rowIdx === 0 && (
                          <TableCell rowSpan={3} className="status-col"
                            sx={{ ...cellSx, verticalAlign: 'middle', textAlign: 'center', bgcolor: bg, borderBottom: spanBorder }}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3 }}>
                              {(['done', 'changed', 'cancelled'] as TreatmentStatus[]).map(st => {
                                const isActive = t.status === st;
                                const color = st === 'done' ? 'primary' : st === 'changed' ? 'warning' : 'error';
                                const label = st === 'done' ? '実施' : st === 'changed' ? '変更' : '中止';
                                return (
                                  <Button key={st} size="small"
                                    variant={isActive ? 'contained' : 'outlined'}
                                    color={color}
                                    onClick={() => handleStatusClick(t.id, st)}
                                    sx={{
                                      fontSize: isActive ? '0.72rem' : '0.6rem',
                                      py: isActive ? 0.3 : 0.1,
                                      minWidth: isActive ? 52 : 42,
                                      lineHeight: 1.4,
                                      fontWeight: isActive ? 'bold' : 'normal',
                                    }}>
                                    {label}
                                  </Button>
                                );
                              })}
                            </Box>
                          </TableCell>
                        )}

                        {/* 備考 + 追記ボタン */}
                        {rowIdx === 0 && (
                          <TableCell rowSpan={3} sx={{ ...cellSx, verticalAlign: 'top', bgcolor: bg, borderBottom: spanBorder }}>
                            <Typography sx={{ fontSize: '0.68rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                              {t.memo ?? ''}
                            </Typography>
                            {t.status_note && (
                              <Typography sx={{
                                fontSize: '0.65rem', color: STATUS_COLOR[t.status],
                                fontStyle: 'italic', mt: 0.25, wordBreak: 'break-all',
                              }}>
                                [{STATUS_LABEL[t.status]}] {t.status_note}
                              </Typography>
                            )}
                            <Button className="no-print" size="small" variant="text"
                              onClick={() => setMemoDialog({ id: t.id, memo: t.memo ?? '' })}
                              sx={{ fontSize: '0.6rem', py: 0, mt: 0.25, minWidth: 0, color: '#555' }}>
                              追記
                            </Button>
                          </TableCell>
                        )}

                      </TableRow>
                    );
                  });
                })}
              </TableBody>
            </Table>
          </Paper>
        )}
      </Box>

      {/* 変更/中止 理由入力ダイアログ */}
      <Dialog open={!!dialog} onClose={() => setDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          {dialog?.status === 'changed' ? '変更' : '中止'}の理由
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.78rem', mb: 0.5, fontWeight: 'bold' }}>頻出理由：</Typography>
          <FormGroup row sx={{ mb: 1 }}>
            {QUICK_REASONS.map(r => (
              <FormControlLabel key={r}
                control={
                  <Checkbox size="small"
                    checked={dialog?.quickReasons.includes(r) ?? false}
                    onChange={e => setDialog(prev => prev ? {
                      ...prev,
                      quickReasons: e.target.checked
                        ? [...prev.quickReasons, r]
                        : prev.quickReasons.filter(x => x !== r),
                    } : null)} />
                }
                label={<Typography sx={{ fontSize: '0.78rem' }}>{r}</Typography>} />
            ))}
          </FormGroup>
          <TextField
            fullWidth multiline rows={2}
            label="その他・補足コメント"
            value={dialog?.note ?? ''}
            onChange={e => setDialog(prev => prev ? { ...prev, note: e.target.value } : null)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>キャンセル</Button>
          <Button variant="contained"
            color={dialog?.status === 'cancelled' ? 'error' : 'warning'}
            onClick={handleDialogConfirm}>確定</Button>
        </DialogActions>
      </Dialog>

      {/* 備考追記ダイアログ */}
      <Dialog open={!!memoDialog} onClose={() => setMemoDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>備考追記</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth multiline rows={4}
            label="備考"
            value={memoDialog?.memo ?? ''}
            onChange={e => setMemoDialog(prev => prev ? { ...prev, memo: e.target.value } : null)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMemoDialog(null)}>キャンセル</Button>
          <Button variant="contained" onClick={handleMemoSave}>保存</Button>
        </DialogActions>
      </Dialog>

      {/* 保存完了スナックバー */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.msg}
        </Alert>
      </Snackbar>

      {/* 介入記録モーダル: onSaved でリロード */}
      <InterventionModal
        open={!!interventionTarget}
        treatment={interventionTarget}
        onClose={() => setInterventionTarget(null)}
        onSaved={() => { setInterventionTarget(null); load(selectedDate); }}
      />
    </>
  );
}
