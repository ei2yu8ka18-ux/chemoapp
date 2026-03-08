import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, TextField, Button,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Chip, CircularProgress, Alert, Dialog, DialogTitle, DialogContent,
  DialogActions, Stack,
  List, ListItem, IconButton, Tooltip, Checkbox,
} from '@mui/material';
import {
  Search, Add, CheckCircle, RadioButtonUnchecked,
  Person, ExpandMore, ExpandLess, Warning,
} from '@mui/icons-material';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartTooltip, Legend, ResponsiveContainer,
  ReferenceLine, Label,
} from 'recharts';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from 'react-router-dom';

const API = '/regimen-check';

/* ─── 型定義 ─────────────────────────────────────────────── */
interface Patient {
  id: number; patient_no: string; name: string; furigana: string;
  department: string; doctor: string; dob: string | null; gender: string | null;
  latest_regimen: string | null;
  doubt_count: number;
  unaudited_count: number;
}
interface Vital { measured_date: string; height_cm: number | null; weight_kg: number | null; bsa: number | null; }
interface Lab {
  lab_date: string;
  wbc: number | null; anc: number | null; plt: number | null; hgb: number | null; mono: number | null;
  cre: number | null; egfr: number | null; ast: number | null; alt: number | null;
  tbil: number | null; crp: number | null;
}
interface MedHistory { id: number; condition_name: string; onset_date: string | null; end_date: string | null; notes: string | null; }
interface Order {
  id: number; order_date: string; drug_name: string; dose: number | null;
  dose_unit: string | null; route: string | null; is_antineoplastic: boolean;
  bag_no: number | null; solvent_name: string | null; solvent_vol_ml: number | null;
  bag_order: number; regimen_name: string | null;
  rp_no: number | null;        // Rp番号（グルーピングキー）
  route_label: string | null;  // 投与経路ラベル
  order_no: string | null;     // オーダー番号
}
interface TreatmentHistory {
  id: number; scheduled_date: string; status: string; regimen_name: string;
  regimen_id: number; calendar_id: number | null;
  cycle_no: number | null; antineoplastic_drugs: string; support_drugs: string;
  audit_status: string | null;    // null / 'audited' / 'doubt'
  auditor_name: string | null;
  audited_at: string | null;
  calendar_status: string | null; // regimen_calendar.status
}
interface FutureSchedule { order_date: string; antineoplastic_drugs: string; }
interface Audit { id: number; audit_date: string; pharmacist_name: string; comment: string; handover_note: string; created_at: string; }
interface Doubt { id: number; doubt_date: string; content: string; status: string; resolution: string | null; pharmacist_name: string; resolved_at: string | null; }
interface InfectionLab { test_name: string; result: string; test_date: string; }
interface ToxicityRule {
  toxicity_item: string;
  grade1_action: string;
  grade2_action: string;
  grade3_action: string;
  grade4_action: string;
  regimen_name: string;
}
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
  infectionLabs: InfectionLab[];
  toxicityRules?: ToxicityRule[];
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
const fmtDateTime = (d: string | null) => {
  if (!d) return '―';
  return d.slice(0, 16).replace('T', ' ');
};

/* ─── 治療マーク型 ──────────────────────────────────────── */
interface TreatmentMark { date: string; calStatus: string | null; }

