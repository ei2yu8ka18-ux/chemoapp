import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Button, Chip, CircularProgress,
  Tooltip, Alert, TextField, IconButton,
} from '@mui/material';
import { ChevronLeft, ChevronRight, Refresh } from '@mui/icons-material';
import api from '../services/api';

const API = '/regimen-check';

interface CalendarEntry {
  id: number;
  patient_id: number;
  regimen_id: number;
  treatment_date: string;
  cycle_no: number;
  status: string;       // planned / done / cancelled / null
  audit_status: string | null;  // 'audited' or null
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
  regimen_id: number;
  regimen_name: string;
}

// ステータスの表示記号
function statusSymbol(status: string | null, audit_status: string | null): string {
  if (!status || status === '') return '';
  if (status === 'planned' && audit_status === 'audited') return '◎';
  if (status === 'planned') return '○';
  if (status === 'done') return '●';
  if (status === 'cancelled') return '×';
  return '';
}

// ステータスの色
function statusColor(status: string | null, audit_status: string | null): string {
  if (status === 'planned' && audit_status === 'audited') return '#1565c0';
  if (status === 'planned') return '#1976d2';
  if (status === 'done') return '#2e7d32';
  if (status === 'cancelled') return '#c62828';
  return '#999';
}

// ステータス背景色
function statusBg(status: string | null, audit_status: string | null): string {
  if (status === 'planned' && audit_status === 'audited') return '#bbdefb';
  if (status === 'planned') return '#e3f2fd';
  if (status === 'done') return '#e8f5e9';
  if (status === 'cancelled') return '#ffebee';
  return 'transparent';
}

// 次のステータスへサイクル
function nextStatus(cur: string | null, audit: string | null): { status: string | null; audit_status: string | null } {
  if (!cur || cur === '') return { status: 'planned', audit_status: null };
  if (cur === 'planned' && !audit) return { status: 'planned', audit_status: 'audited' };
  if (cur === 'planned' && audit === 'audited') return { status: 'done', audit_status: null };
  if (cur === 'done') return { status: 'cancelled', audit_status: null };
  if (cur === 'cancelled') return { status: null, audit_status: null };
  return { status: null, audit_status: null };
}

// 日付ユーティリティ
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}
function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}
function parseDate(s: string): Date {
  return new Date(s + 'T00:00:00');
}
function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
}
// YYYY-MM-DD → MM/DD
function shortDate(s: string): string {
  return s.slice(5).replace('-', '/');
}
// 週の曜日判定（土: 6, 日: 0）
function dayOfWeek(s: string): number {
  return parseDate(s).getDay();
}

