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
  regimen_ids: number[];  // (patient_id, regimen_name) 縺ｧ繧ｰ繝ｫ繝ｼ繝怜喧縺励◆蜈ｨregimen_id
}

// 笏笏 繧ｹ繝・・繧ｿ繧ｹ螳夂ｾｩ 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
const STATUS_DEF: Record<string, { sym: string; label: string; color: string; bg: string }> = {
  planned:   { sym: '\u25CB', label: '\u4E88\u5B9A', color: '#1565c0', bg: '#e3f2fd' },
  done:      { sym: '\u25CF', label: '\u5B9F\u65BD', color: '#2e7d32', bg: '#e8f5e9' },
  changed:   { sym: '\u25B3', label: '\u5909\u66F4', color: '#e65100', bg: '#fff3e0' },
  cancelled: { sym: '\u00D7', label: '\u4E2D\u6B62', color: '#c62828', bg: '#ffebee' },
};
const PLANNED_MARK_DEF = {
  audited: { sym: '\u25CB\u6E08', label: '\u4E88\u5B9A(\u76E3\u67FB\u6E08)', color: '#1565c0', bg: '#e3f2fd' },
  unaudited: { sym: '\u25CB\u672A', label: '\u4E88\u5B9A(\u672A\u76E3\u67FB)', color: '#c62828', bg: '#ffebee' },
  doubt: { sym: '\u25CB\u7591', label: '\u4E88\u5B9A(\u7591\u7FA9\u4E2D)', color: '#e65100', bg: '#fff3e0' },
};

function isPlannedStatus(status: string | null): boolean {
  return !status || status === 'planned';
}

function statusMarkOf(entry: CalendarEntry) {
  const status = entry.status ?? 'planned';
  if (!isPlannedStatus(status)) return STATUS_DEF[status] ?? STATUS_DEF.planned;
  if (entry.audit_status === 'audited') return PLANNED_MARK_DEF.audited;
  if (entry.audit_status === 'doubt') return PLANNED_MARK_DEF.doubt;
  return PLANNED_MARK_DEF.unaudited;
}

// 笏笏 譌･莉倥Θ繝ｼ繝・ぅ繝ｪ繝・ぅ 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
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

// 笏笏 繝ｬ繧ｸ繝｡繝ｳ蜷阪う繝ｳ繝ｩ繧､繝ｳ邱ｨ髮・さ繝ｳ繝昴・繝阪Φ繝・笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
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