function treatmentMarkColor(status: string | null) {
  if (status === 'cancelled') return '#c62828';
  if (status === 'changed')   return '#e65100';
  return '#1565c0';
}
function treatmentMarkLabel(status: string | null) {
  if (status === 'cancelled') return '×';
  if (status === 'changed')   return '▲';
  return '●';
}

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
function BloodChart({ labs, treatmentMarks }: { labs: Lab[], treatmentMarks: TreatmentMark[] }) {
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
        {treatmentMarks.map(m => (
          <ReferenceLine key={m.date} x={m.date} stroke={treatmentMarkColor(m.calStatus)} strokeWidth={1.5} strokeOpacity={0.7}>
            <Label value={treatmentMarkLabel(m.calStatus)} position="insideTopRight" style={{ fontSize: 9, fill: treatmentMarkColor(m.calStatus), fontWeight: 'bold' }} />
          </ReferenceLine>
        ))}
        {(Object.keys(colors) as (keyof typeof colors)[]).map(k => (
          <Line key={k} type="monotone" dataKey={k} stroke={colors[k]} strokeWidth={1.5}
            dot={<ChartDot dataKey={k} fill={colors[k]} />} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ─── 腎機能グラフ ──────────────────────────────────────── */
function RenalChart({ labs, treatmentMarks }: { labs: Lab[], treatmentMarks: TreatmentMark[] }) {
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
        {treatmentMarks.map(m => (
          <ReferenceLine key={m.date} yAxisId="l" x={m.date} stroke={treatmentMarkColor(m.calStatus)} strokeWidth={1.5} strokeOpacity={0.7}>
            <Label value={treatmentMarkLabel(m.calStatus)} position="insideTopRight" style={{ fontSize: 9, fill: treatmentMarkColor(m.calStatus), fontWeight: 'bold' }} />
          </ReferenceLine>
        ))}
        <Line yAxisId="l" type="monotone" dataKey="CRE" stroke="#0288d1" strokeWidth={1.5}
          dot={<ChartDot dataKey="CRE" fill="#0288d1" />} connectNulls />
        <Line yAxisId="r" type="monotone" dataKey="eGFR" stroke="#00838f" strokeWidth={1.5}
          dot={<ChartDot dataKey="eGFR" fill="#00838f" />} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ─── 肝機能グラフ ──────────────────────────────────────── */
function HepaticChart({ labs, treatmentMarks }: { labs: Lab[], treatmentMarks: TreatmentMark[] }) {
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
        {treatmentMarks.map(m => (
          <ReferenceLine key={m.date} x={m.date} stroke={treatmentMarkColor(m.calStatus)} strokeWidth={1.5} strokeOpacity={0.7}>
            <Label value={treatmentMarkLabel(m.calStatus)} position="insideTopRight" style={{ fontSize: 9, fill: treatmentMarkColor(m.calStatus), fontWeight: 'bold' }} />
          </ReferenceLine>
        ))}
        <Line type="monotone" dataKey="AST" stroke="#7b1fa2" strokeWidth={1.5} dot={<ChartDot dataKey="AST" fill="#7b1fa2" />} connectNulls />
        <Line type="monotone" dataKey="ALT" stroke="#ad1457" strokeWidth={1.5} dot={<ChartDot dataKey="ALT" fill="#ad1457" />} connectNulls />
        <Line type="monotone" dataKey="TBil" stroke="#f4511e" strokeWidth={1.5} dot={<ChartDot dataKey="TBil" fill="#f4511e" />} connectNulls />
        <Line type="monotone" dataKey="CRP" stroke="#e65100" strokeWidth={1.5} dot={<ChartDot dataKey="CRP" fill="#e65100" />} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ─── 治療ステータスChip ─────────────────────────────────── */
function TreatmentStatusChip({ status }: { status: string }) {
  switch (status) {
    case '予定': case 'planned':
      return <Chip label="予定あり" size="small" sx={{ bgcolor: '#e3f2fd', color: '#1565c0', fontSize: '0.68rem', height: 18, fontWeight: 'bold' }} />;
    case '変更': case 'changed': case 'pending':
      return <Chip label="変更あり" size="small" sx={{ bgcolor: '#fff3e0', color: '#e65100', fontSize: '0.68rem', height: 18, fontWeight: 'bold' }} />;
    case '実施': case 'done':
      return <Chip label="済" size="small" sx={{ bgcolor: '#f5f5f5', color: '#757575', fontSize: '0.68rem', height: 18 }} />;
    case '中止': case 'cancelled':
      return <Chip label="中止" size="small" color="error" sx={{ fontSize: '0.68rem', height: 18 }} />;
    default:
      return <Chip label={status || '―'} size="small" sx={{ fontSize: '0.68rem', height: 18 }} />;
  }
}

/* ─── 監査ステータスChip ─────────────────────────────────── */
function AuditStatusChip({ status }: { status: string | null }) {
  if (status === 'audited')
    return <Chip label="監査済" size="small" sx={{ bgcolor: '#e3f2fd', color: '#1565c0', fontSize: '0.62rem', height: 16, fontWeight: 'bold' }} />;
  if (status === 'doubt')
    return <Chip label="疑義中" size="small" sx={{ bgcolor: '#ffebee', color: '#c62828', fontSize: '0.62rem', height: 16, fontWeight: 'bold' }} />;
  return <Chip label="未監査" size="small" sx={{ bgcolor: '#fff9c4', color: '#f57f17', fontSize: '0.62rem', height: 16, fontWeight: 'bold' }} />;
}

/* ─── Rp別オーダー表示（点滴説明書形式） ──────────────── */
const RP_NUMS = ['Rp①', 'Rp②', 'Rp③', 'Rp④', 'Rp⑤', 'Rp⑥', 'Rp⑦', 'Rp⑧', 'Rp⑨', 'Rp⑩'];

function OrderColumn({
  orders, label, dateStr, onReload, compareOrders,
}: {
  orders: Order[]; label: string; dateStr: string;
  onReload?: () => void;
  compareOrders?: Order[];
}) {
  const [doseEdits, setDoseEdits] = useState<Record<number, string>>({});

  const handleDoseSave = async (o: Order) => {
    const raw = doseEdits[o.id];
    if (raw === undefined) return;
    const newDose = raw === '' ? null : Number(raw);
    if (raw !== '' && isNaN(newDose as number)) return;
    try {
      await api.patch(`/regimen-check/patient-orders/${o.id}`, { dose: newDose });
      onReload?.();
    } catch { /* ignore */ }
    setDoseEdits(prev => { const m = { ...prev }; delete m[o.id]; return m; });
  };

  if (!orders.length) return (
    <Box sx={{ textAlign: 'center', py: 2 }}>
      <Typography variant="body2" color="text.secondary">{label}（{dateStr}）：オーダーなし</Typography>
    </Box>
  );

  const regimenName = orders.find(o => o.regimen_name)?.regimen_name || '';

  // --- Rp グループ化: rp_no → drugs[] ---
  // rp_no がある → rp_no でグループ化
  // rp_no がない、bag_no がある → bag_no+1 を仮 rp_no とする
  // どちらもない → 皮下注・経口等（グループ外）
  const getGroupKey = (o: Order): number | null => {
    if (o.rp_no != null) return o.rp_no;
    if (o.bag_no != null) return o.bag_no + 1;
    return null;
  };

  const rpGroups: Record<number, Order[]> = {};
  const noBagOrders: Order[] = [];

  for (const o of orders) {
    const k = getGroupKey(o);
    if (k == null) {
      noBagOrders.push(o);
    } else {
      if (!rpGroups[k]) rpGroups[k] = [];
      rpGroups[k].push(o);
    }
  }
  const sortedRpNos = Object.keys(rpGroups).map(Number).sort((a, b) => a - b);

  // 比較用 drug_name → dose マップ
  const compareMap: Record<string, number | null> = {};
  if (compareOrders) {
    for (const o of compareOrders) { compareMap[o.drug_name] = o.dose ?? null; }
  }

  const renderDrugRow = (o: Order) => {
    const editing = doseEdits[o.id] !== undefined;
    const compareDose = compareMap[o.drug_name];
    const hasDiff = compareOrders !== undefined
      && compareDose !== undefined
      && compareDose !== (o.dose ?? null);
    return (
      <Box key={o.id} sx={{
        display: 'flex', alignItems: 'center', gap: 0.5, py: 0.15, pl: 2,
      }}>
        {hasDiff && <Warning sx={{ fontSize: 11, color: '#f57f17', flexShrink: 0 }} />}
        <Typography sx={{
          fontSize: '0.73rem', flex: 1,
          color: o.is_antineoplastic ? '#b71c1c' : '#333',
          fontWeight: o.is_antineoplastic ? 'bold' : 'normal',
          lineHeight: 1.4,
        }}>
          {o.drug_name}
        </Typography>
        <TextField
          value={editing ? doseEdits[o.id] : (o.dose ?? '')}
          onChange={e => setDoseEdits(prev => ({ ...prev, [o.id]: e.target.value }))}
          onBlur={() => handleDoseSave(o)}
          onKeyDown={e => { if (e.key === 'Enter') handleDoseSave(o); }}
          size="small" placeholder="―"
          sx={{
            width: 60, flexShrink: 0,
            '& .MuiInputBase-input': {
              fontSize: '0.72rem', py: 0.15, px: 0.4, textAlign: 'right',
              color: hasDiff ? '#c62828' : 'inherit',
              fontWeight: hasDiff ? 'bold' : 'normal',
            },
          }}
        />
        <Typography sx={{ fontSize: '0.68rem', color: '#666', whiteSpace: 'nowrap', minWidth: 28 }}>
          {o.dose_unit ?? ''}
        </Typography>
      </Box>
    );
  };

  return (
    <Box>
      <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#c62828', display: 'block', mb: 0.3, fontSize: '0.78rem' }}>
        {label}　{dateStr}
      </Typography>
      {regimenName && (
        <Typography sx={{ fontSize: '0.72rem', color: '#1a237e', fontWeight: 'bold', mb: 0.5 }}>
          📋 {regimenName}
        </Typography>
      )}
      <Paper variant="outlined" sx={{ p: 0.8 }}>

        {/* ── Rp グループ（点滴説明書形式） ── */}
        {sortedRpNos.map((rpNo, idx) => {
          const drugs = rpGroups[rpNo].sort((a, b) => a.bag_order - b.bag_order);
          // 投与経路ラベル（最初の薬品から取得）
          const routeLbl = drugs.find(o => o.route_label)?.route_label
            || drugs.find(o => o.route)?.route
            || '';
          // 溶媒（solvent_name を持つ最初の薬品）
          const solventDrug = drugs.find(o => o.solvent_name);
          const rpLabel = RP_NUMS[idx] ?? `Rp${idx + 1}`;

          return (
            <Box key={rpNo} sx={{ mb: 1, pb: 0.5, borderBottom: idx < sortedRpNos.length - 1 ? '1px solid #e8e8e8' : 'none' }}>
              {/* Rp番号 + 投与経路ヘッダー */}
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, mb: 0.2 }}>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#1565c0', flexShrink: 0 }}>
                  {rpLabel}
                </Typography>
                <Typography sx={{ fontSize: '0.68rem', color: '#555', fontStyle: 'italic' }}>
                  {routeLbl}
                </Typography>
              </Box>
              {/* 溶媒ライン（あれば） */}
              {solventDrug && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.1, pl: 1.5, bgcolor: '#f0f4ff', borderRadius: 0.5, mb: 0.15 }}>
                  <Typography sx={{ fontSize: '0.72rem', color: '#37474f', fontWeight: 'bold', flex: 1 }}>
                    {solventDrug.solvent_name}
                  </Typography>
                  <Typography sx={{ fontSize: '0.7rem', color: '#555', whiteSpace: 'nowrap' }}>
                    {solventDrug.solvent_vol_ml ? `${solventDrug.solvent_vol_ml}mL` : ''}
                  </Typography>
                </Box>
              )}
              {/* 薬品リスト */}
              {drugs.map(o => renderDrugRow(o))}
            </Box>
          );
        })}

        {/* ── バッグなし（皮下注・経口等） ── */}
        {noBagOrders.length > 0 && (
          <Box sx={{ mt: sortedRpNos.length > 0 ? 0.5 : 0, borderTop: sortedRpNos.length > 0 ? '1px dashed #ccc' : undefined, pt: sortedRpNos.length > 0 ? 0.5 : 0 }}>
            {sortedRpNos.length > 0 && (
              <Typography sx={{ fontSize: '0.65rem', color: '#888', mb: 0.3 }}>その他（皮下注・経口等）</Typography>
            )}
            {noBagOrders.map(o => renderDrugRow(o))}
          </Box>
        )}
      </Paper>
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
export default function RegimenCheckPage({ filterUnaudited = false }: { filterUnaudited?: boolean }) {
  const { user } = useAuth();
  const location = useLocation();
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

  // 既往歴展開（ヘッダー近く）
  const [medHistoryOpen, setMedHistoryOpen] = useState(false);

  // 一括監査選択
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<number>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);

  // 患者一覧
  const loadPatients = useCallback(async () => {
    try {
      const r = await api.get<Patient[]>(`${API}/patients`);
      setPatients(r.data);
    } catch (e) { console.error('patients fetch error:', e); }
  }, []);

  useEffect(() => { loadPatients(); }, [loadPatients]);

  // レジメンカレンダーからの遷移で患者を自動選択
  useEffect(() => {
    const navPatientId = (location.state as any)?.patientId as number | undefined;
    if (navPatientId && patients.length > 0 && !selectedId) {
      handleSelect(navPatientId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patients.length, (location.state as any)?.patientId]);

  const loadDetail = useCallback(async (pid: number) => {
    setLoading(true); setError('');
    setSelectedHistoryIds(new Set());
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
    try {
      await api.patch(`${API}/doubts/${resolveDialog.id}`, { status: 'resolved', resolution });
      setResolveDialog(null); setResolution('');
      if (selectedId) { await loadDetail(selectedId); await loadPatients(); }
    } catch (e) {
      console.error('疑義解決エラー:', e);
      setError('疑義照会の解決に失敗しました');
    }
  };

  const handleReopenDoubt = async (d: Doubt) => {
    await api.patch(`${API}/doubts/${d.id}`, { status: 'open', resolution: null });
    if (selectedId) loadDetail(selectedId);
  };

  // Cycle番号保存
  const handleSaveCycle = async (t: TreatmentHistory, val: string) => {
    const cycleNum = val === '' ? null : Number(val);
    if (val !== '' && (isNaN(cycleNum as number) || (cycleNum as number) < 1)) return;
    try {
      if (t.calendar_id) {
        await api.patch(`${API}/calendar/${t.calendar_id}`, { cycle_no: cycleNum });
      } else {
        await api.post(`${API}/calendar/cycle`, {
          patient_id: selectedId,
          regimen_id: t.regimen_id,
          treatment_date: t.scheduled_date,
          cycle_no: cycleNum,
        });
      }
      if (selectedId) loadDetail(selectedId);
    } catch (e) { console.error('Cycle保存エラー:', e); }
  };

  // 監査ステータス設定（個別）
  const handleSetAuditStatus = async (t: TreatmentHistory, newAuditStatus: string | null) => {
    const actualStatus = t.audit_status === newAuditStatus ? null : newAuditStatus;
    try {
      await api.patch(`${API}/calendar/audit-status`, {
        patient_id: selectedId,
        regimen_id: t.regimen_id,
        treatment_date: t.scheduled_date?.slice(0, 10),
        audit_status: actualStatus,
        auditor_name: actualStatus ? (user?.displayName || '') : null,
      });
      if (selectedId) { await loadDetail(selectedId); await loadPatients(); }
    } catch (e) {
      console.error('監査ステータス更新エラー:', e);
      setError('監査ステータスの更新に失敗しました');
    }
  };

  // 一括監査ステータス変更
  const handleBatchAudit = async (newStatus: string | null) => {
    if (!selectedId || selectedHistoryIds.size === 0 || !detail) return;
    setBatchLoading(true);
    try {
      const items = detail.treatmentHistory.filter(t => selectedHistoryIds.has(t.id));
      await Promise.all(items.map(t => api.patch(`${API}/calendar/audit-status`, {
        patient_id: selectedId,
        regimen_id: t.regimen_id,
        treatment_date: t.scheduled_date?.slice(0, 10),
        audit_status: newStatus,
        auditor_name: newStatus ? (user?.displayName || '') : null,
      })));
      setSelectedHistoryIds(new Set());
      await loadDetail(selectedId);
      await loadPatients();
    } catch (e) {
      console.error('一括監査更新エラー:', e);
      setError('一括監査ステータスの更新に失敗しました');
    } finally { setBatchLoading(false); }
  };

  const toggleHistorySelect = (id: number) => {
    setSelectedHistoryIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAllHistory = () => {
    if (!detail) return;
    if (selectedHistoryIds.size === detail.treatmentHistory.length) {
      setSelectedHistoryIds(new Set());
    } else {
      setSelectedHistoryIds(new Set(detail.treatmentHistory.map(t => t.id)));
    }
  };

  const filtered = patients.filter(p => {
    if (filterUnaudited && p.doubt_count === 0 && p.unaudited_count === 0) return false;
    return !searchText || p.name?.includes(searchText) || p.patient_no?.includes(searchText) || p.furigana?.includes(searchText);
  });

  const p = detail?.patient;
  const age = p ? calcAge(p.dob) : null;
  const todayStr = new Date().toISOString().split('T')[0];
  const futureDate = detail?.futureOrders?.[0]?.order_date || '';

  // 次回予定日（治療歴から。ASCソートなので今日より後の最初のもの）
  const nextDate = useMemo(() => {
    if (!detail?.treatmentHistory) return null;
    const found = detail.treatmentHistory.find(t => (t.scheduled_date?.slice(0, 10) || '') > todayStr);
    return found?.scheduled_date?.slice(0, 10) || null;
  }, [detail?.treatmentHistory, todayStr]);

  // グラフ用治療マーク（採血日と一致する治療日のみ）
  const treatmentMarks = useMemo((): TreatmentMark[] => {
    if (!detail?.treatmentHistory || !detail?.labs) return [];
    const labDateSet = new Set(detail.labs.map(l => shortDate(l.lab_date)));
    const seen = new Set<string>();
    const marks: TreatmentMark[] = [];
    for (const t of detail.treatmentHistory) {
      const d = shortDate(t.scheduled_date?.slice(0, 10) || null);
      if (d && d !== '―' && labDateSet.has(d) && !seen.has(d)) {
        seen.add(d);
        marks.push({ date: d, calStatus: t.calendar_status || t.status });
      }
    }
    return marks;
  }, [detail?.treatmentHistory, detail?.labs]);

  // HBVDNA 3ヶ月再検査ワーニング
  // HBs抗原陽性 OR HBc抗体陽性 OR HBs抗体陽性 → HBVDNA を3ヶ月ごとにフォロー
  const hbvDnaWarning = useMemo((): string | null => {
    if (!detail?.infectionLabs?.length) return null;
    const labs = detail.infectionLabs;
    const isAtRisk = labs.some(l =>
      (l.test_name === 'HBs抗原' || l.test_name === 'HBc抗体' || l.test_name === 'HBs抗体') &&
      l.result.includes('陽性')
    );
    if (!isAtRisk) return null;
    const hbvDna = labs.find(l => l.test_name === 'HBVDNA定量');
    if (!hbvDna) return '⚠️ HBVDNA未検査';
    const testDate = new Date(hbvDna.test_date);
    const today = new Date();
    const diffDays = Math.floor((today.getTime() - testDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays >= 90) return `⚠️ HBVDNA ${diffDays}日未再検`;
    return null;
  }, [detail?.infectionLabs]);

  // レジメン減量基準ワーニング（最新採血値をCTCAE基準で判定）
  const toxicityWarnings = useMemo(() => {
    if (!detail?.toxicityRules?.length || !detail.labs.length) return [];
    const latest = detail.labs[detail.labs.length - 1];

    const getGrade = (item: string): number => {
      switch (item) {
        case 'ANC': {
          const v = latest.anc != null ? Number(latest.anc) : null;
          if (v === null) return 0;
          if (v < 0.5) return 4; if (v < 1.0) return 3; if (v < 1.5) return 2; return 1;
        }
        case 'Plt': {
          // plt は ×10⁴/μL 単位（5.0 = 50,000/μL）
          const v = latest.plt != null ? Number(latest.plt) : null;
          if (v === null) return 0;
          if (v < 2.5) return 4; if (v < 5.0) return 3; if (v < 7.5) return 2; return 1;
        }
        case 'AST': {
          const v = latest.ast != null ? Number(latest.ast) : null;
          if (v === null) return 0;
          if (v > 120) return 3; if (v > 40) return 2; return 1;
        }
        case 'ALT': {
          const v = latest.alt != null ? Number(latest.alt) : null;
          if (v === null) return 0;
          if (v > 120) return 3; if (v > 40) return 2; return 1;
        }
        case 'Cre': {
          // eGFR で判定
          const v = latest.egfr != null ? Number(latest.egfr) : null;
          if (v === null) return 0;
          if (v < 30) return 3; if (v < 60) return 2; return 1;
        }
        default:
          return 0; // 末梢神経障害・皮膚障害等はラボ値では判定不可
      }
    };

    return detail.toxicityRules
      .filter(r => getGrade(r.toxicity_item) >= 2)
      .map(r => {
        const grade = getGrade(r.toxicity_item);
        const action = grade === 4 ? r.grade4_action : grade === 3 ? r.grade3_action : r.grade2_action;
        const labValue = (() => {
          switch (r.toxicity_item) {
            case 'ANC': return `ANC ${latest.anc} ×10³/μL`;
            case 'Plt': return `Plt ${latest.plt} ×10⁴/μL`;
            case 'AST': return `AST ${latest.ast} U/L`;
            case 'ALT': return `ALT ${latest.alt} U/L`;
            case 'Cre': return `eGFR ${latest.egfr} mL/min`;
            default: return r.toxicity_item;
          }
        })();
        return { item: r.toxicity_item, grade, action, labValue };
      });
  }, [detail?.toxicityRules, detail?.labs]);

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* ── 左パネル：患者一覧 ── */}
      <Box sx={{ width: 220, flexShrink: 0, borderRight: '1px solid #ddd', display: 'flex', flexDirection: 'column', bgcolor: '#fafafa' }}>
        <Box sx={{ p: 1, borderBottom: '1px solid #ddd' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 0.5, fontSize: '0.82rem' }}>
            {filterUnaudited ? '🔴 レジメン監査未' : '📋 レジメン監査全一覧'}
          </Typography>
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
              <Box sx={{ display: 'flex', gap: 0.4, mt: 0.3, flexWrap: 'wrap' }}>
                {pt.doubt_count > 0 && (
                  <Chip label={`疑義${pt.doubt_count}件`} size="small"
                    sx={{ fontSize: '0.62rem', height: 15, bgcolor: '#ffebee', color: '#c62828', fontWeight: 'bold' }} />
                )}
                {pt.unaudited_count > 0 && (
                  <Chip label={`未監査${pt.unaudited_count}件`} size="small"
                    sx={{ fontSize: '0.62rem', height: 15, bgcolor: '#fff9c4', color: '#f57f17', fontWeight: 'bold' }} />
                )}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      {/* ── 右パネル：詳細（スクロール） ── */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* 患者ヘッダー */}
        {p ? (
          <>
            <Box sx={{ px: 2, py: 0.8, borderBottom: '1px solid #ddd', bgcolor: '#f0f4ff', display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', flexShrink: 0 }}>
              <Person sx={{ color: '#3f51b5', fontSize: 20 }} />
              <Typography sx={{ fontWeight: 'bold', fontSize: '1rem' }}>{p.name}</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#555' }}>（{p.furigana}）</Typography>
              <Chip label={`ID: ${p.patient_no}`} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
              {p.dob && <Chip label={`${fmtDate(p.dob)}（${age}歳）`} size="small" sx={{ fontSize: '0.7rem' }} />}
              {p.gender && <Chip label={p.gender} size="small" color={p.gender === '男性' ? 'info' : 'secondary'} sx={{ fontSize: '0.7rem' }} />}
              <Chip label={p.department} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
              <Chip label={`Dr. ${p.doctor}`} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
              {p.latest_vital?.height_cm && (
                <Chip label={`身長 ${p.latest_vital.height_cm}cm`} size="small" sx={{ bgcolor: '#e8f5e9', fontSize: '0.7rem' }} />
              )}
              {p.latest_vital?.weight_kg && (
                <Chip label={`体重 ${p.latest_vital.weight_kg}kg`} size="small" sx={{ bgcolor: '#e8f5e9', fontSize: '0.7rem' }} />
              )}
              {p.latest_vital?.bsa && (
                <Chip label={`BSA ${p.latest_vital.bsa}m²`} size="small" sx={{ bgcolor: '#fff9c4', fontSize: '0.7rem' }} />
              )}
            </Box>

            {/* 感染症バー（ヘッダー直下） */}
            {detail?.infectionLabs && detail.infectionLabs.length > 0 && (
              <Box sx={{ px: 2, py: 0.5, borderBottom: '1px solid #ddd', bgcolor: '#fff8e1', display: 'flex', alignItems: 'center', gap: 1.2, flexShrink: 0, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#e65100', whiteSpace: 'nowrap' }}>🦠 感染症</Typography>
                {(['HBs抗原', 'HBs抗体', 'HBc抗体', 'HBVDNA定量'] as const).map(name => {
                  const lab = detail.infectionLabs.find(l => l.test_name === name);
                  if (!lab) return null;
                  const isPositive = lab.result.includes('陽性') || (name === 'HBVDNA定量' && !lab.result.includes('検出せず'));
                  return (
                    <Tooltip key={name} title={`最終検査日: ${fmtDate(lab.test_date)}`} placement="bottom">
                      <Chip
                        label={`${name}: ${lab.result}`}
                        size="small"
                        sx={{
                          fontSize: '0.65rem', height: 18,
                          bgcolor: isPositive ? '#ffebee' : '#f1f8e9',
                          color: isPositive ? '#c62828' : '#33691e',
                          fontWeight: isPositive ? 'bold' : 'normal',
                          border: isPositive ? '1px solid #ef9a9a' : '1px solid #c5e1a5',
                          cursor: 'default',
                        }}
                      />
                    </Tooltip>
                  );
                })}
                {hbvDnaWarning && (
                  <Chip
                    label={hbvDnaWarning}
                    size="small"
                    sx={{
                      fontSize: '0.65rem', height: 20, flexShrink: 0,
                      bgcolor: '#ff6f00', color: '#fff', fontWeight: 'bold',
                    }}
                  />
                )}
              </Box>
            )}

            {/* 既往歴バー（ヘッダー直下） */}
            <Box
              onClick={() => setMedHistoryOpen(v => !v)}
              sx={{ px: 2, py: 0.5, borderBottom: '1px solid #ddd', bgcolor: '#f8f4ff', display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, cursor: 'pointer', '&:hover': { bgcolor: '#f0eaff' } }}>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#37474f', whiteSpace: 'nowrap' }}>🏥 既往歴</Typography>
              {detail?.medHistory && detail.medHistory.length > 0 ? (
                detail.medHistory.slice(0, 4).map(m => (
                  <Chip key={m.id} label={m.condition_name} size="small" variant="outlined"
                    sx={{ fontSize: '0.65rem', height: 18, bgcolor: '#fff' }} />
                ))
              ) : (
                <Typography sx={{ fontSize: '0.7rem', color: '#999' }}>登録なし</Typography>
              )}
              {detail?.medHistory && detail.medHistory.length > 4 && (
                <Typography sx={{ fontSize: '0.7rem', color: '#888' }}>+{detail.medHistory.length - 4}件</Typography>
              )}
              <Box sx={{ flexGrow: 1 }} />
              {medHistoryOpen
                ? <ExpandLess sx={{ fontSize: 16, color: '#888' }} />
                : <ExpandMore sx={{ fontSize: 16, color: '#888' }} />}
            </Box>
            {medHistoryOpen && detail?.medHistory && detail.medHistory.length > 0 && (
              <Box sx={{ px: 2, py: 0.8, borderBottom: '1px solid #ddd', bgcolor: '#faf9ff', flexShrink: 0, maxHeight: 180, overflow: 'auto' }}>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead sx={{ bgcolor: '#ede7f6' }}>
                      <TableRow>
                        <TableCell sx={{ fontSize: '0.7rem', py: 0.3, fontWeight: 'bold' }}>疾患名</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem', py: 0.3, fontWeight: 'bold' }}>発症</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem', py: 0.3, fontWeight: 'bold' }}>転帰</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {detail.medHistory.map(m => (
                        <TableRow key={m.id}>
                          <TableCell sx={{ fontSize: '0.75rem', py: 0.3, fontWeight: 'bold' }}>{m.condition_name}</TableCell>
                          <TableCell sx={{ fontSize: '0.72rem', py: 0.3, whiteSpace: 'nowrap' }}>{fmtDate(m.onset_date)}</TableCell>
                          <TableCell sx={{ fontSize: '0.72rem', py: 0.3 }}>{m.notes || '継続'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}
          </>
        ) : (
          <Box sx={{ px: 2, py: 1.2, borderBottom: '1px solid #ddd', bgcolor: '#f5f5f5', flexShrink: 0 }}>
            <Typography color="text.secondary" variant="body2">← 左から患者を選択してください</Typography>
          </Box>
        )}

        {loading && <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>}
        {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}

        {!loading && detail && (
          <Box sx={{ flexGrow: 1, overflow: 'auto', p: 1.5 }}>

            {/* ━━━━ 減量基準ワーニング ━━━━ */}
            {toxicityWarnings.length > 0 && (
              <Alert severity="warning" sx={{ mb: 1.5, py: 0.5 }}
                icon={<Warning sx={{ fontSize: 18 }} />}>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 'bold', mb: 0.5 }}>
                  ⚠️ 減量基準に該当する項目があります（{detail.toxicityRules?.[0]?.regimen_name}）
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8 }}>
                  {toxicityWarnings.map(w => (
                    <Box key={w.item} sx={{
                      bgcolor: w.grade >= 3 ? '#ffebee' : '#fff8e1',
                      border: `1px solid ${w.grade >= 3 ? '#ef9a9a' : '#ffe082'}`,
                      borderRadius: 1, px: 1, py: 0.4,
                    }}>
                      <Typography sx={{ fontSize: '0.72rem', fontWeight: 'bold', color: w.grade >= 3 ? '#c62828' : '#e65100' }}>
                        Grade {w.grade}: {w.item}（{w.labValue}）
                      </Typography>
                      <Typography sx={{ fontSize: '0.7rem', color: '#555' }}>→ {w.action}</Typography>
                    </Box>
                  ))}
                </Box>
              </Alert>
            )}

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

              {/* 一括操作バー */}
              {historyExpanded && selectedHistoryIds.size > 0 && (
                <Box sx={{ px: 1.5, py: 0.6, bgcolor: '#e8f0fe', borderBottom: '1px solid #c5cae9', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontSize: '0.78rem', color: '#3949ab', fontWeight: 'bold' }}>
                    {selectedHistoryIds.size}件選択中
                  </Typography>
                  <Button size="small" variant="contained" disabled={batchLoading}
                    sx={{ fontSize: '0.72rem', py: 0.2, bgcolor: '#1565c0', '&:hover': { bgcolor: '#0d47a1' } }}
                    onClick={() => handleBatchAudit('audited')}>
                    監査済にする
                  </Button>
                  <Button size="small" variant="contained" disabled={batchLoading}
                    sx={{ fontSize: '0.72rem', py: 0.2, bgcolor: '#c62828', '&:hover': { bgcolor: '#b71c1c' } }}
                    onClick={() => handleBatchAudit('doubt')}>
                    疑義照会中にする
                  </Button>
                  <Button size="small" variant="outlined" disabled={batchLoading}
                    sx={{ fontSize: '0.72rem', py: 0.2 }}
                    onClick={() => handleBatchAudit(null)}>
                    未監査に戻す
                  </Button>
                  <Button size="small" sx={{ fontSize: '0.72rem', py: 0.2, ml: 'auto' }}
                    onClick={() => setSelectedHistoryIds(new Set())}>
                    選択解除
                  </Button>
                </Box>
              )}

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
                          <TableCell padding="checkbox" sx={{ py: 0.3, bgcolor: '#eceff1' }}>
                            <Checkbox size="small" sx={{ p: 0 }}
                              checked={selectedHistoryIds.size === detail.treatmentHistory.length && detail.treatmentHistory.length > 0}
                              indeterminate={selectedHistoryIds.size > 0 && selectedHistoryIds.size < detail.treatmentHistory.length}
                              onChange={toggleAllHistory} />
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.72rem', py: 0.5, bgcolor: '#eceff1', fontWeight: 'bold', whiteSpace: 'nowrap' }}>実施日</TableCell>
                          <TableCell sx={{ fontSize: '0.72rem', py: 0.5, bgcolor: '#eceff1', fontWeight: 'bold' }}>レジメン</TableCell>
                          <TableCell sx={{ fontSize: '0.72rem', py: 0.5, bgcolor: '#eceff1', fontWeight: 'bold' }}>Cycle</TableCell>
                          <TableCell sx={{ fontSize: '0.72rem', py: 0.5, bgcolor: '#eceff1', fontWeight: 'bold' }}>監査</TableCell>
                          <TableCell sx={{ fontSize: '0.72rem', py: 0.5, bgcolor: '#eceff1', fontWeight: 'bold' }}>監査者</TableCell>
                          <TableCell sx={{ fontSize: '0.72rem', py: 0.5, bgcolor: '#eceff1', fontWeight: 'bold' }}>状態</TableCell>
                          <TableCell sx={{ fontSize: '0.72rem', py: 0.5, bgcolor: '#eceff1', fontWeight: 'bold' }}>抗腫瘍薬（オーダー）</TableCell>
                          <TableCell sx={{ fontSize: '0.72rem', py: 0.5, bgcolor: '#eceff1', fontWeight: 'bold' }}>支持療法</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {detail.treatmentHistory.map((t, i) => {
                          const rowDateStr = t.scheduled_date?.slice(0, 10) || '';
                          const isToday = rowDateStr === todayStr;
                          const isNext = rowDateStr === nextDate;
                          const rowBg = isToday ? '#dbeafe' : isNext ? '#dcfce7' : (i % 2 === 0 ? '#fff' : '#fafafa');
                          return (
                            <TableRow key={t.id} sx={{ bgcolor: rowBg }}>
                              <TableCell padding="checkbox" sx={{ py: 0.2 }}>
                                <Checkbox size="small" sx={{ p: 0 }}
                                  checked={selectedHistoryIds.has(t.id)}
                                  onChange={() => toggleHistorySelect(t.id)} />
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.78rem', py: 0.4, whiteSpace: 'nowrap', fontWeight: isToday ? 'bold' : 'normal', color: isToday ? '#e65100' : 'inherit' }}>
                                {fmtDate(t.scheduled_date)}
                                {isToday && <Chip label="今日" size="small" color="warning" sx={{ ml: 0.5, fontSize: '0.62rem', height: 15 }} />}
                                {isNext && <Chip label="次回" size="small" color="success" sx={{ ml: 0.5, fontSize: '0.62rem', height: 15 }} />}
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.78rem', py: 0.4, fontWeight: 'bold', color: '#1a237e' }}>{t.regimen_name}</TableCell>
                              <TableCell sx={{ py: 0.2 }}>
                                <TextField
                                  key={`cycle-${t.id}-${t.cycle_no}`}
                                  defaultValue={t.cycle_no ?? ''}
                                  onBlur={e => handleSaveCycle(t, e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                  size="small"
                                  placeholder="―"
                                  type="number"
                                  inputProps={{ min: 1, style: { textAlign: 'center' } }}
                                  sx={{ width: 56, '& .MuiInputBase-input': { fontSize: '0.75rem', py: 0.2, px: 0.5 } }}
                                />
                              </TableCell>
                              <TableCell sx={{ py: 0.2 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                                  <AuditStatusChip status={t.audit_status} />
                                  <Tooltip title={t.audit_status === 'audited' ? '未監査に戻す' : '監査済にする'}>
                                    <IconButton size="small"
                                      sx={{ p: 0.3, color: t.audit_status === 'audited' ? '#1565c0' : '#bbb' }}
                                      onClick={() => handleSetAuditStatus(t, 'audited')}>
                                      <CheckCircle sx={{ fontSize: 15 }} />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title={t.audit_status === 'doubt' ? '未監査に戻す' : '疑義照会中にする'}>
                                    <IconButton size="small"
                                      sx={{ p: 0.3, color: t.audit_status === 'doubt' ? '#c62828' : '#bbb' }}
                                      onClick={() => handleSetAuditStatus(t, 'doubt')}>
                                      <Warning sx={{ fontSize: 15 }} />
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.7rem', py: 0.4, color: t.auditor_name ? '#37474f' : '#bbb' }}>
                                {t.auditor_name ? (
                                  <>
                                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 'bold', lineHeight: 1.3 }}>{t.auditor_name}</Typography>
                                    <Typography sx={{ fontSize: '0.62rem', color: '#888', lineHeight: 1.2 }}>{fmtDateTime(t.audited_at)}</Typography>
                                  </>
                                ) : '―'}
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.72rem', py: 0.4 }}>
                                <TreatmentStatusChip status={t.status} />
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.72rem', py: 0.4, color: t.antineoplastic_drugs ? '#b71c1c' : '#bbb' }}>
                                {t.antineoplastic_drugs || '（オーダーデータなし）'}
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.7rem', py: 0.4, color: '#555' }}>
                                {t.support_drugs || '―'}
                              </TableCell>
                            </TableRow>
                          );
                        })}
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
              {(detail.todayOrders.length > 0 || detail.futureOrders.length > 0) && (
                <Box sx={{ fontSize: '0.65rem', color: '#888', mb: 0.8 }}>
                  ● 実施　▲ 変更あり　× 中止　⚠️ 今回と次回で用量が異なる薬品
                </Box>
              )}
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                <OrderColumn
                  orders={detail.todayOrders} label="今回オーダー" dateStr={fmtDate(todayStr)}
                  onReload={() => selectedId && loadDetail(selectedId)}
                  compareOrders={detail.futureOrders}
                />
                <OrderColumn
                  orders={detail.futureOrders} label="次回オーダー" dateStr={fmtDate(futureDate)}
                  onReload={() => selectedId && loadDetail(selectedId)}
                  compareOrders={detail.todayOrders}
                />
              </Box>
            </Paper>

            {/* ━━━━ ③ 採血グラフ ━━━━ */}
            <Paper variant="outlined" sx={{ mb: 1.5, p: 1.2 }}>
              <SectionHeader color="#2e7d32">🩸 骨髄系採血（対数スケール）　WBC・ANC（×10³/μL）　Plt（×10⁴/μL）　Hgb（g/dL）　Mono（×10³/μL）</SectionHeader>
              <BloodChart labs={detail.labs} treatmentMarks={treatmentMarks} />
            </Paper>

            {/* ━━━━ ④ 体格・腎肝機能（3列） ━━━━ */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1.5, mb: 1.5 }}>
              <Paper variant="outlined" sx={{ p: 1.2 }}>
                <SectionHeader color="#1565c0">⚖️ 体重・BSA（過去1年）</SectionHeader>
                <VitalChart vitals={detail.vitals} />
              </Paper>
              <Paper variant="outlined" sx={{ p: 1.2 }}>
                <SectionHeader color="#0277bd">🫘 腎機能（Cre / eGFR）</SectionHeader>
                <RenalChart labs={detail.labs} treatmentMarks={treatmentMarks} />
              </Paper>
              <Paper variant="outlined" sx={{ p: 1.2 }}>
                <SectionHeader color="#6a1b9a">🫀 肝機能（AST / ALT / T-Bil×10 / CRP）</SectionHeader>
                <HepaticChart labs={detail.labs} treatmentMarks={treatmentMarks} />
              </Paper>
            </Box>

            {/* ━━━━ ⑤ 監査・疑義（2列） ━━━━ */}
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

            {/* ━━━━ ⑥ 監査ログ ━━━━ */}
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