// 表示対象日付リストを生成
function generateDates(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = parseDate(from);
  const end = parseDate(to);
  while (cur <= end) {
    dates.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export default function RegimenCalendarPage() {
  const today = toDateStr(new Date());
  // デフォルト: 昨日〜2ヶ月先
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 1); return toDateStr(d);
  });
  const [toDate, setToDate] = useState(() => toDateStr(addMonths(new Date(), 2)));

  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [patientRows, setPatientRows] = useState<PatientRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // エントリのマップ: `${patient_id}-${regimen_id}-${date}` → entry
  const entryMap = useMemo(() => {
    const map = new Map<string, CalendarEntry>();
    entries.forEach(e => map.set(`${e.patient_id}-${e.regimen_id}-${e.treatment_date}`, e));
    return map;
  }, [entries]);

  // 表示日付リスト
  const dates = useMemo(() => generateDates(fromDate, toDate), [fromDate, toDate]);

  // データ取得
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

  // セルクリック → ステータスサイクル
  const handleCellClick = async (row: PatientRow, date: string) => {
    const key = `${row.patient_id}-${row.regimen_id}-${date}`;
    const existing = entryMap.get(key);
    const cur_status = existing?.status ?? null;
    const cur_audit = existing?.audit_status ?? null;
    const { status: newStatus, audit_status: newAudit } = nextStatus(cur_status, cur_audit);

    try {
      if (existing) {
        // 更新
        const res = await api.patch<CalendarEntry>(`${API}/calendar/${existing.id}`, {
          status: newStatus,
          audit_status: newAudit,
        });
        setEntries(prev => prev.map(e => e.id === existing.id ? res.data : e));
      } else if (newStatus) {
        // 新規作成
        const res = await api.post<CalendarEntry>(`${API}/calendar`, {
          patient_id: row.patient_id,
          regimen_id: row.regimen_id,
          treatment_date: date,
          status: newStatus,
          audit_status: newAudit,
        });
        setEntries(prev => [...prev, res.data]);
      }
    } catch {
      // 失敗時は再フェッチで同期
      fetchData();
    }
  };

  // 月移動
  const shiftMonth = (delta: number) => {
    const newFrom = addMonths(parseDate(fromDate), delta);
    const newTo = addMonths(parseDate(toDate), delta);
    setFromDate(toDateStr(newFrom));
    setToDate(toDateStr(newTo));
  };

  // 今月に戻す
  const goToToday = () => {
    setFromDate(toDateStr(addMonths(new Date(), -3)));
    setToDate(toDateStr(addMonths(new Date(), 1)));
  };

  // 列幅（日付の数が多い場合は縮小）
  const COL_W = dates.length > 60 ? 28 : dates.length > 30 ? 32 : 38;
  const PATIENT_COL_W = 180;

  // 月境界（日付ラベル行で月が変わる箇所）
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
          {[
            { sym: '○', label: '予定', color: '#1976d2', bg: '#e3f2fd' },
            { sym: '◎', label: '予定+監査済', color: '#1565c0', bg: '#bbdefb' },
            { sym: '●', label: '実施', color: '#2e7d32', bg: '#e8f5e9' },
            { sym: '×', label: '中止', color: '#c62828', bg: '#ffebee' },
          ].map(l => (
            <Box key={l.sym} sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
              <Box sx={{ width: 20, height: 20, bgcolor: l.bg, border: `1px solid ${l.color}`, borderRadius: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography sx={{ fontSize: '0.75rem', color: l.color, fontWeight: 'bold' }}>{l.sym}</Typography>
              </Box>
              <Typography variant="caption">{l.label}</Typography>
            </Box>
          ))}
          <Typography variant="caption" sx={{ color: '#888' }}>（クリックで変更: ○→◎→●→×→消去）</Typography>
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
                  // この月に属する日付数
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
                  const isSat = dow === 6;
                  const isSun = dow === 0;
                  const isToday = d === today;
                  return (
                    <th key={d} style={{
                      background: isToday ? '#fff176' : isSat ? '#e3f2fd' : isSun ? '#fce4ec' : '#ecf0f1',
                      fontSize: 9,
                      padding: '2px 1px',
                      textAlign: 'center',
                      color: isToday ? '#e65100' : isSat ? '#1565c0' : isSun ? '#c62828' : '#333',
                      fontWeight: isToday ? 'bold' : 'normal',
                      borderLeft: '1px solid #ddd',
                      borderBottom: '2px solid #bbb',
                      whiteSpace: 'nowrap',
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
                    データがありません。マイグレーション 010 を実行してテストデータを投入してください。
                  </td>
                </tr>
              )}
              {patientRows.map((row, ri) => {
                const isOdd = ri % 2 === 0;
                return (
                  <tr key={`${row.patient_id}-${row.regimen_id}`} style={{ background: isOdd ? '#fff' : '#f9f9fb' }}>
                    {/* 患者セル */}
                    <td style={{
                      position: 'sticky', left: 0, zIndex: 2,
                      background: isOdd ? '#fff' : '#f9f9fb',
                      borderRight: '2px solid #bbb',
                      borderBottom: '1px solid #e0e0e0',
                      padding: '4px 8px',
                      minWidth: PATIENT_COL_W,
                    }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#1a237e', lineHeight: 1.2 }}>
                        {row.patient_no} {row.patient_name}
                      </Typography>
                      <Typography sx={{ fontSize: '0.68rem', color: '#555', lineHeight: 1.2 }}>
                        {row.regimen_name}
                      </Typography>
                      <Typography sx={{ fontSize: '0.65rem', color: '#888' }}>
                        {row.department}
                      </Typography>
                    </td>
                    {/* 日付セル */}
                    {dates.map(d => {
                      const key = `${row.patient_id}-${row.regimen_id}-${d}`;
                      const entry = entryMap.get(key);
                      const sym = statusSymbol(entry?.status ?? null, entry?.audit_status ?? null);
                      const col = statusColor(entry?.status ?? null, entry?.audit_status ?? null);
                      const bg = statusBg(entry?.status ?? null, entry?.audit_status ?? null);
                      const dow = dayOfWeek(d);
                      const isToday = d === today;
                      const cellBg = entry ? bg : isToday ? '#fffde7' : dow === 6 ? '#fafcff' : dow === 0 ? '#fff5f5' : 'transparent';

                      return (
                        <td
                          key={d}
                          onClick={() => handleCellClick(row, d)}
                          style={{
                            background: cellBg,
                            borderLeft: isToday ? '1px solid #ffa000' : d.slice(8) === '01' ? '1px solid #bbb' : '1px solid #e8e8e8',
                            borderBottom: '1px solid #e8e8e8',
                            textAlign: 'center',
                            cursor: 'pointer',
                            padding: '1px',
                            height: 32,
                            userSelect: 'none',
                          }}
                        >
                          {sym ? (
                            <Tooltip
                              title={
                                entry
                                  ? `${entry.status === 'planned' ? '予定' : entry.status === 'done' ? '実施' : '中止'}${entry.audit_status === 'audited' ? '（監査済）' : ''}　${entry.notes || ''}`
                                  : ''
                              }
                              placement="top"
                              arrow
                            >
                              <Typography sx={{ fontSize: COL_W < 30 ? '0.75rem' : '0.85rem', color: col, fontWeight: 'bold', lineHeight: 1 }}>
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
          {[
            { label: '予定', status: 'planned', audit: null },
            { label: '監査済予定', status: 'planned', audit: 'audited' },
            { label: '実施', status: 'done', audit: null },
            { label: '中止', status: 'cancelled', audit: null },
          ].map(({ label, status, audit }) => {
            const count = entries.filter(e =>
              e.status === status &&
              (audit === null ? e.audit_status === null : e.audit_status === audit)
            ).length;
            return (
              <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Chip
                  label={`${label}: ${count}件`}
                  size="small"
                  sx={{
                    fontSize: '0.7rem',
                    bgcolor: statusBg(status, audit),
                    color: statusColor(status, audit),
                    border: `1px solid ${statusColor(status, audit)}`,
                  }}
                />
              </Box>
            );
          })}
          <Typography variant="caption" sx={{ color: '#888', alignSelf: 'center' }}>
            表示期間: {fromDate} 〜 {toDate}（{totalDays}日）/ {patientRows.length}患者×レジメン
          </Typography>
        </Box>
      )}
    </Box>
  );
}
