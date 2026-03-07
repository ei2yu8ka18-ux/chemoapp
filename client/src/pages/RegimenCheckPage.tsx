import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, TextField, Button, Tabs, Tab,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Chip, CircularProgress, Alert, Dialog, DialogTitle, DialogContent,
  DialogActions, Stack,
  List, ListItem, IconButton, Tooltip,
} from '@mui/material';
import {
  Search, Add, CheckCircle, RadioButtonUnchecked,
  Person, Science, MedicalServices, Assignment,
} from '@mui/icons-material';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartTooltip, Legend, ResponsiveContainer,
  ReferenceLine, Label,
} from 'recharts';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

const API = '/api/regimen-check';

interface Patient {
  id: number;
  patient_no: string;
  name: string;
  furigana: string;
  department: string;
  doctor: string;
  dob: string | null;
  gender: string | null;
  latest_regimen: string | null;
  last_treatment_date: string | null;
  audit_count: number;
}

interface Vital { measured_date: string; height_cm: number | null; weight_kg: number | null; bsa: number | null; }
interface Lab {
  lab_date: string;
  wbc: number | null; anc: number | null; plt: number | null; hgb: number | null; mono: number | null;
  cre: number | null; egfr: number | null; ast: number | null; alt: number | null;
  tbil: number | null; crp: number | null;
}
interface MedHistory { id: number; condition_name: string; onset_date: string | null; end_date: string | null; notes: string | null; }
interface Order { id: number; order_date: string; drug_name: string; dose: number | null; dose_unit: string | null; route: string | null; regimen_name: string | null; order_type: string; is_antineoplastic: boolean; }
interface Audit { id: number; audit_date: string; pharmacist_name: string; comment: string; handover_note: string; created_at: string; }
interface Doubt { id: number; doubt_date: string; content: string; status: string; resolution: string | null; pharmacist_name: string; resolved_at: string | null; created_at: string; }
interface TreatmentHistory { id: number; scheduled_date: string; status: string; regimen_name: string; }
interface Detail {
  patient: Patient & { latest_vital: Vital | null };
  vitals: Vital[];
  labs: Lab[];
  medHistory: MedHistory[];
  todayOrders: Order[];
  futureOrders: Order[];
  recentTreatments: TreatmentHistory[];
  audits: Audit[];
  doubts: Doubt[];
}

function calcAge(dob: string | null) {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function fmtDate(d: string | null) {
  if (!d) return '―';
  return d.slice(0, 10);
}

// 採血グラフ用カスタムラベル
const CustomDot = (props: any) => {
  const { cx, cy, payload, dataKey } = props;
  const val = payload[dataKey];
  if (val == null || isNaN(cy)) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={3} fill={props.fill || '#8884d8'} />
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize={9} fill="#555">
        {val < 10 ? val.toFixed(1) : Math.round(val)}
      </text>
    </g>
  );
};

// 体格グラフ用カスタムドット（値表示付き）
const VitalDot = (props: any) => {
  const { cx, cy, payload, dataKey } = props;
  const val = payload[dataKey];
  if (val == null || isNaN(cy)) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={3} fill={props.fill || '#2196f3'} />
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize={9} fill="#555">
        {typeof val === 'number' ? val.toFixed(dataKey === 'bsa' ? 2 : 1) : val}
      </text>
    </g>
  );
};

