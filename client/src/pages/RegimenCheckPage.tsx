import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, TextField, Button,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Chip, CircularProgress, Alert, Dialog, DialogTitle, DialogContent,
  DialogActions, Stack,
  List, ListItem, IconButton, Tooltip,
} from '@mui/material';
import {
  Search, Add, CheckCircle, RadioButtonUnchecked,
  Person, ExpandMore, ExpandLess,
} from '@mui/icons-material';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartTooltip, Legend, ResponsiveContainer,
  ReferenceLine, Label,
} from 'recharts';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const API = '/regimen-check';

/* ─── 型定義 ─────────────────────────────────────────────── */
interface Patient {
  id: number; patient_no: string; name: string; furigana: string;
  department: string; doctor: string; dob: string | null; gender: string | null;
  latest_regimen: string | null; audit_count: number;
}
interface Vital { measured_date: string; height_cm: number | null; weight_kg: number | null; bsa: number | null; }
interface Lab {
  lab_date: string;
  wbc: number | null; anc: number | null; plt: number | null; hgb: number | null; mono: number | null;
  cre: number | null; egfr: number | null; ast: number | null; alt: number | null;
  tbil: number | null; crp: number | null;
}
interface MedHistory { id: number; condition_name: string; onset_date: string | null; end_date: string | null; notes: string | null; }
interface Order { id: number; order_date: string; drug_name: string; dose: number | null; dose_unit: string | null; route: string | null; is_antineoplastic: boolean; }
interface TreatmentHistory {
  id: number; scheduled_date: string; status: string; regimen_name: string;
  cycle_no: number | null; antineoplastic_drugs: string; support_drugs: string;
}
interface FutureSchedule { order_date: string; antineoplastic_drugs: string; }
interface Audit { id: number; audit_date: string; pharmacist_name: string; comment: string; handover_note: string; created_at: string; }
interface Doubt { id: number; doubt_date: string; content: string; status: string; resolution: string | null; pharmacist_name: string; resolved_at: string | null; }
interface Detail {
  patient: Patient & { latest_vital: Vital | null };
  vitals: Vital[];
  labs: Lab[];
  medHistory: MedHistory[];
  todayOrders: Order[];
  futureOrders: Order[];
  treatmentHistory: TreatmentHistory[];
  futureSchedule: FutureSchedule[];
  audits: Audit[];
  doubts: Doubt[];
}

/* ─── ユーティリティ ─────────────────────────────────────── */
function calcAge(dob: string | null) {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}
const fmtDate = (d: string | null) => d ? d.slice(0, 10) : '―';
const shortDate = (d: string | null) => d ? d.slice(5).replace('-', '/') : '―';

/* ─── グラフ共通ドット（値ラベル付き） ──────────────────── */
const ChartDot = (props: any) => {
  const { cx, cy, payload, dataKey, fill } = props;
  const val = payload[dataKey];
  if (val == null || isNaN(cy)) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={3} fill={fill || '#8884d8'} />
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize={9} fill="#555">
        {val < 10 ? Number(val).toFixed(1) : Math.round(val)}
      </text>
    </g>
  );
};