// 笏笏 繝｡繧､繝ｳ繧ｳ繝ｳ繝昴・繝阪Φ繝・笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
export default function RegimenCalendarPage() {
  const today = toDateStr(new Date());
  const [patientIdFilter, setPatientIdFilter] = useState('');
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 1); return toDateStr(d);
  });
  const [toDate, setToDate] = useState(() => toDateStr(addMonths(new Date(), 2)));

  const navigate = useNavigate();

  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [patientRows, setPatientRows] = useState<PatientRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // entryMap: `${patient_id}-${regimen_name}-${date}` 竊・entry
  // treatment_date 縺ｯ DB 縺九ｉ "2026-03-13T00:00:00.000Z" 蠖｢蠑上〒譚･繧句ｴ蜷医′縺ゅｋ縺ｮ縺ｧ蜈磯ｭ10譁・ｭ励↓豁｣隕丞喧
  const entryMap = useMemo(() => {
    const map = new Map<string, CalendarEntry>();
    entries.forEach(e => {
      const dateStr = String(e.treatment_date).slice(0, 10);
      const key = `${e.patient_id}-${e.regimen_name}-${dateStr}`;
      // 蜷後§繧ｭ繝ｼ縺ｪ繧・manual (id 縺ゅｊ) 繧貞━蜈・
      if (!map.has(key) || e.id !== null) map.set(key, e);
    });
    return map;
  }, [entries]);

  const dates = useMemo(() => generateDates(fromDate, toDate), [fromDate, toDate]);
  const filteredPatientRows = useMemo(() => {
    const q = patientIdFilter.trim();
    if (!q) return patientRows;
    return patientRows.filter(row =>
      row.patient_no.includes(q)
      || String(row.patient_id).includes(q)
      || row.patient_name.includes(q)
    );
  }, [patientRows, patientIdFilter]);

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
      setError('繝・・繧ｿ蜿門ｾ励↓螟ｱ謨励＠縺ｾ縺励◆');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 繧ｻ繝ｫ繧ｯ繝ｪ繝・け 竊・繧ｹ繝・・繧ｿ繧ｹ繧ｵ繧､繧ｯ繝ｫ・域里蟄倥お繝ｳ繝医Μ縺ｮ縺ｿ螟画峩蜿ｯ縲∵眠隕丈ｽ懈・荳榊庄・・
  const handleCellClick = useCallback((row: PatientRow, date: string) => {
    const key = `${row.patient_id}-${row.regimen_name}-${date}`;
    const existing = entryMap.get(key);
    if (!existing) return;
    navigate('/regimen', { state: { patientId: row.patient_id } });
  }, [entryMap, navigate]);

  // 繝ｬ繧ｸ繝｡繝ｳ蜷榊､画峩
  const handleRename = async (regimenIds: number[], newName: string) => {
    try {
      // 蜈ｨ regimen_id 繧呈峩譁ｰ
      await Promise.all(regimenIds.map(id =>
        api.patch(`${API}/regimens/${id}`, { name: newName })
      ));
      // patientRows 縺ｨ entries 繧呈峩譁ｰ
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
      alert('繝ｬ繧ｸ繝｡繝ｳ蜷阪・螟画峩縺ｫ螟ｱ謨励＠縺ｾ縺励◆');
    }
  };

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

      {/* 笏笏 繝倥ャ繝繝ｼ 笏笏 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mr: 1 }}>繝ｬ繧ｸ繝｡繝ｳ繧ｫ繝ｬ繝ｳ繝繝ｼ</Typography>

        <IconButton size="small" onClick={() => shiftMonth(-1)}><ChevronLeft /></IconButton>
        <TextField
          type="date" size="small" label="開始"
          onChange={e => setFromDate(e.target.value)}
          sx={{ width: 150, '& .MuiInputBase-input': { fontSize: '0.78rem', py: 0.5 } }}
          InputLabelProps={{ shrink: true }}
        />
        <Typography variant="body2">〜</Typography>
        <TextField
          type="date" size="small" label="終了"
          onChange={e => setToDate(e.target.value)}
          sx={{ width: 150, '& .MuiInputBase-input': { fontSize: '0.78rem', py: 0.5 } }}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          size="small"
          label="謔｣閠・D讀懃ｴ｢"
          value={patientIdFilter}
          onChange={e => setPatientIdFilter(e.target.value)}
          placeholder="謔｣閠・分蜿ｷ/ID/豌丞錐"
          sx={{ width: 170, '& .MuiInputBase-input': { fontSize: '0.78rem', py: 0.5 } }}
        />
        <IconButton size="small" onClick={() => shiftMonth(1)}><ChevronRight /></IconButton>
        <Button size="small" variant="outlined" onClick={goToToday}>莉頑怦</Button>
        <IconButton size="small" onClick={fetchData}><Refresh /></IconButton>

        <Box sx={{ ml: 'auto', display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="caption" sx={{ color: '#555' }}>凡例:</Typography>
          {[
            PLANNED_MARK_DEF.unaudited,
            PLANNED_MARK_DEF.audited,
            STATUS_DEF.done,
            STATUS_DEF.cancelled,
            STATUS_DEF.changed,
          ].map((def) => (
            <Box key={def.sym} sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
              <Box sx={{ width: 20, height: 20, bgcolor: def.bg, border: `1px solid ${def.color}`, borderRadius: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography sx={{ fontSize: '0.75rem', color: def.color, fontWeight: 'bold' }}>{def.sym}</Typography>
              </Box>
              <Typography variant="caption">{def.label}</Typography>
            </Box>
          ))}
          <Typography variant="caption" sx={{ color: '#888' }}>（通常クリック: 該当の監査記録へ移動）</Typography>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}><CircularProgress size={24} /></Box>}

      {/* 笏笏 繧ｫ繝ｬ繝ｳ繝繝ｼ繧ｰ繝ｪ繝・ラ 笏笏 */}
      {!loading && (
        <Box sx={{ flexGrow: 1, overflow: 'auto', border: '1px solid #ccc', borderRadius: 1 }}>
          <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: PATIENT_COL_W + COL_W * dates.length }}>
            <colgroup>
              <col style={{ width: PATIENT_COL_W }} />
              {dates.map(d => <col key={d} style={{ width: COL_W }} />)}
            </colgroup>
            <thead>
              {/* 譛医Λ繝吶Ν陦・*/}
              <tr style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <th style={{
                  position: 'sticky', left: 0, zIndex: 11, background: '#1c2833', color: '#fff',
                  fontSize: 11, padding: '4px 8px', textAlign: 'left', borderRight: '2px solid #555',
                }}>
                  謔｣閠・/ 繝ｬ繧ｸ繝｡繝ｳ
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
              {/* 譌･莉倥Λ繝吶Ν陦・*/}
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
              {filteredPatientRows.length === 0 && (
                <tr>
                  <td colSpan={dates.length + 1} style={{ padding: 24, textAlign: 'center', color: '#888', fontSize: 13 }}>
                    繝・・繧ｿ縺後≠繧翫∪縺帙ｓ
                  </td>
                </tr>
              )}
              {filteredPatientRows.map((row, ri) => {
                const isOdd = ri % 2 === 0;
                const rowBg = isOdd ? '#fff' : '#f9f9fb';
                return (
                  <tr key={`${row.patient_id}-${row.regimen_name}`} style={{ background: rowBg }}>
                    {/* 謔｣閠・そ繝ｫ */}
                    <td style={{
                      position: 'sticky', left: 0, zIndex: 2,
                      background: rowBg,
                      borderRight: '2px solid #bbb',
                      borderBottom: '1px solid #e0e0e0',
                      padding: '4px 8px',
                      minWidth: PATIENT_COL_W,
                    }}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#1a237e', lineHeight: 1.3 }}>
                        {row.patient_no}縲{row.patient_name}
                      </Typography>
                      <RegimenNameCell row={row} onRename={handleRename} />
                      <Typography sx={{ fontSize: '0.65rem', color: '#888' }}>
                        {row.department}
                      </Typography>
                    </td>
                    {/* 譌･莉倥そ繝ｫ */}
                    {dates.map(d => {
                      const key = `${row.patient_id}-${row.regimen_name}-${d}`;
                      const entry = entryMap.get(key);
                      const mark = entry ? statusMarkOf(entry) : null;
                      const sym = mark?.sym ?? '';
                      const col = mark?.color ?? '#999';
                      const bg = mark?.bg ?? 'transparent';
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
                            cursor: entry ? 'pointer' : 'default',
                            padding: '1px',
                            height: 32,
                            userSelect: 'none',
                          }}
                        >
                          {sym ? (
                            <Tooltip
                              title={entry ? `${mark?.label ?? ''}${entry.notes ? ` / ${entry.notes}` : ''}` : ''}
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

      {/* 邨ｱ險医し繝槭Μ繝ｼ */}
      {!loading && entries.length > 0 && (
        <Box sx={{ mt: 0.5, display: 'flex', gap: 2, flexWrap: 'wrap', px: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Chip
              label={`${PLANNED_MARK_DEF.audited.label}: ${entries.filter(e => isPlannedStatus(e.status) && e.audit_status === 'audited').length}\u4EF6`}
              size="small"
              sx={{ fontSize: '0.7rem', bgcolor: PLANNED_MARK_DEF.audited.bg, color: PLANNED_MARK_DEF.audited.color, border: `1px solid ${PLANNED_MARK_DEF.audited.color}` }}
            />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Chip
              label={`${PLANNED_MARK_DEF.unaudited.label}: ${entries.filter(e => isPlannedStatus(e.status) && e.audit_status !== 'audited' && e.audit_status !== 'doubt').length}\u4EF6`}
              size="small"
              sx={{ fontSize: '0.7rem', bgcolor: PLANNED_MARK_DEF.unaudited.bg, color: PLANNED_MARK_DEF.unaudited.color, border: `1px solid ${PLANNED_MARK_DEF.unaudited.color}` }}
            />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Chip
              label={`${STATUS_DEF.done.label}: ${entries.filter(e => e.status === 'done').length}\u4EF6`}
              size="small"
              sx={{ fontSize: '0.7rem', bgcolor: STATUS_DEF.done.bg, color: STATUS_DEF.done.color, border: `1px solid ${STATUS_DEF.done.color}` }}
            />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Chip
              label={`${STATUS_DEF.cancelled.label}: ${entries.filter(e => e.status === 'cancelled').length}\u4EF6`}
              size="small"
              sx={{ fontSize: '0.7rem', bgcolor: STATUS_DEF.cancelled.bg, color: STATUS_DEF.cancelled.color, border: `1px solid ${STATUS_DEF.cancelled.color}` }}
            />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Chip
              label={`${STATUS_DEF.changed.label}: ${entries.filter(e => e.status === 'changed').length}\u4EF6`}
              size="small"
              sx={{ fontSize: '0.7rem', bgcolor: STATUS_DEF.changed.bg, color: STATUS_DEF.changed.color, border: `1px solid ${STATUS_DEF.changed.color}` }}
            />
          </Box>
          <Typography variant="caption" sx={{ color: '#888', alignSelf: 'center' }}>
            表示範囲: {fromDate} 〜 {toDate}（{totalDays}日） / {filteredPatientRows.length}/{patientRows.length}名
          </Typography>
        </Box>
      )}
    </Box>
  );
}