// ─── 体格・BSA グラフ ──────────────────────────────────────
function VitalChart({ vitals }: { vitals: Vital[] }) {
  if (!vitals.length) return <Typography variant="body2" color="text.secondary">データなし</Typography>;
  const data = vitals.map(v => ({
    date: fmtDate(v.measured_date).slice(5),
    weight: v.weight_kg ? Number(v.weight_kg) : null,
    bsa: v.bsa,
  }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 20, right: 40, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
        <YAxis yAxisId="left" domain={['auto', 'auto']} tick={{ fontSize: 10 }}>
          <Label value="体重(kg)" angle={-90} position="insideLeft" style={{ fontSize: 10 }} />
        </YAxis>
        <YAxis yAxisId="right" orientation="right" domain={[0.8, 2.5]} tick={{ fontSize: 10 }}>
          <Label value="BSA(m²)" angle={90} position="insideRight" style={{ fontSize: 10 }} />
        </YAxis>
        <RechartTooltip formatter={(v: any, n?: any) => [typeof v === 'number' ? v.toFixed(n === 'bsa' ? 2 : 1) : v, n === 'weight' ? '体重(kg)' : 'BSA(m²)']} />
        <Legend formatter={(v) => v === 'weight' ? '体重(kg)' : 'BSA(m²)'} />
        <Line yAxisId="left" type="monotone" dataKey="weight" stroke="#2196f3" strokeWidth={2} dot={<VitalDot dataKey="weight" fill="#2196f3" />} connectNulls />
        <Line yAxisId="right" type="monotone" dataKey="bsa" stroke="#ff9800" strokeWidth={2} dot={<VitalDot dataKey="bsa" fill="#ff9800" />} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── 骨髄系グラフ（対数スケール） ─────────────────────────
function BloodChart({ labs }: { labs: Lab[] }) {
  if (!labs.length) return <Typography variant="body2" color="text.secondary">データなし</Typography>;
  const data = labs.map(l => ({
    date: fmtDate(l.lab_date).slice(5),
    WBC: l.wbc ? Number(l.wbc) : null,
    ANC: l.anc ? Number(l.anc) : null,
    Plt: l.plt ? Number(l.plt) : null,
    Hgb: l.hgb ? Number(l.hgb) : null,
    Mono: l.mono ? Number(l.mono) : null,
  }));
  const colors = { WBC: '#1976d2', ANC: '#388e3c', Plt: '#f57c00', Hgb: '#c62828', Mono: '#7b1fa2' };
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 20, right: 20, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
        <YAxis scale="log" domain={[0.05, 'auto']} tick={{ fontSize: 10 }} tickFormatter={(v) => v >= 1 ? String(Math.round(v)) : v.toFixed(2)} />
        <RechartTooltip />
        <Legend />
        {/* 好中球減少グレード参考ライン */}
        <ReferenceLine y={1} stroke="#e53935" strokeDasharray="4 2" label={{ value: 'ANC 1.0', fontSize: 9, fill: '#e53935' }} />
        <ReferenceLine y={0.5} stroke="#b71c1c" strokeDasharray="4 2" label={{ value: 'ANC 0.5', fontSize: 9, fill: '#b71c1c' }} />
        {(Object.keys(colors) as (keyof typeof colors)[]).map(k => (
          <Line key={k} type="monotone" dataKey={k} stroke={colors[k]} strokeWidth={1.5}
            dot={<CustomDot dataKey={k} fill={colors[k]} />} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── 腎機能・肝機能グラフ ─────────────────────────────────
function RenalHepaticChart({ labs }: { labs: Lab[] }) {
  if (!labs.length) return <Typography variant="body2" color="text.secondary">データなし</Typography>;
  const data = labs.map(l => ({
    date: fmtDate(l.lab_date).slice(5),
    CRE: l.cre ? Number(l.cre) : null,
    eGFR: l.egfr ? Number(l.egfr) : null,
    AST: l.ast ? Number(l.ast) : null,
    ALT: l.alt ? Number(l.alt) : null,
    TBIL: l.tbil ? Number(l.tbil) * 10 : null, // ×10 スケール調整
    CRP: l.crp ? Number(l.crp) : null,
  }));
  return (
    <Box>
      {/* 腎機能 */}
      <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#1565c0' }}>腎機能（Cre / eGFR）</Typography>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 15, right: 40, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
          <YAxis yAxisId="l" tick={{ fontSize: 10 }}>
            <Label value="Cre(mg/dL)" angle={-90} position="insideLeft" style={{ fontSize: 9 }} />
          </YAxis>
          <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }}>
            <Label value="eGFR" angle={90} position="insideRight" style={{ fontSize: 9 }} />
          </YAxis>
          <RechartTooltip formatter={(v: any, n?: any) => [n === 'TBIL×10' ? (Number(v) / 10).toFixed(2) : v, n ?? '']} />
          <Legend />
          <ReferenceLine yAxisId="l" y={1.0} stroke="#f57f17" strokeDasharray="4 2" />
          <Line yAxisId="l" type="monotone" dataKey="CRE" stroke="#0288d1" strokeWidth={1.5} dot={<CustomDot dataKey="CRE" fill="#0288d1" />} connectNulls />
          <Line yAxisId="r" type="monotone" dataKey="eGFR" stroke="#00838f" strokeWidth={1.5} dot={<CustomDot dataKey="eGFR" fill="#00838f" />} connectNulls />
        </LineChart>
      </ResponsiveContainer>
      {/* 肝機能 */}
      <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#6a1b9a', mt: 1, display: 'block' }}>肝機能（AST / ALT / T-bil×10 / CRP）</Typography>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 15, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <RechartTooltip formatter={(v: any, n?: any) => [n === 'TBIL×10' ? (Number(v) / 10).toFixed(2) + ' (mg/dL)' : v, n ?? '']} />
          <Legend />
          <Line type="monotone" dataKey="AST" stroke="#7b1fa2" strokeWidth={1.5} dot={<CustomDot dataKey="AST" fill="#7b1fa2" />} connectNulls />
          <Line type="monotone" dataKey="ALT" stroke="#ad1457" strokeWidth={1.5} dot={<CustomDot dataKey="ALT" fill="#ad1457" />} connectNulls />
          <Line type="monotone" dataKey="TBIL" name="TBIL×10" stroke="#f4511e" strokeWidth={1.5} dot={<CustomDot dataKey="TBIL" fill="#f4511e" />} connectNulls />
          <Line type="monotone" dataKey="CRP" stroke="#e65100" strokeWidth={1.5} dot={<CustomDot dataKey="CRP" fill="#e65100" />} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}

// ─── オーダー比較テーブル ──────────────────────────────────
function OrderTable({ orders, label }: { orders: Order[]; label: string }) {
  const antineoplastic = orders.filter(o => o.is_antineoplastic);
  const others = orders.filter(o => !o.is_antineoplastic);
  if (!orders.length) return (
    <Box sx={{ textAlign: 'center', py: 3 }}>
      <Typography color="text.secondary" variant="body2">{label}: オーダーなし</Typography>
    </Box>
  );
  return (
    <Box>
      <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#c62828', display: 'block', mb: 0.5 }}>
        {label}（{orders[0]?.order_date ? fmtDate(orders[0].order_date) : ''}）
      </Typography>
      <TableContainer component={Paper} variant="outlined" sx={{ mb: 1 }}>
        <Table size="small">
          <TableHead sx={{ bgcolor: '#fce4e4' }}>
            <TableRow>
              <TableCell sx={{ fontSize: '0.72rem', fontWeight: 'bold', py: 0.5 }}>薬品名</TableCell>
              <TableCell sx={{ fontSize: '0.72rem', fontWeight: 'bold', py: 0.5 }} align="right">用量</TableCell>
              <TableCell sx={{ fontSize: '0.72rem', fontWeight: 'bold', py: 0.5 }}>単位</TableCell>
              <TableCell sx={{ fontSize: '0.72rem', fontWeight: 'bold', py: 0.5 }}>経路</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {antineoplastic.length > 0 && (
              <TableRow><TableCell colSpan={4} sx={{ fontSize: '0.7rem', bgcolor: '#fff3e0', py: 0.3, fontWeight: 'bold' }}>■ 抗腫瘍薬</TableCell></TableRow>
            )}
            {antineoplastic.map(o => (
              <TableRow key={o.id} sx={{ bgcolor: '#fff8f0' }}>
                <TableCell sx={{ fontSize: '0.75rem', py: 0.3, fontWeight: 'bold', color: '#b71c1c' }}>{o.drug_name}</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', py: 0.3 }} align="right">{o.dose ?? '―'}</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', py: 0.3 }}>{o.dose_unit ?? ''}</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', py: 0.3 }}>{o.route ?? ''}</TableCell>
              </TableRow>
            ))}
            {others.length > 0 && (
              <TableRow><TableCell colSpan={4} sx={{ fontSize: '0.7rem', bgcolor: '#f5f5f5', py: 0.3 }}>■ その他薬剤</TableCell></TableRow>
            )}
            {others.map(o => (
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

// ─── メインコンポーネント ─────────────────────────────────
export default function RegimenCheckPage() {
  const { user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState(0);
  const [error, setError] = useState('');

  // 監査入力フォーム
  const [auditComment, setAuditComment] = useState('');
  const [handoverNote, setHandoverNote] = useState('');
  const [savingAudit, setSavingAudit] = useState(false);

  // 疑義照会フォーム
  const [doubtDialog, setDoubtDialog] = useState(false);
  const [doubtContent, setDoubtContent] = useState('');
  const [savingDoubt, setSavingDoubt] = useState(false);

  // 疑義解決ダイアログ
  const [resolveDialog, setResolveDialog] = useState<Doubt | null>(null);
  const [resolution, setResolution] = useState('');

  // 患者一覧取得
  useEffect(() => {
    axios.get<Patient[]>(`${API}/patients`).then(r => setPatients(r.data)).catch(() => {});
  }, []);

  // 患者詳細取得
  const loadDetail = useCallback(async (pid: number) => {
    setLoading(true);
    setError('');
    try {
      const r = await axios.get<Detail>(`${API}/${pid}/detail`);
      setDetail(r.data);
      setAuditComment(r.data.audits[0]?.comment || '');
      setHandoverNote(r.data.audits[0]?.handover_note || '');
    } catch {
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelectPatient = (id: number) => {
    setSelectedId(id);
    setTab(0);
    loadDetail(id);
  };

  // 監査保存
  const handleSaveAudit = async () => {
    if (!selectedId) return;
    setSavingAudit(true);
    try {
      await axios.post(`${API}/${selectedId}/audits`, {
        audit_date: new Date().toISOString().split('T')[0],
        pharmacist_name: user?.displayName || '',
        comment: auditComment,
        handover_note: handoverNote,
      });
      await loadDetail(selectedId);
    } finally {
      setSavingAudit(false);
    }
  };

  // 疑義照会追加
  const handleAddDoubt = async () => {
    if (!selectedId || !doubtContent.trim()) return;
    setSavingDoubt(true);
    try {
      await axios.post(`${API}/${selectedId}/doubts`, {
        content: doubtContent,
        pharmacist_name: user?.displayName || '',
      });
      setDoubtContent('');
      setDoubtDialog(false);
      await loadDetail(selectedId);
    } finally {
      setSavingDoubt(false);
    }
  };

  // 疑義照会解決
  const handleResolveDoubt = async () => {
    if (!resolveDialog) return;
    await axios.patch(`${API}/doubts/${resolveDialog.id}`, { status: 'resolved', resolution });
    setResolveDialog(null);
    setResolution('');
    if (selectedId) loadDetail(selectedId);
  };

  // 疑義照会再オープン
  const handleReopenDoubt = async (doubt: Doubt) => {
    await axios.patch(`${API}/doubts/${doubt.id}`, { status: 'open', resolution: null });
    if (selectedId) loadDetail(selectedId);
  };

  const filtered = patients.filter(p =>
    !searchText ||
    p.name?.includes(searchText) ||
    p.patient_no?.includes(searchText) ||
    p.furigana?.includes(searchText)
  );

  const p = detail?.patient;
  const age = p ? calcAge(p.dob) : null;

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 0px)', overflow: 'hidden' }}>

      {/* ── 左パネル：患者一覧 ── */}
      <Box sx={{ width: 220, flexShrink: 0, borderRight: '1px solid #ddd', display: 'flex', flexDirection: 'column', bgcolor: '#fafafa' }}>
        <Box sx={{ p: 1, borderBottom: '1px solid #ddd' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 0.5 }}>レジメン監査</Typography>
          <TextField
            size="small" fullWidth placeholder="患者名・ID検索"
            value={searchText} onChange={e => setSearchText(e.target.value)}
            InputProps={{ startAdornment: <Search sx={{ fontSize: 16, color: '#aaa', mr: 0.5 }} /> }}
            sx={{ '& .MuiInputBase-input': { fontSize: '0.78rem', py: 0.6 } }}
          />
        </Box>
        <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
          {filtered.map(p => (
            <Box
              key={p.id}
              onClick={() => handleSelectPatient(p.id)}
              sx={{
                px: 1.5, py: 1, cursor: 'pointer', borderBottom: '1px solid #eee',
                bgcolor: selectedId === p.id ? '#e3f2fd' : 'transparent',
                '&:hover': { bgcolor: selectedId === p.id ? '#e3f2fd' : '#f0f4f8' },
              }}
            >
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#1a237e' }}>
                {p.patient_no} {p.name}
              </Typography>
              <Typography sx={{ fontSize: '0.7rem', color: '#666' }}>
                {p.latest_regimen || '—'}
              </Typography>
              {p.audit_count > 0 && (
                <Chip label={`監査${p.audit_count}件`} size="small" color="success" sx={{ fontSize: '0.65rem', height: 16, mt: 0.3 }} />
              )}
            </Box>
          ))}
        </Box>
      </Box>

      {/* ── 右パネル ── */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* 患者ヘッダー */}
        {detail && p ? (
          <Box sx={{ px: 2, py: 1, borderBottom: '1px solid #ddd', bgcolor: '#f0f4ff', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Person sx={{ color: '#3f51b5' }} />
            <Typography sx={{ fontWeight: 'bold', fontSize: '1rem' }}>{p.name}</Typography>
            <Typography sx={{ fontSize: '0.8rem', color: '#555' }}>({p.furigana})</Typography>
            <Chip label={`ID: ${p.patient_no}`} size="small" variant="outlined" />
            {p.dob && <Chip label={`${fmtDate(p.dob)} (${age}歳)`} size="small" />}
            {p.gender && <Chip label={p.gender} size="small" color={p.gender === '男' ? 'info' : 'secondary'} />}
            <Chip label={p.department} size="small" variant="outlined" />
            <Chip label={`Dr. ${p.doctor}`} size="small" variant="outlined" />
            {p.latest_vital && (
              <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
                <Chip label={`身長 ${p.latest_vital.height_cm}cm`} size="small" sx={{ bgcolor: '#e8f5e9' }} />
                <Chip label={`体重 ${p.latest_vital.weight_kg}kg`} size="small" sx={{ bgcolor: '#e8f5e9' }} />
                {p.latest_vital.bsa && <Chip label={`BSA ${p.latest_vital.bsa}m²`} size="small" sx={{ bgcolor: '#fff9c4' }} />}
              </Box>
            )}
          </Box>
        ) : (
          <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #ddd', bgcolor: '#f5f5f5' }}>
            <Typography color="text.secondary" variant="body2">← 左から患者を選択してください</Typography>
          </Box>
        )}

        {/* タブ */}
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 36, '& .MuiTab-root': { minHeight: 36, fontSize: '0.78rem', py: 0 } }}>
          <Tab icon={<Science sx={{ fontSize: 14 }} />} iconPosition="start" label="体格・採血" />
          <Tab icon={<MedicalServices sx={{ fontSize: 14 }} />} iconPosition="start" label="オーダー確認" />
          <Tab icon={<Assignment sx={{ fontSize: 14 }} />} iconPosition="start" label="監査・疑義" />
        </Tabs>

        {loading && <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>}
        {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}

        {!loading && detail && (
          <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>

            {/* ── Tab 0: 体格・採血 ── */}
            {tab === 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

                {/* 体重・BSA グラフ */}
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1, color: '#1565c0' }}>
                    体重・BSA 推移（過去1年）
                  </Typography>
                  <VitalChart vitals={detail.vitals} />
                </Paper>

                {/* 骨髄系採血グラフ */}
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1, color: '#2e7d32' }}>
                    骨髄系採血（対数スケール）　WBC・ANC（×10³/μL）　Plt（×10⁴/μL）　Hgb（g/dL）　Mono（×10³/μL）
                  </Typography>
                  <BloodChart labs={detail.labs} />
                </Paper>

                {/* 腎機能・肝機能 */}
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1, color: '#6a1b9a' }}>
                    腎機能・肝機能
                  </Typography>
                  <RenalHepaticChart labs={detail.labs} />
                </Paper>

                {/* 既往歴テーブル */}
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1, color: '#37474f' }}>
                    既往歴
                  </Typography>
                  {detail.medHistory.length ? (
                    <TableContainer>
                      <Table size="small">
                        <TableHead sx={{ bgcolor: '#eceff1' }}>
                          <TableRow>
                            <TableCell sx={{ fontSize: '0.75rem', py: 0.5 }}>疾患名</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', py: 0.5 }}>発症日</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', py: 0.5 }}>終了日</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem', py: 0.5 }}>備考</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {detail.medHistory.map(m => (
                            <TableRow key={m.id}>
                              <TableCell sx={{ fontSize: '0.8rem', py: 0.5, fontWeight: 'bold' }}>{m.condition_name}</TableCell>
                              <TableCell sx={{ fontSize: '0.78rem', py: 0.5 }}>{fmtDate(m.onset_date)}</TableCell>
                              <TableCell sx={{ fontSize: '0.78rem', py: 0.5 }}>{fmtDate(m.end_date)}</TableCell>
                              <TableCell sx={{ fontSize: '0.75rem', py: 0.5, color: '#555' }}>{m.notes || '―'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  ) : (
                    <Typography variant="body2" color="text.secondary">登録なし</Typography>
                  )}
                </Paper>
              </Box>
            )}

            {/* ── Tab 1: オーダー確認 ── */}
            {tab === 1 && (
              <Box>
                <Alert severity="info" sx={{ mb: 2, fontSize: '0.78rem' }}>
                  本日オーダーと直近将来オーダーを比較し、投与量・レジメンに誤りがないか確認してください。
                </Alert>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  <Box>
                    <OrderTable orders={detail.todayOrders} label="本日オーダー" />
                  </Box>
                  <Box>
                    <OrderTable orders={detail.futureOrders} label="直近将来オーダー" />
                  </Box>
                </Box>

                {/* 過去の治療履歴 */}
                {detail.recentTreatments.length > 0 && (
                  <Paper variant="outlined" sx={{ p: 1.5, mt: 2 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>直近の実施履歴</Typography>
                    <Table size="small">
                      <TableHead sx={{ bgcolor: '#f5f5f5' }}>
                        <TableRow>
                          <TableCell sx={{ fontSize: '0.75rem', py: 0.5 }}>実施日</TableCell>
                          <TableCell sx={{ fontSize: '0.75rem', py: 0.5 }}>レジメン</TableCell>
                          <TableCell sx={{ fontSize: '0.75rem', py: 0.5 }}>ステータス</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {detail.recentTreatments.map(t => (
                          <TableRow key={t.id}>
                            <TableCell sx={{ fontSize: '0.78rem', py: 0.5 }}>{fmtDate(t.scheduled_date)}</TableCell>
                            <TableCell sx={{ fontSize: '0.78rem', py: 0.5 }}>{t.regimen_name}</TableCell>
                            <TableCell sx={{ fontSize: '0.78rem', py: 0.5 }}>
                              <Chip
                                label={t.status} size="small"
                                color={t.status === '実施' ? 'success' : t.status === '中止' ? 'error' : 'default'}
                                sx={{ fontSize: '0.7rem', height: 18 }}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Paper>
                )}
              </Box>
            )}

            {/* ── Tab 2: 監査・疑義照会 ── */}
            {tab === 2 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

                {/* 監査コメント入力 */}
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1, color: '#1565c0' }}>
                    監査コメント・申し送り
                  </Typography>
                  <Stack spacing={1.5}>
                    <TextField
                      label="監査コメント"
                      multiline rows={3} fullWidth size="small"
                      value={auditComment}
                      onChange={e => setAuditComment(e.target.value)}
                      placeholder="投与量確認結果、特記事項など"
                    />
                    <TextField
                      label="申し送り事項"
                      multiline rows={2} fullWidth size="small"
                      value={handoverNote}
                      onChange={e => setHandoverNote(e.target.value)}
                      placeholder="次回担当者への申し送り"
                    />
                    <Button
                      variant="contained" size="small"
                      onClick={handleSaveAudit} disabled={savingAudit}
                      sx={{ alignSelf: 'flex-start' }}
                    >
                      監査記録を保存
                    </Button>
                  </Stack>
                </Paper>

                {/* 疑義照会 */}
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold', flexGrow: 1, color: '#b71c1c' }}>
                      疑義照会
                    </Typography>
                    <Button
                      size="small" variant="outlined" color="error"
                      startIcon={<Add />}
                      onClick={() => setDoubtDialog(true)}
                    >
                      疑義追加
                    </Button>
                  </Box>
                  {detail.doubts.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">疑義照会はありません</Typography>
                  ) : (
                    <List dense disablePadding>
                      {detail.doubts.map((d) => (
                        <ListItem
                          key={d.id}
                          disableGutters
                          divider
                          sx={{ py: 0.8, alignItems: 'flex-start' }}
                          secondaryAction={
                            d.status === 'open' ? (
                              <Tooltip title="解決済みにする">
                                <IconButton size="small" color="success" onClick={() => { setResolveDialog(d); setResolution(''); }}>
                                  <CheckCircle fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            ) : (
                              <Tooltip title="再オープン">
                                <IconButton size="small" onClick={() => handleReopenDoubt(d)}>
                                  <RadioButtonUnchecked fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )
                          }
                        >
                          <Box sx={{ pr: 4, width: '100%' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.3 }}>
                              <Chip
                                label={d.status === 'open' ? '未解決' : '解決済'}
                                size="small"
                                color={d.status === 'open' ? 'error' : 'success'}
                                sx={{ fontSize: '0.65rem', height: 18 }}
                              />
                              <Typography sx={{ fontSize: '0.72rem', color: '#888' }}>
                                {fmtDate(d.doubt_date)}　{d.pharmacist_name}
                              </Typography>
                            </Box>
                            <Typography sx={{ fontSize: '0.82rem' }}>{d.content}</Typography>
                            {d.resolution && (
                              <Typography sx={{ fontSize: '0.75rem', color: '#2e7d32', mt: 0.3 }}>
                                ✓ 解決：{d.resolution}
                              </Typography>
                            )}
                          </Box>
                        </ListItem>
                      ))}
                    </List>
                  )}
                </Paper>

                {/* 監査ログ */}
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1, color: '#37474f' }}>
                    監査ログ
                  </Typography>
                  {detail.audits.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">監査記録なし</Typography>
                  ) : (
                    <TableContainer>
                      <Table size="small">
                        <TableHead sx={{ bgcolor: '#f5f5f5' }}>
                          <TableRow>
                            <TableCell sx={{ fontSize: '0.72rem', py: 0.5 }}>日付</TableCell>
                            <TableCell sx={{ fontSize: '0.72rem', py: 0.5 }}>薬剤師</TableCell>
                            <TableCell sx={{ fontSize: '0.72rem', py: 0.5 }}>コメント</TableCell>
                            <TableCell sx={{ fontSize: '0.72rem', py: 0.5 }}>申し送り</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {detail.audits.map(a => (
                            <TableRow key={a.id}>
                              <TableCell sx={{ fontSize: '0.75rem', py: 0.5, whiteSpace: 'nowrap' }}>{fmtDate(a.audit_date)}</TableCell>
                              <TableCell sx={{ fontSize: '0.75rem', py: 0.5, whiteSpace: 'nowrap' }}>{a.pharmacist_name}</TableCell>
                              <TableCell sx={{ fontSize: '0.75rem', py: 0.5 }}>{a.comment || '―'}</TableCell>
                              <TableCell sx={{ fontSize: '0.75rem', py: 0.5, color: '#555' }}>{a.handover_note || '―'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Paper>
              </Box>
            )}

          </Box>
        )}
      </Box>

      {/* ── 疑義照会追加ダイアログ ── */}
      <Dialog open={doubtDialog} onClose={() => setDoubtDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: '0.95rem', pb: 1 }}>疑義照会を追加</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth multiline rows={4}
            label="疑義内容" size="small"
            value={doubtContent} onChange={e => setDoubtContent(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDoubtDialog(false)}>キャンセル</Button>
          <Button variant="contained" color="error" onClick={handleAddDoubt} disabled={savingDoubt || !doubtContent.trim()}>
            追加
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── 疑義解決ダイアログ ── */}
      <Dialog open={!!resolveDialog} onClose={() => setResolveDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: '0.95rem', pb: 1 }}>疑義照会を解決済みにする</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1, color: '#555' }}>{resolveDialog?.content}</Typography>
          <TextField
            fullWidth multiline rows={3}
            label="解決内容・回答" size="small"
            value={resolution} onChange={e => setResolution(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResolveDialog(null)}>キャンセル</Button>
          <Button variant="contained" color="success" onClick={handleResolveDoubt}>
            解決済みにする
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