/* ─── 体重・BSA グラフ ──────────────────────────────────── */
function VitalChart({ vitals }: { vitals: Vital[] }) {
  if (!vitals.length) return <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>データなし</Typography>;
  const data = vitals.map(v => ({
    date: shortDate(v.measured_date),
    weight: v.weight_kg ? Number(v.weight_kg) : null,
    bsa: v.bsa,
  }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 18, right: 40, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fontSize: 9 }} />
        <YAxis yAxisId="l" domain={['auto', 'auto']} tick={{ fontSize: 9 }}>
          <Label value="体重(kg)" angle={-90} position="insideLeft" style={{ fontSize: 9 }} />
        </YAxis>
        <YAxis yAxisId="r" orientation="right" domain={[0.8, 2.5]} tick={{ fontSize: 9 }}>
          <Label value="BSA(m²)" angle={90} position="insideRight" style={{ fontSize: 9 }} />
        </YAxis>
        <RechartTooltip formatter={(v: any, n?: any) => [typeof v === 'number' ? v.toFixed(n === 'bsa' ? 2 : 1) : v, n === 'weight' ? '体重(kg)' : 'BSA(m²)']} />
        <Legend formatter={(v) => v === 'weight' ? '体重(kg)' : 'BSA(m²)'} wrapperStyle={{ fontSize: 10 }} />
        <Line yAxisId="l" type="monotone" dataKey="weight" stroke="#2196f3" strokeWidth={2}
          dot={<ChartDot dataKey="weight" fill="#2196f3" />} connectNulls />
        <Line yAxisId="r" type="monotone" dataKey="bsa" stroke="#ff9800" strokeWidth={2}
          dot={<ChartDot dataKey="bsa" fill="#ff9800" />} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ─── 骨髄系採血グラフ（対数スケール） ──────────────────── */
function BloodChart({ labs }: { labs: Lab[] }) {
  if (!labs.length) return <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>データなし</Typography>;
  const data = labs.map(l => ({
    date: shortDate(l.lab_date),
    WBC: l.wbc ? Number(l.wbc) : null,
    ANC: l.anc ? Number(l.anc) : null,
    Plt: l.plt ? Number(l.plt) : null,
    Hgb: l.hgb ? Number(l.hgb) : null,
    Mono: l.mono ? Number(l.mono) : null,
  }));
  const colors = { WBC: '#1976d2', ANC: '#388e3c', Plt: '#f57c00', Hgb: '#c62828', Mono: '#7b1fa2' };
  return (
    <ResponsiveContainer width="100%" height={210}>
      <LineChart data={data} margin={{ top: 18, right: 20, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fontSize: 9 }} />
        <YAxis scale="log" domain={[0.05, 'auto']} tick={{ fontSize: 9 }}
          tickFormatter={(v) => v >= 1 ? String(Math.round(v)) : v.toFixed(2)} />
        <RechartTooltip />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        <ReferenceLine y={1} stroke="#e53935" strokeDasharray="4 2"
          label={{ value: 'ANC 1.0', fontSize: 8, fill: '#e53935' }} />
        <ReferenceLine y={0.5} stroke="#b71c1c" strokeDasharray="4 2"
          label={{ value: '0.5', fontSize: 8, fill: '#b71c1c' }} />
        {(Object.keys(colors) as (keyof typeof colors)[]).map(k => (
          <Line key={k} type="monotone" dataKey={k} stroke={colors[k]} strokeWidth={1.5}
            dot={<ChartDot dataKey={k} fill={colors[k]} />} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ─── 腎機能グラフ ──────────────────────────────────────── */
function RenalChart({ labs }: { labs: Lab[] }) {
  if (!labs.length) return null;
  const data = labs.map(l => ({ date: shortDate(l.lab_date), CRE: l.cre ? Number(l.cre) : null, eGFR: l.egfr ? Number(l.egfr) : null }));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 18, right: 40, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fontSize: 9 }} />
        <YAxis yAxisId="l" tick={{ fontSize: 9 }}>
          <Label value="Cre" angle={-90} position="insideLeft" style={{ fontSize: 9 }} />
        </YAxis>
        <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 9 }}>
          <Label value="eGFR" angle={90} position="insideRight" style={{ fontSize: 9 }} />
        </YAxis>
        <RechartTooltip formatter={(v: any, n?: any) => [v, n ?? '']} />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        <ReferenceLine yAxisId="l" y={1.0} stroke="#f57f17" strokeDasharray="4 2" />
        <Line yAxisId="l" type="monotone" dataKey="CRE" stroke="#0288d1" strokeWidth={1.5}
          dot={<ChartDot dataKey="CRE" fill="#0288d1" />} connectNulls />
        <Line yAxisId="r" type="monotone" dataKey="eGFR" stroke="#00838f" strokeWidth={1.5}
          dot={<ChartDot dataKey="eGFR" fill="#00838f" />} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ─── 肝機能グラフ ──────────────────────────────────────── */
function HepaticChart({ labs }: { labs: Lab[] }) {
  if (!labs.length) return null;
  const data = labs.map(l => ({
    date: shortDate(l.lab_date),
    AST: l.ast ? Number(l.ast) : null, ALT: l.alt ? Number(l.alt) : null,
    TBil: l.tbil ? Number(l.tbil) * 10 : null, CRP: l.crp ? Number(l.crp) : null,
  }));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 18, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fontSize: 9 }} />
        <YAxis tick={{ fontSize: 9 }} />
        <RechartTooltip formatter={(v: any, n?: any) => [n === 'TBil' ? (Number(v) / 10).toFixed(2) + '(×10)' : v, n ?? '']} />
        <Legend wrapperStyle={{ fontSize: 10 }} formatter={(v) => v === 'TBil' ? 'T-Bil×10' : v} />
        <Line type="monotone" dataKey="AST" stroke="#7b1fa2" strokeWidth={1.5} dot={<ChartDot dataKey="AST" fill="#7b1fa2" />} connectNulls />
        <Line type="monotone" dataKey="ALT" stroke="#ad1457" strokeWidth={1.5} dot={<ChartDot dataKey="ALT" fill="#ad1457" />} connectNulls />
        <Line type="monotone" dataKey="TBil" stroke="#f4511e" strokeWidth={1.5} dot={<ChartDot dataKey="TBil" fill="#f4511e" />} connectNulls />
        <Line type="monotone" dataKey="CRP" stroke="#e65100" strokeWidth={1.5} dot={<ChartDot dataKey="CRP" fill="#e65100" />} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ─── オーダーカラム ────────────────────────────────────── */
function OrderColumn({ orders, label, dateStr }: { orders: Order[]; label: string; dateStr: string }) {
  const anti = orders.filter(o => o.is_antineoplastic);
  const other = orders.filter(o => !o.is_antineoplastic);
  if (!orders.length) return (
    <Box sx={{ textAlign: 'center', py: 2 }}>
      <Typography variant="body2" color="text.secondary">{label}（{dateStr}）：オーダーなし</Typography>
    </Box>
  );
  return (
    <Box>
      <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#c62828', display: 'block', mb: 0.5 }}>
        {label}　{dateStr}
      </Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead sx={{ bgcolor: anti.length ? '#fce4e4' : '#f5f5f5' }}>
            <TableRow>
              <TableCell sx={{ fontSize: '0.7rem', py: 0.4, fontWeight: 'bold' }}>薬品名</TableCell>
              <TableCell sx={{ fontSize: '0.7rem', py: 0.4, fontWeight: 'bold' }} align="right">用量</TableCell>
              <TableCell sx={{ fontSize: '0.7rem', py: 0.4, fontWeight: 'bold' }}>単位</TableCell>
              <TableCell sx={{ fontSize: '0.7rem', py: 0.4, fontWeight: 'bold' }}>経路</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {anti.length > 0 && <TableRow><TableCell colSpan={4} sx={{ fontSize: '0.68rem', bgcolor: '#fff3e0', py: 0.2, fontWeight: 'bold' }}>■ 抗腫瘍薬</TableCell></TableRow>}
            {anti.map(o => (
              <TableRow key={o.id} sx={{ bgcolor: '#fff8f0' }}>
                <TableCell sx={{ fontSize: '0.75rem', py: 0.3, fontWeight: 'bold', color: '#b71c1c' }}>{o.drug_name}</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', py: 0.3 }} align="right">{o.dose ?? '―'}</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', py: 0.3 }}>{o.dose_unit ?? ''}</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', py: 0.3 }}>{o.route ?? ''}</TableCell>
              </TableRow>
            ))}
            {other.length > 0 && <TableRow><TableCell colSpan={4} sx={{ fontSize: '0.68rem', bgcolor: '#f5f5f5', py: 0.2 }}>■ 支持療法</TableCell></TableRow>}
            {other.map(o => (
              <TableRow key={o.id}>
                <TableCell sx={{ fontSize: '0.75rem', py: 0.3 }}>{o.drug_name}</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', py: 0.3 }} align="right">{o.dose ?? '―'}</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', py: 0.3 }}>{o.dose_unit ?? ''}</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', py: 0.3 }}>{o.route ?? ''}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

/* ─── セクションヘッダー ────────────────────────────────── */
function SectionHeader({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color, mb: 0.8, mt: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.82rem' }}>
      {children}
    </Typography>
  );
}

/* ─── メインコンポーネント ──────────────────────────────── */
export default function RegimenCheckPage() {
  const { user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 監査入力
  const [auditComment, setAuditComment] = useState('');
  const [handoverNote, setHandoverNote] = useState('');
  const [savingAudit, setSavingAudit] = useState(false);

  // 疑義照会
  const [doubtDialog, setDoubtDialog] = useState(false);
  const [doubtContent, setDoubtContent] = useState('');
  const [savingDoubt, setSavingDoubt] = useState(false);
  const [resolveDialog, setResolveDialog] = useState<Doubt | null>(null);
  const [resolution, setResolution] = useState('');

  // 治療歴展開
  const [historyExpanded, setHistoryExpanded] = useState(true);

  // 患者一覧
  useEffect(() => {
    api.get<Patient[]>(`${API}/patients`)
      .then(r => setPatients(r.data))
      .catch(e => console.error('patients fetch error:', e));
  }, []);

  const loadDetail = useCallback(async (pid: number) => {
    setLoading(true); setError('');
    try {
      const r = await api.get<Detail>(`${API}/${pid}/detail`);
      setDetail(r.data);
      setAuditComment(r.data.audits[0]?.comment || '');
      setHandoverNote(r.data.audits[0]?.handover_note || '');
    } catch (e) {
      console.error('detail fetch error:', e);
      setError('データの取得に失敗しました');
    } finally { setLoading(false); }
  }, []);

  const handleSelect = (id: number) => { setSelectedId(id); loadDetail(id); };

  const handleSaveAudit = async () => {
    if (!selectedId) return;
    setSavingAudit(true);
    try {
      await api.post(`${API}/${selectedId}/audits`, {
        audit_date: new Date().toISOString().split('T')[0],
        pharmacist_name: user?.displayName || '',
        comment: auditComment, handover_note: handoverNote,
      });
      await loadDetail(selectedId);
    } finally { setSavingAudit(false); }
  };

  const handleAddDoubt = async () => {
    if (!selectedId || !doubtContent.trim()) return;
    setSavingDoubt(true);
    try {
      await api.post(`${API}/${selectedId}/doubts`, {
        content: doubtContent, pharmacist_name: user?.displayName || '',
      });
      setDoubtContent(''); setDoubtDialog(false);
      await loadDetail(selectedId);
    } finally { setSavingDoubt(false); }
  };

  const handleResolveDoubt = async () => {
    if (!resolveDialog) return;
    await api.patch(`${API}/doubts/${resolveDialog.id}`, { status: 'resolved', resolution });
    setResolveDialog(null); setResolution('');
    if (selectedId) loadDetail(selectedId);
  };

  const handleReopenDoubt = async (d: Doubt) => {
    await api.patch(`${API}/doubts/${d.id}`, { status: 'open', resolution: null });
    if (selectedId) loadDetail(selectedId);
  };

  const filtered = patients.filter(p =>
    !searchText || p.name?.includes(searchText) || p.patient_no?.includes(searchText) || p.furigana?.includes(searchText)
  );

  const p = detail?.patient;
  const age = p ? calcAge(p.dob) : null;
  const todayStr = new Date().toISOString().split('T')[0];
  const futureDate = detail?.futureOrders?.[0]?.order_date || '';

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* ── 左パネル：患者一覧 ── */}
      <Box sx={{ width: 210, flexShrink: 0, borderRight: '1px solid #ddd', display: 'flex', flexDirection: 'column', bgcolor: '#fafafa' }}>
        <Box sx={{ p: 1, borderBottom: '1px solid #ddd' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 0.5, fontSize: '0.82rem' }}>レジメン監査</Typography>
          <TextField
            size="small" fullWidth placeholder="患者名・ID検索"
            value={searchText} onChange={e => setSearchText(e.target.value)}
            InputProps={{ startAdornment: <Search sx={{ fontSize: 15, color: '#aaa', mr: 0.5 }} /> }}
            sx={{ '& .MuiInputBase-input': { fontSize: '0.75rem', py: 0.5 } }}
          />
        </Box>
        <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
          {filtered.length === 0 && (
            <Typography variant="body2" sx={{ color: '#888', p: 2, fontSize: '0.75rem' }}>患者なし</Typography>
          )}
          {filtered.map(pt => (
            <Box key={pt.id} onClick={() => handleSelect(pt.id)}
              sx={{
                px: 1.5, py: 0.8, cursor: 'pointer', borderBottom: '1px solid #eee',
                bgcolor: selectedId === pt.id ? '#e3f2fd' : 'transparent',
                '&:hover': { bgcolor: selectedId === pt.id ? '#e3f2fd' : '#f0f4f8' },
              }}>
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 'bold', color: '#1a237e' }}>
                {pt.patient_no}　{pt.name}
              </Typography>
              <Typography sx={{ fontSize: '0.68rem', color: '#666' }}>{pt.latest_regimen || '—'}</Typography>
              {pt.audit_count > 0 && (
                <Chip label={`監査${pt.audit_count}件`} size="small" color="success"
                  sx={{ fontSize: '0.62rem', height: 15, mt: 0.2 }} />
              )}
            </Box>
          ))}
        </Box>
      </Box>

      {/* ── 右パネル：詳細（スクロール） ── */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* 患者ヘッダー */}
        {p ? (
          <Box sx={{ px: 2, py: 0.8, borderBottom: '1px solid #ddd', bgcolor: '#f0f4ff', display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', flexShrink: 0 }}>
            <Person sx={{ color: '#3f51b5', fontSize: 20 }} />
            <Typography sx={{ fontWeight: 'bold', fontSize: '1rem' }}>{p.name}</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: '#555' }}>（{p.furigana}）</Typography>
            <Chip label={`ID: ${p.patient_no}`} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
            {p.dob && <Chip label={`${fmtDate(p.dob)}（${age}歳）`} size="small" sx={{ fontSize: '0.7rem' }} />}
            {p.gender && <Chip label={p.gender} size="small" color={p.gender === '男性' ? 'info' : 'secondary'} sx={{ fontSize: '0.7rem' }} />}
            <Chip label={p.department} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
            <Chip label={`Dr. ${p.doctor}`} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
            {p.latest_vital && (
              <Box sx={{ ml: 'auto', display: 'flex', gap: 0.8 }}>
                <Chip label={`身長 ${p.latest_vital.height_cm}cm`} size="small" sx={{ bgcolor: '#e8f5e9', fontSize: '0.7rem' }} />
                <Chip label={`体重 ${p.latest_vital.weight_kg}kg`} size="small" sx={{ bgcolor: '#e8f5e9', fontSize: '0.7rem' }} />
                {p.latest_vital.bsa && <Chip label={`BSA ${p.latest_vital.bsa}m²`} size="small" sx={{ bgcolor: '#fff9c4', fontSize: '0.7rem' }} />}
              </Box>
            )}
          </Box>
        ) : (
          <Box sx={{ px: 2, py: 1.2, borderBottom: '1px solid #ddd', bgcolor: '#f5f5f5', flexShrink: 0 }}>
            <Typography color="text.secondary" variant="body2">← 左から患者を選択してください</Typography>
          </Box>
        )}

        {loading && <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>}
        {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}

        {!loading && detail && (
          <Box sx={{ flexGrow: 1, overflow: 'auto', p: 1.5 }}>

            {/* ━━━━ ① 治療歴 ━━━━ */}
            <Paper variant="outlined" sx={{ mb: 1.5, overflow: 'hidden' }}>
              <Box
                sx={{ px: 1.5, py: 0.8, bgcolor: '#1c2833', display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => setHistoryExpanded(v => !v)}
              >
                <Typography sx={{ fontWeight: 'bold', color: '#fff', fontSize: '0.82rem', flexGrow: 1 }}>
                  これまでの治療歴（直近 {detail.treatmentHistory.length} 件）
                </Typography>
                {historyExpanded ? <ExpandLess sx={{ color: '#aed6f1', fontSize: 18 }} /> : <ExpandMore sx={{ color: '#aed6f1', fontSize: 18 }} />}
              </Box>
              {historyExpanded && (
                detail.treatmentHistory.length === 0 ? (
                  <Box sx={{ px: 2, py: 1.5 }}>
                    <Typography variant="body2" color="text.secondary">scheduled_treatments に記録なし</Typography>
                  </Box>
                ) : (
                  <TableContainer>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontSize: '0.72rem', py: 0.5, bgcolor: '#eceff1', fontWeight: 'bold', whiteSpace: 'nowrap' }}>実施日</TableCell>
                          <TableCell sx={{ fontSize: '0.72rem', py: 0.5, bgcolor: '#eceff1', fontWeight: 'bold' }}>レジメン</TableCell>
                          <TableCell sx={{ fontSize: '0.72rem', py: 0.5, bgcolor: '#eceff1', fontWeight: 'bold' }}>Cy</TableCell>
                          <TableCell sx={{ fontSize: '0.72rem', py: 0.5, bgcolor: '#eceff1', fontWeight: 'bold' }}>状態</TableCell>
                          <TableCell sx={{ fontSize: '0.72rem', py: 0.5, bgcolor: '#eceff1', fontWeight: 'bold' }}>抗腫瘍薬（オーダー）</TableCell>
                          <TableCell sx={{ fontSize: '0.72rem', py: 0.5, bgcolor: '#eceff1', fontWeight: 'bold' }}>支持療法</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {detail.treatmentHistory.map((t, i) => (
                          <TableRow key={t.id} sx={{ bgcolor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                            <TableCell sx={{ fontSize: '0.78rem', py: 0.4, whiteSpace: 'nowrap', fontWeight: fmtDate(t.scheduled_date) === todayStr ? 'bold' : 'normal', color: fmtDate(t.scheduled_date) === todayStr ? '#e65100' : 'inherit' }}>
                              {fmtDate(t.scheduled_date)}
                              {fmtDate(t.scheduled_date) === todayStr && <Chip label="今日" size="small" color="warning" sx={{ ml: 0.5, fontSize: '0.62rem', height: 15 }} />}
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.78rem', py: 0.4, fontWeight: 'bold', color: '#1a237e' }}>{t.regimen_name}</TableCell>
                            <TableCell sx={{ fontSize: '0.72rem', py: 0.4, color: '#555' }}>{t.cycle_no ?? '―'}</TableCell>
                            <TableCell sx={{ fontSize: '0.72rem', py: 0.4 }}>
                              <Chip label={t.status} size="small"
                                color={t.status === '実施' ? 'success' : t.status === '中止' ? 'error' : 'default'}
                                sx={{ fontSize: '0.68rem', height: 18 }} />
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.72rem', py: 0.4, color: t.antineoplastic_drugs ? '#b71c1c' : '#bbb' }}>
                              {t.antineoplastic_drugs || '（オーダーデータなし）'}
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.7rem', py: 0.4, color: '#555' }}>
                              {t.support_drugs || '―'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )
              )}
              {/* 今後の予定 */}
              {detail.futureSchedule.length > 0 && historyExpanded && (
                <Box sx={{ borderTop: '1px dashed #ccc', px: 1.5, py: 0.8, bgcolor: '#e8f5e9' }}>
                  <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#2e7d32' }}>今後の予定オーダー</Typography>
                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 0.5 }}>
                    {detail.futureSchedule.map(f => (
                      <Box key={f.order_date} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Chip label={fmtDate(f.order_date)} size="small" color="success" sx={{ fontSize: '0.68rem', height: 18 }} />
                        <Typography variant="caption" sx={{ color: '#1b5e20' }}>{f.antineoplastic_drugs || '—'}</Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}
            </Paper>

            {/* ━━━━ ② オーダー確認（左右比較） ━━━━ */}
            <Paper variant="outlined" sx={{ mb: 1.5, p: 1.2 }}>
              <SectionHeader color="#c62828">📋 オーダー確認（今回 vs 次回）</SectionHeader>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                <OrderColumn orders={detail.todayOrders} label="今回オーダー" dateStr={fmtDate(todayStr)} />
                <OrderColumn orders={detail.futureOrders} label="次回オーダー" dateStr={fmtDate(futureDate)} />
              </Box>
            </Paper>

            {/* ━━━━ ③ 採血グラフ ━━━━ */}
            <Paper variant="outlined" sx={{ mb: 1.5, p: 1.2 }}>
              <SectionHeader color="#2e7d32">🩸 骨髄系採血（対数スケール）　WBC・ANC（×10³/μL）　Plt（×10⁴/μL）　Hgb（g/dL）　Mono（×10³/μL）</SectionHeader>
              <BloodChart labs={detail.labs} />
            </Paper>

            {/* ━━━━ ④ 体格・腎肝機能（2列） ━━━━ */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 1.5 }}>
              <Paper variant="outlined" sx={{ p: 1.2 }}>
                <SectionHeader color="#1565c0">⚖️ 体重・BSA（過去1年）</SectionHeader>
                <VitalChart vitals={detail.vitals} />
              </Paper>
              <Paper variant="outlined" sx={{ p: 1.2 }}>
                <SectionHeader color="#37474f">🏥 既往歴</SectionHeader>
                {detail.medHistory.length ? (
                  <TableContainer>
                    <Table size="small">
                      <TableHead sx={{ bgcolor: '#eceff1' }}>
                        <TableRow>
                          <TableCell sx={{ fontSize: '0.7rem', py: 0.4, fontWeight: 'bold' }}>疾患名</TableCell>
                          <TableCell sx={{ fontSize: '0.7rem', py: 0.4, fontWeight: 'bold' }}>発症</TableCell>
                          <TableCell sx={{ fontSize: '0.7rem', py: 0.4, fontWeight: 'bold' }}>転帰</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {detail.medHistory.map(m => (
                          <TableRow key={m.id}>
                            <TableCell sx={{ fontSize: '0.75rem', py: 0.4, fontWeight: 'bold' }}>{m.condition_name}</TableCell>
                            <TableCell sx={{ fontSize: '0.72rem', py: 0.4, whiteSpace: 'nowrap' }}>{fmtDate(m.onset_date)}</TableCell>
                            <TableCell sx={{ fontSize: '0.72rem', py: 0.4 }}>{m.notes || '継続'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : <Typography variant="body2" color="text.secondary">登録なし</Typography>}
              </Paper>
            </Box>

            {/* ━━━━ ⑤ 腎肝機能グラフ（2列） ━━━━ */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 1.5 }}>
              <Paper variant="outlined" sx={{ p: 1.2 }}>
                <SectionHeader color="#0277bd">🫘 腎機能（Cre / eGFR）</SectionHeader>
                <RenalChart labs={detail.labs} />
              </Paper>
              <Paper variant="outlined" sx={{ p: 1.2 }}>
                <SectionHeader color="#6a1b9a">🫀 肝機能（AST / ALT / T-Bil×10 / CRP）</SectionHeader>
                <HepaticChart labs={detail.labs} />
              </Paper>
            </Box>

            {/* ━━━━ ⑥ 監査・疑義（2列） ━━━━ */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 1.5 }}>
              {/* 監査コメント */}
              <Paper variant="outlined" sx={{ p: 1.2 }}>
                <SectionHeader color="#1565c0">📝 監査コメント・申し送り</SectionHeader>
                <Stack spacing={1}>
                  <TextField label="監査コメント" multiline rows={3} fullWidth size="small"
                    value={auditComment} onChange={e => setAuditComment(e.target.value)}
                    placeholder="投与量確認結果、特記事項"
                    sx={{ '& .MuiInputBase-input': { fontSize: '0.8rem' } }} />
                  <TextField label="申し送り事項" multiline rows={2} fullWidth size="small"
                    value={handoverNote} onChange={e => setHandoverNote(e.target.value)}
                    placeholder="次回担当者への申し送り"
                    sx={{ '& .MuiInputBase-input': { fontSize: '0.8rem' } }} />
                  <Button variant="contained" size="small" onClick={handleSaveAudit}
                    disabled={savingAudit} sx={{ alignSelf: 'flex-start', fontSize: '0.75rem' }}>
                    監査記録を保存
                  </Button>
                </Stack>
              </Paper>

              {/* 疑義照会 */}
              <Paper variant="outlined" sx={{ p: 1.2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.8 }}>
                  <SectionHeader color="#b71c1c">❓ 疑義照会</SectionHeader>
                  <Box sx={{ flexGrow: 1 }} />
                  <Button size="small" variant="outlined" color="error" startIcon={<Add />}
                    onClick={() => setDoubtDialog(true)} sx={{ fontSize: '0.72rem', py: 0.3 }}>
                    追加
                  </Button>
                </Box>
                {detail.doubts.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">疑義照会はありません</Typography>
                ) : (
                  <List dense disablePadding sx={{ maxHeight: 220, overflow: 'auto' }}>
                    {detail.doubts.map(d => (
                      <ListItem key={d.id} disableGutters divider alignItems="flex-start"
                        sx={{ py: 0.6 }}
                        secondaryAction={
                          d.status === 'open' ? (
                            <Tooltip title="解決済みにする">
                              <IconButton size="small" color="success" onClick={() => { setResolveDialog(d); setResolution(''); }}>
                                <CheckCircle sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Tooltip>
                          ) : (
                            <Tooltip title="再オープン">
                              <IconButton size="small" onClick={() => handleReopenDoubt(d)}>
                                <RadioButtonUnchecked sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Tooltip>
                          )
                        }>
                        <Box sx={{ pr: 4, width: '100%' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 0.2 }}>
                            <Chip label={d.status === 'open' ? '未解決' : '解決済'} size="small"
                              color={d.status === 'open' ? 'error' : 'success'}
                              sx={{ fontSize: '0.62rem', height: 16 }} />
                            <Typography sx={{ fontSize: '0.68rem', color: '#888' }}>{fmtDate(d.doubt_date)}　{d.pharmacist_name}</Typography>
                          </Box>
                          <Typography sx={{ fontSize: '0.78rem' }}>{d.content}</Typography>
                          {d.resolution && (
                            <Typography sx={{ fontSize: '0.72rem', color: '#2e7d32', mt: 0.2 }}>✓ {d.resolution}</Typography>
                          )}
                        </Box>
                      </ListItem>
                    ))}
                  </List>
                )}
              </Paper>
            </Box>

            {/* ━━━━ ⑦ 監査ログ ━━━━ */}
            {detail.audits.length > 0 && (
              <Paper variant="outlined" sx={{ p: 1.2 }}>
                <SectionHeader color="#37474f">🗒️ 監査ログ</SectionHeader>
                <TableContainer>
                  <Table size="small">
                    <TableHead sx={{ bgcolor: '#f5f5f5' }}>
                      <TableRow>
                        <TableCell sx={{ fontSize: '0.7rem', py: 0.4 }}>日付</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem', py: 0.4 }}>薬剤師</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem', py: 0.4 }}>コメント</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem', py: 0.4 }}>申し送り</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {detail.audits.map(a => (
                        <TableRow key={a.id}>
                          <TableCell sx={{ fontSize: '0.75rem', py: 0.4, whiteSpace: 'nowrap' }}>{fmtDate(a.audit_date)}</TableCell>
                          <TableCell sx={{ fontSize: '0.75rem', py: 0.4, whiteSpace: 'nowrap' }}>{a.pharmacist_name}</TableCell>
                          <TableCell sx={{ fontSize: '0.75rem', py: 0.4 }}>{a.comment || '―'}</TableCell>
                          <TableCell sx={{ fontSize: '0.75rem', py: 0.4, color: '#555' }}>{a.handover_note || '―'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            )}

          </Box>
        )}
      </Box>

      {/* ── 疑義追加ダイアログ ── */}
      <Dialog open={doubtDialog} onClose={() => setDoubtDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: '0.92rem', pb: 1 }}>疑義照会を追加</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth multiline rows={4} label="疑義内容" size="small"
            value={doubtContent} onChange={e => setDoubtContent(e.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDoubtDialog(false)}>キャンセル</Button>
          <Button variant="contained" color="error" onClick={handleAddDoubt}
            disabled={savingDoubt || !doubtContent.trim()}>追加</Button>
        </DialogActions>
      </Dialog>

      {/* ── 疑義解決ダイアログ ── */}
      <Dialog open={!!resolveDialog} onClose={() => setResolveDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: '0.92rem', pb: 1 }}>疑義照会を解決済みにする</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1, color: '#555' }}>{resolveDialog?.content}</Typography>
          <TextField fullWidth multiline rows={3} label="解決内容・回答" size="small"
            value={resolution} onChange={e => setResolution(e.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResolveDialog(null)}>キャンセル</Button>
          <Button variant="contained" color="success" onClick={handleResolveDoubt}>解決済みにする</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
