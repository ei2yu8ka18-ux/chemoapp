import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box, Typography, Button, Chip, CircularProgress,
  Tooltip, Alert, TextField, IconButton,
} from '@mui/material';
import { ChevronLeft, ChevronRight, Refresh, Edit as EditIcon, Check as CheckIcon, Close as CloseIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const API = '/regimen-check';

interface CalendarEntry {
  id: number | null;
  patient_id: number;
  regimen_id: number;
  treatment_date: string;
  cycle_no: number | null;
  status: string | null;   // planned / done / changed / cancelled / null
  audit_status: string | null;
  notes: string | null;
  patient_no: string;
  patient_name: string;
  department: string;
  regimen_name: string;
}

interface PatientRow {
  patient_id: number;
  patient_no: string;
  patient_name: string;
  department: string;
  regimen_name: string;
  regimen_ids: number[];  // (patient_id, regimen_name) でグループ化した全regimen_id
}

// ── ステータス定義 ────────────────────────────────────────────
const STATUS_DEF: Record<string, { sym: string; label: string; color: string; bg: string }> = {
  planned:   { sym: '○', label: '予定',  color: '#1565c0', bg: '#e3f2fd' },
  done:      { sym: '●', label: '実施',  color: '#2e7d32', bg: '#e8f5e9' },
  changed:   { sym: '▲', label: '変更',  color: '#e65100', bg: '#fff3e0' },
  cancelled: { sym: '×', label: '中止',  color: '#c62828', bg: '#ffebee' },
};

// クリックサイクル: planned → done → changed → cancelled → planned（ループ、消去なし）
const STATUS_CYCLE: string[] = ['planned', 'done', 'changed', 'cancelled'];

function nextStatus(cur: string | null): string {
  if (!cur) return 'planned';
  const idx = STATUS_CYCLE.indexOf(cur);
  return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
}

function statusSym(status: string | null) { return status ? (STATUS_DEF[status]?.sym ?? '') : ''; }
function statusColor(status: string | null) { return status ? (STATUS_DEF[status]?.color ?? '#999') : '#999'; }
function statusBg(status: string | null) { return status ? (STATUS_DEF[status]?.bg ?? 'transparent') : 'transparent'; }

// ── 日付ユーティリティ ────────────────────────────────────────
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function parseDate(s: string): Date { return new Date(s + 'T00:00:00'); }
function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
}
function shortDate(s: string): string { return s.slice(5).replace('-', '/'); }
function dayOfWeek(s: string): number { return parseDate(s).getDay(); }

function generateDates(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = parseDate(from);
  const end = parseDate(to);
  while (cur <= end) { dates.push(toDateStr(cur)); cur.setDate(cur.getDate() + 1); }
  return dates;
}

// ── レジメン名インライン編集コンポーネント ────────────────────
function RegimenNameCell({
  row, onRename,
}: {
  row: PatientRow;
  onRename: (regimenIds: number[], newName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.regimen_name);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft(row.regimen_name);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };
  const cancel = () => { setEditing(false); setDraft(row.regimen_name); };
  const save = () => {
    if (draft.trim() && draft.trim() !== row.regimen_name) {
      onRename(row.regimen_ids, draft.trim());
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }} onClick={e => e.stopPropagation()}>
        <TextField
          inputRef={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
          size="small"
          sx={{ width: 130, '& .MuiInputBase-input': { fontSize: '0.72rem', py: 0.2, px: 0.5 } }}
        />
        <IconButton size="small" color="success" onClick={save} sx={{ p: 0.2 }}><CheckIcon sx={{ fontSize: 14 }} /></IconButton>
        <IconButton size="small" onClick={cancel} sx={{ p: 0.2 }}><CloseIcon sx={{ fontSize: 14 }} /></IconButton>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3, cursor: 'default' }}>
      <Typography sx={{ fontSize: '0.70rem', color: '#444', lineHeight: 1.3, flex: 1 }}>
        {row.regimen_name}
      </Typography>
      <Tooltip title="レジメン名を編集" placement="right">
        <IconButton size="small" onClick={startEdit} sx={{ p: 0.1, opacity: 0.4, '&:hover': { opacity: 1 } }}>
          <EditIcon sx={{ fontSize: 11 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

// ── メインコンポーネント ──────────────────────────────────────
export default function RegimenCalendarPage() {
  const today = toDateStr(new Date());
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 1); return toDateStr(d);
  });
  const [toDate, setToDate] = useState(() => toDateStr(addMonths(new Date(), 2)));

  const navigate = useNavigate();

  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [patientRows, setPatientRows] = useState<PatientRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // entryMap: `${patient_id}-${regimen_name}-${date}` → entry
  // treatment_date は DB から "2026-03-13T00:00:00.000Z" 形式で来る場合があるので先頭10文字に正規化
  const entryMap = useMemo(() => {
    const map = new Map<string, CalendarEntry>();
    entries.forEach(e => {
      const dateStr = String(e.treatment_date).slice(0, 10);
      const key = `${e.patient_id}-${e.regimen_name}-${dateStr}`;
      // 同じキーなら manual (id あり) を優先
      if (!map.has(key) || e.id !== null) map.set(key, e);
    });
    return map;
  }, [entries]);

  const dates = useMemo(() => generateDates(fromDate, toDate), [fromDate, toDate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [calRes, rowRes] = await Promise.all([
        api.get<CalendarEntry[]>(`${API}/calendar`, { params: { from: fromDate, to: toDate } }),
        api.get<PatientRow[]>(`${API}/calendar/patients`),
      ]);
      setEntries(calRes.data);
      setPatientRows(rowRes.data);
    } catch {
      setError('データ取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // セルクリック → ステータスサイクル（既存エントリのみ変更可、新規作成不可）
  const handleCellClick = async (row: PatientRow, date: string) => {
    const key = `${row.patient_id}-${row.regimen_name}-${date}`;
    const existing = entryMap.get(key);
    // 既存エントリがない日付はクリック不可（新規作成しない）
    if (!existing) return;

    const curStatus = existing?.status ?? null;
    const newStatus = nextStatus(curStatus);
    const regimenId = existing?.regimen_id ?? row.regimen_ids[0];

    try {
      if (existing.id) {
        // 既存レコード更新（audit_status は触らない）
        const res = await api.patch<CalendarEntry>(`${API}/calendar/${existing.id}`, {
          status: newStatus,
        });
        const updated = { ...res.data, patient_no: row.patient_no, patient_name: row.patient_name, department: row.department, regimen_name: row.regimen_name };
        setEntries(prev => prev.map(e => (e.id === existing.id ? updated : e)));
      } else {
        // auto-entry (scheduled_treatments 由来) → DB に保存
        const res = await api.post<CalendarEntry>(`${API}/calendar`, {
          patient_id: row.patient_id,
          regimen_id: regimenId,
          treatment_date: date,
          status: newStatus,
        });
        const added = { ...res.data, patient_no: row.patient_no, patient_name: row.patient_name, department: row.department, regimen_name: row.regimen_name };
        setEntries(prev => [...prev.filter(e => !(e.patient_id === row.patient_id && e.regimen_name === row.regimen_name && e.treatment_date === date && e.id === null)), added]);
      }
    } catch {
      fetchData();
    }
  };

  // レジメン名変更
  const handleRename = async (regimenIds: number[], newName: string) => {
    try {
      // 全 regimen_id を更新
      await Promise.all(regimenIds.map(id =>
        api.patch(`${API}/regimens/${id}`, { name: newName })
      ));
      // patientRows と entries を更新
      setPatientRows(prev => prev.map(r =>
        regimenIds.some(id => r.regimen_ids.includes(id))
          ? { ...r, regimen_name: newName }
          : r
      ));
      setEntries(prev => prev.map(e =>
        regimenIds.includes(e.regimen_id)
          ? { ...e, regimen_name: newName }
          : e
      ));
    } catch {
      alert('レジメン名の変更に失敗しました');
    }
  };

  // 右クリック → レジメン監査ページに遷移（患者を自動選択）
  const handleContextMenu = useCallback((e: React.MouseEvent, row: PatientRow) => {
    e.preventDefault();
    navigate('/regimen', { state: { patientId: row.patient_id } });
  }, [navigate]);

  const shiftMonth = (delta: number) => {
    setFromDate(toDateStr(addMonths(parseDate(fromDate), delta)));
    setToDate(toDateStr(addMonths(parseDate(toDate), delta)));
  };

  const goToToday = () => {
    setFromDate(toDateStr(addMonths(new Date(), -1)));
    setToDate(toDateStr(addMonths(new Date(), 2)));
  };

  const COL_W = dates.length > 60 ? 28 : dates.length > 30 ? 32 : 38;
  const PATIENT_COL_W = 200;

  const monthBoundaries = useMemo(() => {
    const bounds: { date: string; month: string }[] = [];
    let curMonth = '';
    dates.forEach(d => {
      const m = d.slice(0, 7);
      if (m !== curMonth) { bounds.push({ date: d, month: m }); curMonth = m; }
    });
    return bounds;
  }, [dates]);

  const totalDays = daysBetween(fromDate, toDate) + 1;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 0px)', overflow: 'hidden', p: 1 }}>

      {/* ── ヘッダー ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mr: 1 }}>レジメンカレンダー</Typography>

        <IconButton size="small" onClick={() => shiftMonth(-1)}><ChevronLeft /></IconButton>
        <TextField
          type="date" size="small" label="開始" value={fromDate}
          onChange={e => setFromDate(e.target.value)}
          sx={{ width: 150, '& .MuiInputBase-input': { fontSize: '0.78rem', py: 0.5 } }}
          InputLabelProps={{ shrink: true }}
        />
        <Typography variant="body2">〜</Typography>
        <TextField
          type="date" size="small" label="終了" value={toDate}
          onChange={e => setToDate(e.target.value)}
          sx={{ width: 150, '& .MuiInputBase-input': { fontSize: '0.78rem', py: 0.5 } }}
          InputLabelProps={{ shrink: true }}
        />
        <IconButton size="small" onClick={() => shiftMonth(1)}><ChevronRight /></IconButton>
        <Button size="small" variant="outlined" onClick={goToToday}>今月</Button>
        <IconButton size="small" onClick={fetchData}><Refresh /></IconButton>

        <Box sx={{ ml: 'auto', display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="caption" sx={{ color: '#555' }}>凡例：</Typography>
          {Object.entries(STATUS_DEF).map(([, def]) => (
            <Box key={def.sym} sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
              <Box sx={{ width: 20, height: 20, bgcolor: def.bg, border: `1px solid ${def.color}`, borderRadius: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography sx={{ fontSize: '0.75rem', color: def.color, fontWeight: 'bold' }}>{def.sym}</Typography>
              </Box>
              <Typography variant="caption">{def.label}</Typography>
            </Box>
          ))}
          <Typography variant="caption" sx={{ color: '#888' }}>（左クリック: 既存エントリのみ ○→●→▲→×→○　右クリック: 監査記録）</Typography>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}><CircularProgress size={24} /></Box>}

      {/* ── カレンダーグリッド ── */}
      {!loading && (
        <Box sx={{ flexGrow: 1, overflow: 'auto', border: '1px solid #ccc', borderRadius: 1 }}>
          <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: PATIENT_COL_W + COL_W * dates.length }}>
            <colgroup>
              <col style={{ width: PATIENT_COL_W }} />
              {dates.map(d => <col key={d} style={{ width: COL_W }} />)}
            </colgroup>
            <thead>
              {/* 月ラベル行 */}
              <tr style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <th style={{
                  position: 'sticky', left: 0, zIndex: 11, background: '#1c2833', color: '#fff',
                  fontSize: 11, padding: '4px 8px', textAlign: 'left', borderRight: '2px solid #555',
                }}>
                  患者 / レジメン
                </th>
                {monthBoundaries.map(({ date, month }) => {
                  const cnt = dates.filter(d => d.startsWith(month)).length;
                  return (
                    <th key={date} colSpan={cnt} style={{
                      background: '#2c3e50', color: '#ecf0f1',
                      fontSize: 11, padding: '3px 4px', textAlign: 'center',
                      borderLeft: '1px solid #555', borderBottom: '1px solid #888',
                    }}>
                      {month.replace('-', '年') + '月'}
                    </th>
                  );
                })}
              </tr>
              {/* 日付ラベル行 */}
              <tr style={{ position: 'sticky', top: 26, zIndex: 10 }}>
                <th style={{
                  position: 'sticky', left: 0, zIndex: 11, background: '#ecf0f1',
                  fontSize: 10, padding: '2px 8px', borderRight: '2px solid #bbb', borderBottom: '2px solid #bbb',
                }} />
                {dates.map(d => {
                  const dow = dayOfWeek(d);
                  const isSat = dow === 6, isSun = dow === 0, isToday = d === today;
                  return (
                    <th key={d} style={{
                      background: isToday ? '#fff176' : isSat ? '#e3f2fd' : isSun ? '#fce4ec' : '#ecf0f1',
                      fontSize: 9, padding: '2px 1px', textAlign: 'center',
                      color: isToday ? '#e65100' : isSat ? '#1565c0' : isSun ? '#c62828' : '#333',
                      fontWeight: isToday ? 'bold' : 'normal',
                      borderLeft: '1px solid #ddd', borderBottom: '2px solid #bbb', whiteSpace: 'nowrap',
                    }}>
                      {shortDate(d)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {patientRows.length === 0 && (
                <tr>
                  <td colSpan={dates.length + 1} style={{ padding: 24, textAlign: 'center', color: '#888', fontSize: 13 }}>
                    データがありません
                  </td>
                </tr>
              )}
              {patientRows.map((row, ri) => {
                const isOdd = ri % 2 === 0;
                const rowBg = isOdd ? '#fff' : '#f9f9fb';
                return (
                  <tr key={`${row.patient_id}-${row.regimen_name}`} style={{ background: rowBg }}>
                    {/* 患者セル */}
                    <td style={{
                      position: 'sticky', left: 0, zIndex: 2,
                      background: rowBg,
                      borderRight: '2px solid #bbb',
                      borderBottom: '1px solid #e0e0e0',
                      padding: '4px 8px',
                      minWidth: PATIENT_COL_W,
                    }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#1a237e', lineHeight: 1.3 }}>
                        {row.patient_no}　{row.patient_name}
                      </Typography>
                      <RegimenNameCell row={row} onRename={handleRename} />
                      <Typography sx={{ fontSize: '0.65rem', color: '#888' }}>
                        {row.department}
                      </Typography>
                    </td>
                    {/* 日付セル */}
                    {dates.map(d => {
                      const key = `${row.patient_id}-${row.regimen_name}-${d}`;
                      const entry = entryMap.get(key);
                      const sym = statusSym(entry?.status ?? null);
                      const col = statusColor(entry?.status ?? null);
                      const bg = statusBg(entry?.status ?? null);
                      const dow = dayOfWeek(d);
                      const isToday = d === today;
                      const cellBg = entry ? bg : isToday ? '#fffde7' : dow === 6 ? '#fafcff' : dow === 0 ? '#fff5f5' : 'transparent';

                      return (
                        <td
                          key={d}
                          onClick={() => handleCellClick(row, d)}
                          onContextMenu={e => handleContextMenu(e, row)}
                          style={{
                            background: cellBg,
                            borderLeft: isToday ? '1px solid #ffa000' : d.slice(8) === '01' ? '1px solid #bbb' : '1px solid #e8e8e8',
                            borderBottom: '1px solid #e8e8e8',
                            textAlign: 'center',
                            cursor: entry ? 'pointer' : 'default',
                            padding: '1px',
                            height: 32,
                            userSelect: 'none',
                          }}
                        >
                          {sym ? (
                            <Tooltip
                              title={entry ? `${STATUS_DEF[entry.status!]?.label ?? ''}${entry.notes ? '　' + entry.notes : ''}` : ''}
                              placement="top"
                              arrow
                            >
                              <Typography sx={{ fontSize: COL_W < 30 ? '0.75rem' : '0.88rem', color: col, fontWeight: 'bold', lineHeight: 1 }}>
                                {sym}
                              </Typography>
                            </Tooltip>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Box>
      )}

      {/* 統計サマリー */}
      {!loading && entries.length > 0 && (
        <Box sx={{ mt: 0.5, display: 'flex', gap: 2, flexWrap: 'wrap', px: 1 }}>
          {Object.entries(STATUS_DEF).map(([status, def]) => {
            const count = entries.filter(e => e.status === status).length;
            return (
              <Box key={status} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Chip
                  label={`${def.label}: ${count}件`}
                  size="small"
                  sx={{ fontSize: '0.7rem', bgcolor: def.bg, color: def.color, border: `1px solid ${def.color}` }}
                />
              </Box>
            );
          })}
          <Typography variant="caption" sx={{ color: '#888', alignSelf: 'center' }}>
            表示期間: {fromDate} 〜 {toDate}（{totalDays}日）/ {patientRows.length}行
          </Typography>
        </Box>
      )}
    </Box>
  );
}
