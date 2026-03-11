import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, TextField, Button,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Chip, CircularProgress, Alert, Dialog, DialogTitle, DialogContent,
  DialogActions, Stack, FormControlLabel,
  List, ListItem, IconButton, Tooltip, Checkbox,
  FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import {
  Search, Add, CheckCircle, RadioButtonUnchecked,
  Person, ExpandMore, ExpandLess, Warning, OpenInFull, CloseFullscreen,
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
const HISTORY_PREVIEW_COUNT = 7;

/* 笏笏笏 蝙句ｮ夂ｾｩ 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏 */
interface Patient {
  id: number; patient_no: string; name: string; furigana: string;
  department: string; doctor: string; dob: string | null; gender: string | null;
  patient_comment?: string | null;
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
  rp_no: number | null;        // Rp逡ｪ蜿ｷ・ｽE・ｽ繧ｰ繝ｫ繝ｼ繝斐Φ繧ｰ繧ｭ繝ｼ・ｽE・ｽE
  route_label: string | null;  // 謚穂ｸ守ｵ瑚ｷｯ繝ｩ繝吶Ν
  order_no: string | null;     // 繧ｪ繝ｼ繝繝ｼ逡ｪ蜿ｷ
}
interface TreatmentHistory {
  id: number; scheduled_date: string; status: string; regimen_name: string;
  regimen_id: number; calendar_id: number | null;
  cycle_no: number | null; antineoplastic_drugs: string; support_drugs: string;
  doubt_summary?: string;
  has_open_doubt?: boolean;
  audit_status: string | null;    // null / 'audited' / 'doubt'
  auditor_name: string | null;
  audited_at: string | null;
  calendar_status: string | null; // regimen_calendar.status
}
interface FutureSchedule { order_date: string; antineoplastic_drugs: string; }
interface Audit { id: number; audit_date: string; pharmacist_name: string; comment: string; handover_note: string; created_at: string; }
interface Doubt {
  id: number;
  doubt_date: string;
  content: string;
  status: string;
  resolution: string | null;
  pharmacist_name: string;
  resolved_at: string | null;
  regimen_id?: number | null;
  regimen_name?: string | null;
  treatment_date?: string | null;
}
interface InfectionLab { test_name: string; result: string; test_date: string; }
interface PeriodicLab { test_name: string; result: string; test_date: string; }
interface ToxicityRule {
  toxicity_item: string;
  grade1_action: string;
  grade2_action: string;
  grade3_action: string;
  grade4_action: string;
  regimen_name: string;
}
interface GuidelineRule {
  id: number;
  regimen_name: string;
  rule_type: 'start_criteria' | 'dose_adjustment' | 'toxicity_management' | 'protocol_note';
  evaluation_mode: 'condition' | 'requirement' | 'manual';
  metric_key: string | null;
  comparator: string | null;
  threshold_value: number | null;
  threshold_unit: string | null;
  condition_text: string;
  action_text: string;
  severity: 'info' | 'warning' | 'error';
  source_file: string | null;
  source_line: number | null;
  is_active: boolean;
}
interface GuidelineAlert {
  rule_id: number;
  rule_type: 'start_criteria' | 'dose_adjustment' | 'toxicity_management' | 'protocol_note';
  severity: 'info' | 'warning' | 'error';
  evaluation_mode: 'condition' | 'requirement' | 'manual';
  metric_key: string | null;
  comparator: string | null;
  threshold_value: number | null;
  threshold_unit: string | null;
  condition_text: string;
  action_text: string;
  current_value: number | null;
  source_file: string | null;
  source_line: number | null;
}
interface DecisionCriterionItem {
  id: number;
  metric_key: string;
  comparator: string;
  threshold_value: number;
  threshold_unit: string | null;
  criterion_text: string;
  section_type?: string | null;
  source_section?: string | null;
}
interface DecisionDoseLevelItem {
  id: number;
  drug_name: string;
  level_index: number;
  level_label: string;
  dose_text: string;
  is_discontinue: boolean;
  section_type?: string | null;
  source_section?: string | null;
}
interface DecisionToxicityActionItem {
  id: number;
  toxicity_name: string;
  condition_text: string;
  action_text: string;
  level_delta: number;
  hold_flag: boolean;
  discontinue_flag: boolean;
  priority: number;
  section_type?: string | null;
  source_section?: string | null;
}
interface DecisionCriterionAlertItem {
  metric_key: string;
  comparator: string;
  threshold_value: number;
  threshold_unit: string | null;
  current_value: number | null;
  criterion_text: string;
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
  periodicLabs?: PeriodicLab[];
  toxicityRules?: ToxicityRule[];
  guidelineRules?: GuidelineRule[];
  guidelineAlerts?: GuidelineAlert[];
  guidelineSource?: {
    id: number;
    department?: string | null;
    regimen_name: string;
    regimen_key: string;
    source_file: string | null;
    source_title?: string | null;
    markdown_content: string;
    imported_at?: string | null;
  };
  guidelineSources?: Array<{
    id: number;
    department?: string | null;
    regimen_name: string;
    regimen_key: string;
    source_file: string | null;
    source_title?: string | null;
    imported_at?: string | null;
  }>;
  decisionSupport?: {
    source_id: number | null;
    criteria: DecisionCriterionItem[];
    doseLevels: DecisionDoseLevelItem[];
    toxicityActions: DecisionToxicityActionItem[];
    criteriaAlerts: DecisionCriterionAlertItem[];
    matchedToxicityActions: DecisionToxicityActionItem[];
    recommendedReductionLevel: number;
    recommendedDoseLevels: DecisionDoseLevelItem[];
  };
}

/* 笏笏笏 繝ｦ繝ｼ繝・・ｽ・ｽ繝ｪ繝・・ｽ・ｽ 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏 */
function calcAge(dob: string | null) {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}
const fmtDate = (d: string | null) => d ? d.slice(0, 10) : '-';
const shortDate = (d: string | null) => d ? d.slice(5).replace('-', '/') : '-';
const fmtDateTime = (d: string | null) => {
  if (!d) return '-';
  return d.slice(0, 16).replace('T', ' ');
};
const toDateValue = (d: string | null) => {
  if (!d) return 0;
  const dt = new Date(`${d.slice(0, 10)}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? 0 : dt.getTime();
};
const shortDateFromValue = (v: number) => {
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return '';
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${m}/${day}`;
};

const formatGenderLabel = (gender: string | null) => {
  if (!gender) return null;
  const normalized = gender.trim().toUpperCase();
  if (normalized === 'F' || gender === '\u5973\u6027') return '\u5973\u6027';
  if (normalized === 'M' || gender === '\u7537\u6027') return '\u7537\u6027';
  return gender;
};

const metricLabel = (metric: string | null) => {
  switch (metric) {
    case 'anc': return 'ANC';
    case 'plt': return 'Plt';
    case 'hgb': return 'Hb';
    case 'ast': return 'AST';
    case 'alt': return 'ALT';
    case 'tbil': return 'T-Bil';
    case 'egfr': return 'eGFR/CrCl';
    default: return metric || '-';
  }
};

type DoseMatrix = {
  drugNames: string[];
  levels: Array<{
    levelIndex: number;
    levelLabel: string;
    doses: Record<string, string>;
  }>;
};

function parseDoseMatrixFromGuidelineSource(raw: string): DoseMatrix {
  const empty: DoseMatrix = { drugNames: [], levels: [] };
  if (!raw || !raw.trim()) return empty;

  const normalizeCell = (v: string) => (
    v
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );

  const parseRows = (rows: string[][]): DoseMatrix => {
    if (!rows.length) return empty;
    const header = rows[0].map(normalizeCell);
    const levelCol = header.findIndex((h) => h.includes('減量レベル'));
    if (levelCol < 0) return empty;
    const drugNames = header.slice(levelCol + 1).filter(Boolean);
    if (!drugNames.length) return empty;

    const levels: DoseMatrix['levels'] = [];
    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i].map(normalizeCell);
      const levelLabel = row[levelCol] || '';
      if (!levelLabel) continue;

      let levelIndex = i - 1;
      if (/初回/.test(levelLabel)) levelIndex = 0;
      const m = levelLabel.match(/(\d+)\s*段階/);
      if (m) levelIndex = Number(m[1]);

      const doses: Record<string, string> = {};
      drugNames.forEach((drug, idx) => {
        doses[drug] = row[levelCol + 1 + idx] || '-';
      });
      levels.push({ levelIndex, levelLabel, doses });
    }

    if (!levels.length) return empty;
    levels.sort((a, b) => a.levelIndex - b.levelIndex);
    return { drugNames, levels };
  };

  try {
    if (typeof DOMParser !== 'undefined') {
      const doc = new DOMParser().parseFromString(raw, 'text/html');
      const tables = Array.from(doc.querySelectorAll('table'));
      for (const table of tables) {
        const rows = Array.from(table.querySelectorAll('tr')).map((tr) =>
          Array.from(tr.querySelectorAll('th,td')).map((cell) => normalizeCell(cell.textContent || ''))
        );
        const parsed = parseRows(rows);
        if (parsed.levels.length > 0) return parsed;
      }
    }
  } catch {
    // no-op
  }

  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.includes('|') || !line.includes('減量レベル')) continue;

    const rows: string[][] = [];
    for (let j = i; j < lines.length; j += 1) {
      const current = lines[j].trim();
      if (!current.includes('|')) break;
      if (/^\|?[\s\-:|]+\|?$/.test(current)) continue;
      const cells = current
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => normalizeCell(cell));
      rows.push(cells);
    }
    const parsed = parseRows(rows);
    if (parsed.levels.length > 0) return parsed;
  }

  return empty;
}

/* 笏笏笏 豐ｻ逋ゑｿｽE繝ｼ繧ｯ蝙・笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏 */
interface TreatmentMark { date: string; dateValue: number; calStatus: string | null; }
type TreatmentDisplayStatus = 'done' | 'changed' | 'cancelled';

function normalizeTreatmentStatus(status: string | null): TreatmentDisplayStatus | null {
  if (!status) return null;
  const normalized = status.trim().toLowerCase();
  if (normalized === 'done' || status === '\u5B9F\u65BD') return 'done';
  if (normalized === 'changed' || status === '\u5909\u66F4' || status === '\u5909\u66F4\u3042\u308A') return 'changed';
  if (normalized === 'cancelled' || status === '\u4E2D\u6B62') return 'cancelled';
  return null;
}
function isTreatmentDone(status: string | null) {
  return normalizeTreatmentStatus(status) === 'done';
}
function isTreatmentChanged(status: string | null) {
  return normalizeTreatmentStatus(status) === 'changed';
}
function isTreatmentCancelled(status: string | null) {
  return normalizeTreatmentStatus(status) === 'cancelled';
}

function treatmentMarkColor(status: string | null) {
  if (isTreatmentCancelled(status)) return '#c62828';
  if (isTreatmentChanged(status))   return '#e65100';
  return '#1565c0';
}
function treatmentMarkLabel(status: string | null) {
  if (isTreatmentCancelled(status)) return '\u00D7';
  if (isTreatmentChanged(status))   return '\u25B2';
  if (isTreatmentDone(status)) return '\uD83D\uDC89';
  return '';
}

const TreatmentXAxisTick = ({
  x,
  y,
  payload,
  variableSpacing,
  markMap,
}: any) => {
  const raw = payload?.value;
  const key = variableSpacing ? String(Number(raw)) : String(raw ?? '');
  const mark = markMap.get(key) as TreatmentMark | undefined;
  const markLabel = mark ? treatmentMarkLabel(mark.calStatus) : '';
  const label = variableSpacing ? shortDateFromValue(Number(raw)) : shortDate(String(raw));
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={10} textAnchor="middle" fill="#555" fontSize={9}>
        {label}
      </text>
      {markLabel && (
        <text
          x={0}
          y={0}
          dy={22}
          textAnchor="middle"
          fill={treatmentMarkColor(mark?.calStatus ?? null)}
          fontSize={11}
          fontWeight="bold"
        >
          {markLabel}
        </text>
      )}
    </g>
  );
};

/* 笏笏笏 繧ｰ繝ｩ繝包ｿｽE騾壹ラ繝・・ｽ・ｽ・ｽE・ｽ蛟､繝ｩ繝吶Ν莉倥″・ｽE・ｽE笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏 */
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

/* 笏笏笏 菴馴㍾繝ｻBSA 繧ｰ繝ｩ繝・笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏 */
function VitalChart({ vitals }: { vitals: Vital[] }) {
  if (!vitals.length) return <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>{'\u30C7\u30FC\u30BF\u306A\u3057'}</Typography>;
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
          <Label value="菴馴㍾(kg)" angle={-90} position="insideLeft" style={{ fontSize: 9 }} />
        </YAxis>
        <YAxis yAxisId="r" orientation="right" domain={[0.8, 2.5]} tick={{ fontSize: 9 }}>
          <Label value="BSA(mﾂｲ)" angle={90} position="insideRight" style={{ fontSize: 9 }} />
        </YAxis>
        <RechartTooltip formatter={(v: any, n?: any) => [typeof v === 'number' ? v.toFixed(n === 'bsa' ? 2 : 1) : v, n === 'weight' ? '菴馴㍾(kg)' : 'BSA(mﾂｲ)']} />
        <Legend formatter={(v) => v === 'weight' ? '菴馴㍾(kg)' : 'BSA(mﾂｲ)'} wrapperStyle={{ fontSize: 10 }} />
        <Line yAxisId="l" type="monotone" dataKey="weight" stroke="#2196f3" strokeWidth={2}
          dot={<ChartDot dataKey="weight" fill="#2196f3" />} connectNulls />
        <Line yAxisId="r" type="monotone" dataKey="bsa" stroke="#ff9800" strokeWidth={2}
          dot={<ChartDot dataKey="bsa" fill="#ff9800" />} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* 笏笏笏 鬪ｨ鬮・・ｽ・ｽ謗｡陦繧ｰ繝ｩ繝包ｼ亥ｯｾ謨ｰ繧ｹ繧ｱ繝ｼ繝ｫ・ｽE・ｽE笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏 */
function BloodChart({
  labs,
  treatmentMarks,
  variableSpacing = false,
}: {
  labs: Lab[];
  treatmentMarks: TreatmentMark[];
  variableSpacing?: boolean;
}) {
  if (!labs.length) return <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>{'\u30C7\u30FC\u30BF\u306A\u3057'}</Typography>;
  const rowByDate = new Map<string, {
    date: string;
    dateValue: number;
    WBC: number | null;
    ANC: number | null;
    Plt: number | null;
    Hgb: number | null;
    Mono: number | null;
  }>();
  labs.forEach((l) => {
    const date = l.lab_date?.slice(0, 10) || '';
    rowByDate.set(date, {
      date,
      dateValue: toDateValue(l.lab_date),
      WBC: l.wbc ? Number(l.wbc) : null,
      ANC: l.anc ? Number(l.anc) : null,
      Plt: l.plt ? Number(l.plt) : null,
      Hgb: l.hgb ? Number(l.hgb) : null,
      Mono: l.mono ? Number(l.mono) : null,
    });
  });
  treatmentMarks.forEach((m) => {
    if (!rowByDate.has(m.date)) {
      rowByDate.set(m.date, {
        date: m.date,
        dateValue: m.dateValue,
        WBC: null,
        ANC: null,
        Plt: null,
        Hgb: null,
        Mono: null,
      });
    }
  });
  const data = Array.from(rowByDate.values()).sort((a, b) => a.dateValue - b.dateValue);
  const markMap = new Map<string, TreatmentMark>();
  treatmentMarks.forEach((m) => {
    markMap.set(variableSpacing ? String(m.dateValue) : m.date, m);
  });
  const colors = { WBC: '#1976d2', ANC: '#388e3c', Plt: '#f57c00', Hgb: '#c62828', Mono: '#7b1fa2' };
  return (
    <ResponsiveContainer width="100%" height={210}>
      <LineChart data={data} margin={{ top: 18, right: 20, left: 10, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey={variableSpacing ? 'dateValue' : 'date'}
          type={variableSpacing ? 'number' : 'category'}
          scale={variableSpacing ? 'time' : 'auto'}
          domain={variableSpacing ? ['dataMin', 'dataMax'] : undefined}
          ticks={variableSpacing ? data.map((row) => row.dateValue) : undefined}
          interval={0}
          height={34}
          tick={(props) => (
            <TreatmentXAxisTick
              {...props}
              variableSpacing={variableSpacing}
              markMap={markMap}
            />
          )}
        />
        <YAxis scale="log" domain={[0.05, 'auto']} tick={{ fontSize: 9 }}
          tickFormatter={(v) => v >= 1 ? String(Math.round(v)) : v.toFixed(2)} />
        <RechartTooltip />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        <ReferenceLine y={1} stroke="#e53935" strokeDasharray="4 2"
          label={{ value: 'ANC 1.0', fontSize: 8, fill: '#e53935' }} />
        <ReferenceLine y={0.5} stroke="#b71c1c" strokeDasharray="4 2"
          label={{ value: '0.5', fontSize: 8, fill: '#b71c1c' }} />
        {treatmentMarks.map(m => (
          <ReferenceLine
            key={m.date}
            x={variableSpacing ? m.dateValue : m.date}
            stroke={treatmentMarkColor(m.calStatus)}
            strokeWidth={1.5}
            strokeOpacity={0.7}
          />
        ))}
        {(Object.keys(colors) as (keyof typeof colors)[]).map(k => (
          <Line key={k} type="monotone" dataKey={k} stroke={colors[k]} strokeWidth={1.5}
            dot={<ChartDot dataKey={k} fill={colors[k]} />} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/* 笏笏笏 閻取ｩ滂ｿｽE繧ｰ繝ｩ繝・笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏 */
function RenalChart({
  labs,
  treatmentMarks,
  variableSpacing = false,
}: {
  labs: Lab[];
  treatmentMarks: TreatmentMark[];
  variableSpacing?: boolean;
}) {
  if (!labs.length) return null;
  const rowByDate = new Map<string, {
    date: string;
    dateValue: number;
    CRE: number | null;
    eGFR: number | null;
  }>();
  labs.forEach((l) => {
    const date = l.lab_date?.slice(0, 10) || '';
    rowByDate.set(date, {
      date,
      dateValue: toDateValue(l.lab_date),
      CRE: l.cre ? Number(l.cre) : null,
      eGFR: l.egfr ? Number(l.egfr) : null,
    });
  });
  treatmentMarks.forEach((m) => {
    if (!rowByDate.has(m.date)) {
      rowByDate.set(m.date, {
        date: m.date,
        dateValue: m.dateValue,
        CRE: null,
        eGFR: null,
      });
    }
  });
  const data = Array.from(rowByDate.values()).sort((a, b) => a.dateValue - b.dateValue);
  const markMap = new Map<string, TreatmentMark>();
  treatmentMarks.forEach((m) => {
    markMap.set(variableSpacing ? String(m.dateValue) : m.date, m);
  });
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 18, right: 40, left: 0, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey={variableSpacing ? 'dateValue' : 'date'}
          type={variableSpacing ? 'number' : 'category'}
          scale={variableSpacing ? 'time' : 'auto'}
          domain={variableSpacing ? ['dataMin', 'dataMax'] : undefined}
          ticks={variableSpacing ? data.map((row) => row.dateValue) : undefined}
          interval={0}
          height={34}
          tick={(props) => (
            <TreatmentXAxisTick
              {...props}
              variableSpacing={variableSpacing}
              markMap={markMap}
            />
          )}
        />
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
          <ReferenceLine
            key={m.date}
            yAxisId="l"
            x={variableSpacing ? m.dateValue : m.date}
            stroke={treatmentMarkColor(m.calStatus)}
            strokeWidth={1.5}
            strokeOpacity={0.7}
          />
        ))}
        <Line yAxisId="l" type="monotone" dataKey="CRE" stroke="#0288d1" strokeWidth={1.5}
          dot={<ChartDot dataKey="CRE" fill="#0288d1" />} connectNulls />
        <Line yAxisId="r" type="monotone" dataKey="eGFR" stroke="#00838f" strokeWidth={1.5}
          dot={<ChartDot dataKey="eGFR" fill="#00838f" />} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* 笏笏笏 閧晄ｩ滂ｿｽE繧ｰ繝ｩ繝・笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏 */
function HepaticChart({
  labs,
  treatmentMarks,
  variableSpacing = false,
}: {
  labs: Lab[];
  treatmentMarks: TreatmentMark[];
  variableSpacing?: boolean;
}) {
  if (!labs.length) return null;
  const rowByDate = new Map<string, {
    date: string;
    dateValue: number;
    AST: number | null;
    ALT: number | null;
    TBil: number | null;
    CRP: number | null;
  }>();
  labs.forEach((l) => {
    const date = l.lab_date?.slice(0, 10) || '';
    rowByDate.set(date, {
      date,
      dateValue: toDateValue(l.lab_date),
      AST: l.ast ? Number(l.ast) : null,
      ALT: l.alt ? Number(l.alt) : null,
      TBil: l.tbil ? Number(l.tbil) * 10 : null,
      CRP: l.crp ? Number(l.crp) : null,
    });
  });
  treatmentMarks.forEach((m) => {
    if (!rowByDate.has(m.date)) {
      rowByDate.set(m.date, {
        date: m.date,
        dateValue: m.dateValue,
        AST: null,
        ALT: null,
        TBil: null,
        CRP: null,
      });
    }
  });
  const data = Array.from(rowByDate.values()).sort((a, b) => a.dateValue - b.dateValue);
  const markMap = new Map<string, TreatmentMark>();
  treatmentMarks.forEach((m) => {
    markMap.set(variableSpacing ? String(m.dateValue) : m.date, m);
  });
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 18, right: 20, left: 0, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey={variableSpacing ? 'dateValue' : 'date'}
          type={variableSpacing ? 'number' : 'category'}
          scale={variableSpacing ? 'time' : 'auto'}
          domain={variableSpacing ? ['dataMin', 'dataMax'] : undefined}
          ticks={variableSpacing ? data.map((row) => row.dateValue) : undefined}
          interval={0}
          height={34}
          tick={(props) => (
            <TreatmentXAxisTick
              {...props}
              variableSpacing={variableSpacing}
              markMap={markMap}
            />
          )}
        />
        <YAxis tick={{ fontSize: 9 }} />
        <RechartTooltip formatter={(v: any, n?: any) => [n === 'TBil' ? (Number(v) / 10).toFixed(2) + '(ﾃ・0)' : v, n ?? '']} />
        <Legend wrapperStyle={{ fontSize: 10 }} formatter={(v) => v === 'TBil' ? 'T-Bilﾃ・0' : v} />
        {treatmentMarks.map(m => (
          <ReferenceLine
            key={m.date}
            x={variableSpacing ? m.dateValue : m.date}
            stroke={treatmentMarkColor(m.calStatus)}
            strokeWidth={1.5}
            strokeOpacity={0.7}
          />
        ))}
        <Line type="monotone" dataKey="AST" stroke="#7b1fa2" strokeWidth={1.5} dot={<ChartDot dataKey="AST" fill="#7b1fa2" />} connectNulls />
        <Line type="monotone" dataKey="ALT" stroke="#ad1457" strokeWidth={1.5} dot={<ChartDot dataKey="ALT" fill="#ad1457" />} connectNulls />
        <Line type="monotone" dataKey="TBil" stroke="#f4511e" strokeWidth={1.5} dot={<ChartDot dataKey="TBil" fill="#f4511e" />} connectNulls />
        <Line type="monotone" dataKey="CRP" stroke="#e65100" strokeWidth={1.5} dot={<ChartDot dataKey="CRP" fill="#e65100" />} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* 笏笏笏 豐ｻ逋ゅせ繝・・ｽE繧ｿ繧ｹChip 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏 */
function TreatmentStatusChip({ status }: { status: string }) {
  switch (status) {
    case '\u4E88\u5B9A': case 'planned':
      return <Chip label={'\u4E88\u5B9A\u3042\u308A'} size="small" sx={{ bgcolor: '#e3f2fd', color: '#1565c0', fontSize: '0.68rem', height: 18, fontWeight: 'bold' }} />;
    case '\u5909\u66F4': case 'changed': case 'pending':
      return <Chip label={'\u5909\u66F4\u3042\u308A'} size="small" sx={{ bgcolor: '#fff3e0', color: '#e65100', fontSize: '0.68rem', height: 18, fontWeight: 'bold' }} />;
    case '\u5B9F\u65BD': case 'done':
      return <Chip label={'\u5B9F\u65BD'} size="small" sx={{ bgcolor: '#f5f5f5', color: '#757575', fontSize: '0.68rem', height: 18 }} />;
    case '\u4E2D\u6B62': case 'cancelled':
      return <Chip label={'\u4E2D\u6B62'} size="small" color="error" sx={{ fontSize: '0.68rem', height: 18 }} />;
    default:
      return <Chip label={status || '-'} size="small" sx={{ fontSize: '0.68rem', height: 18 }} />;
  }
}

/* 笏笏笏 逶｣譟ｻ繧ｹ繝・・ｽE繧ｿ繧ｹChip 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏 */
function AuditStatusChip({ status }: { status: string | null }) {
  if (status === 'audited')
    return <Chip label={'\u76E3\u67FB\u6E08'} size="small" sx={{ bgcolor: '#e3f2fd', color: '#1565c0', fontSize: '0.62rem', height: 16, fontWeight: 'bold' }} />;
  if (status === 'doubt')
    return <Chip label={'\u7591\u7FA9\u4E2D'} size="small" sx={{ bgcolor: '#ffebee', color: '#c62828', fontSize: '0.62rem', height: 16, fontWeight: 'bold' }} />;
  return <Chip label={'\u672A\u76E3\u67FB'} size="small" sx={{ bgcolor: '#fff9c4', color: '#f57f17', fontSize: '0.62rem', height: 16, fontWeight: 'bold' }} />;
}

/* 笏笏笏 Rp蛻･繧ｪ繝ｼ繝繝ｼ陦ｨ遉ｺ・ｽE・ｽ轤ｹ貊ｴ隱ｬ譏取嶌蠖｢蠑擾ｼ・笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏 */
const RP_NUMS = ['Rp竭', 'Rp竭｡', 'Rp竭｢', 'Rp竭｣', 'Rp竭､', 'Rp竭･', 'Rp竭ｦ', 'Rp竭ｧ', 'Rp竭ｨ', 'Rp竭ｩ'];

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
      <Typography variant="body2" color="text.secondary">{`${label} (${dateStr}): \u30AA\u30FC\u30C0\u30FC\u30C7\u30FC\u30BF\u306A\u3057`}</Typography>
    </Box>
  );

  const regimenName = orders.find(o => o.regimen_name)?.regimen_name || '';

  // --- Rp 繧ｰ繝ｫ繝ｼ繝怜喧: rp_no 竊・drugs[] ---
  // rp_no 縺後≠繧・竊・rp_no 縺ｧ繧ｰ繝ｫ繝ｼ繝怜喧
  // rp_no 縺後↑縺・・ｽ・ｽbag_no 縺後≠繧・竊・bag_no+1 繧剃ｻｮ rp_no 縺ｨ縺吶ｋ
  // 縺ｩ縺｡繧峨ｂ縺ｪ縺・竊・逧ｮ荳区ｳｨ繝ｻ邨悟哨遲会ｼ医げ繝ｫ繝ｼ繝怜､厄ｼ・
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

  // 豈碑ｼ・・ｽ・ｽ drug_name 竊・dose 繝槭ャ繝・
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
          size="small" placeholder=""
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
        {label}縲{dateStr}
      </Typography>
      {regimenName && (
        <Typography sx={{ fontSize: '0.72rem', color: '#1a237e', fontWeight: 'bold', mb: 0.5 }}>
          搭 {regimenName}
        </Typography>
      )}
      <Paper variant="outlined" sx={{ p: 0.8 }}>

        {/* 笏笏 Rp 繧ｰ繝ｫ繝ｼ繝暦ｼ育せ貊ｴ隱ｬ譏取嶌蠖｢蠑擾ｼ・笏笏 */}
        {sortedRpNos.map((rpNo, idx) => {
          const drugs = rpGroups[rpNo].sort((a, b) => a.bag_order - b.bag_order);
          // 謚穂ｸ守ｵ瑚ｷｯ繝ｩ繝吶Ν・ｽE・ｽ譛蛻晢ｿｽE阮ｬ蜩√°繧牙叙蠕暦ｼ・
          const routeLbl = drugs.find(o => o.route_label)?.route_label
            || drugs.find(o => o.route)?.route
            || '';
          // 貅ｶ蟐抵ｼ・olvent_name 繧呈戟縺､譛蛻晢ｿｽE阮ｬ蜩・・ｽ・ｽE
          const solventDrug = drugs.find(o => o.solvent_name);
          const rpLabel = RP_NUMS[idx] ?? `Rp${idx + 1}`;

          return (
            <Box key={rpNo} sx={{ mb: 1, pb: 0.5, borderBottom: idx < sortedRpNos.length - 1 ? '1px solid #e8e8e8' : 'none' }}>
              {/* Rp逡ｪ蜿ｷ + 謚穂ｸ守ｵ瑚ｷｯ繝倥ャ繝繝ｼ */}
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, mb: 0.2 }}>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#1565c0', flexShrink: 0 }}>
                  {rpLabel}
                </Typography>
                <Typography sx={{ fontSize: '0.68rem', color: '#555', fontStyle: 'italic' }}>
                  {routeLbl}
                </Typography>
              </Box>
              {/* 貅ｶ蟐偵Λ繧､繝ｳ・ｽE・ｽ縺ゅｌ・ｽE・ｽE・ｽE*/}
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
              {/* 阮ｬ蜩√Μ繧ｹ繝・*/}
              {drugs.map(o => renderDrugRow(o))}
            </Box>
          );
        })}

        {/* 笏笏 繝舌ャ繧ｰ縺ｪ縺暦ｼ育坩荳区ｳｨ繝ｻ邨悟哨遲会ｼ・笏笏 */}
        {noBagOrders.length > 0 && (
          <Box sx={{ mt: sortedRpNos.length > 0 ? 0.5 : 0, borderTop: sortedRpNos.length > 0 ? '1px dashed #ccc' : undefined, pt: sortedRpNos.length > 0 ? 0.5 : 0 }}>
            {sortedRpNos.length > 0 && (
              <Typography sx={{ fontSize: '0.65rem', color: '#888', mb: 0.3 }}>{'\u305D\u306E\u4ED6\uFF08\u76AE\u4E0B\u6CE8\u30FB\u7D4C\u53E3\u7B49\uFF09'}</Typography>
            )}
            {noBagOrders.map(o => renderDrugRow(o))}
          </Box>
        )}
      </Paper>
    </Box>
  );
}

/* 笏笏笏 繧ｻ繧ｯ繧ｷ繝ｧ繝ｳ繝倥ャ繝繝ｼ 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏 */
function SectionHeader({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color, mb: 0.8, mt: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.82rem' }}>
      {children}
    </Typography>
  );
}

/* 笏笏笏 繝｡繧､繝ｳ繧ｳ繝ｳ繝晢ｿｽE繝阪Φ繝・笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏 */
export default function RegimenCheckPage({ filterUnaudited = false }: { filterUnaudited?: boolean }) {
  const { user } = useAuth();
  const location = useLocation();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 逶｣譟ｻ蜈･蜉・
  const [auditComment, setAuditComment] = useState('');
  const [handoverNote, setHandoverNote] = useState('');
  const [savingAudit, setSavingAudit] = useState(false);

  // 逍醍ｾｩ辣ｧ莨・
  const [doubtDialog, setDoubtDialog] = useState(false);
  const [doubtContent, setDoubtContent] = useState('');
  const [savingDoubt, setSavingDoubt] = useState(false);
  const [doubtTarget, setDoubtTarget] = useState<TreatmentHistory | null>(null);
  const [resolveDialog, setResolveDialog] = useState<Doubt | null>(null);
  const [resolution, setResolution] = useState('');
  const [patientComment, setPatientComment] = useState('');
  const [savingPatientComment, setSavingPatientComment] = useState(false);
  const [variableLabSpacing, setVariableLabSpacing] = useState(false);
  const [guidelineDialogOpen, setGuidelineDialogOpen] = useState(false);
  const [mdPanelExpanded, setMdPanelExpanded] = useState(false);
  const [guidelineFilterDepartment, setGuidelineFilterDepartment] = useState('');
  const [guidelineFilterRegimen, setGuidelineFilterRegimen] = useState('');

  // 豐ｻ逋よｭｴ螻暮幕
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [showAllHistoryRows, setShowAllHistoryRows] = useState(false);

  // 譌｢蠕豁ｴ螻暮幕・ｽE・ｽ・ｽE繝・・ｽ・ｽ繝ｼ霑代￥・ｽE・ｽE
  const [medHistoryOpen, setMedHistoryOpen] = useState(false);

  // 荳諡ｬ逶｣譟ｻ驕ｸ謚・
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<number>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);

  // 謔｣閠・・ｽ・ｽ隕ｧ
  const loadPatients = useCallback(async () => {
    try {
      const r = await api.get<Patient[]>(`${API}/patients`);
      setPatients(r.data);
    } catch (e) { console.error('patients fetch error:', e); }
  }, []);

  useEffect(() => { loadPatients(); }, [loadPatients]);

  // 繝ｬ繧ｸ繝｡繝ｳ繧ｫ繝ｬ繝ｳ繝繝ｼ縺九ｉ縺ｮ驕ｷ遘ｻ縺ｧ謔｣閠・・ｽ・ｽ閾ｪ蜍暮∈謚・
  useEffect(() => {
    const navPatientId = (location.state as any)?.patientId as number | undefined;
    if (navPatientId && patients.length > 0 && !selectedId) {
      handleSelect(navPatientId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patients.length, (location.state as any)?.patientId]);

  const loadDetail = useCallback(async (
    pid: number,
    departmentFilter?: string,
    regimenFilter?: string,
  ) => {
    setLoading(true); setError('');
    setSelectedHistoryIds(new Set());
    setShowAllHistoryRows(false);
    setGuidelineDialogOpen(false);
    try {
      const params: Record<string, string> = {};
      if ((departmentFilter || '').trim()) params.guidelineDepartment = (departmentFilter || '').trim();
      if ((regimenFilter || '').trim()) params.guidelineRegimen = (regimenFilter || '').trim();
      const r = await api.get<Detail>(`${API}/${pid}/detail`, {
        params: Object.keys(params).length ? params : undefined,
      });
      setDetail(r.data);
      setGuidelineFilterDepartment((prev) => prev || r.data.patient?.department || '');
      setGuidelineFilterRegimen((prev) => prev || r.data.guidelineSource?.regimen_key || '');
      setAuditComment(r.data.audits[0]?.comment || '');
      setHandoverNote(r.data.audits[0]?.handover_note || '');
      setPatientComment(r.data.patient?.patient_comment || '');
    } catch (e) {
      console.error('detail fetch error:', e);
      setError('\u30C7\u30FC\u30BF\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F');
    } finally { setLoading(false); }
  }, []);

  const handleSelect = (id: number) => {
    setSelectedId(id);
    setGuidelineFilterDepartment('');
    setGuidelineFilterRegimen('');
    loadDetail(id);
  };

  const handleGuidelineDepartmentChange = async (department: string) => {
    setGuidelineFilterDepartment(department);
    if (selectedId) {
      await loadDetail(selectedId, department, guidelineFilterRegimen);
    }
  };

  const handleGuidelineRegimenChange = async (regimenKey: string) => {
    setGuidelineFilterRegimen(regimenKey);
    if (selectedId) {
      await loadDetail(selectedId, guidelineFilterDepartment, regimenKey);
    }
  };

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

  const handleSavePatientComment = async () => {
    if (!selectedId) return;
    setSavingPatientComment(true);
    try {
      await api.patch(`${API}/patients/${selectedId}/comment`, { patient_comment: patientComment });
      await loadPatients();
      await loadDetail(selectedId);
    } catch (e) {
      console.error('patient comment save error:', e);
      setError('\u60A3\u8005\u30B3\u30E1\u30F3\u30C8\u306E\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F');
    } finally {
      setSavingPatientComment(false);
    }
  };

  const handleAddDoubt = async () => {
    if (!selectedId || !doubtContent.trim()) return;
    setSavingDoubt(true);
    try {
      await api.post(`${API}/${selectedId}/doubts`, {
        content: doubtContent,
        pharmacist_name: user?.displayName || '',
        regimen_id: doubtTarget?.regimen_id ?? null,
        treatment_date: doubtTarget?.scheduled_date?.slice(0, 10) ?? null,
      });
      setDoubtContent('');
      setDoubtDialog(false);
      setDoubtTarget(null);
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
      console.error('逍醍ｾｩ隗｣豎ｺ繧ｨ繝ｩ繝ｼ:', e);
      setError('\u7591\u7FA9\u7167\u4F1A\u306E\u89E3\u6C7A\u306B\u5931\u6557\u3057\u307E\u3057\u305F');
    }
  };

  const handleReopenDoubt = async (d: Doubt) => {
    await api.patch(`${API}/doubts/${d.id}`, { status: 'open', resolution: null });
    if (selectedId) loadDetail(selectedId);
  };

  // Cycle逡ｪ蜿ｷ菫晏ｭ・
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
    } catch (e) { console.error('Cycle菫晏ｭ倥お繝ｩ繝ｼ:', e); }
  };

  // 逶｣譟ｻ繧ｹ繝・・ｽE繧ｿ繧ｹ險ｭ螳夲ｼ亥句挨・ｽE・ｽE
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
      console.error('逶｣譟ｻ繧ｹ繝・・ｽE繧ｿ繧ｹ譖ｴ譁ｰ繧ｨ繝ｩ繝ｼ:', e);
      setError('\u76E3\u67FB\u30B9\u30C6\u30FC\u30BF\u30B9\u306E\u66F4\u65B0\u306B\u5931\u6557\u3057\u307E\u3057\u305F');
    }
  };

  // 荳諡ｬ逶｣譟ｻ繧ｹ繝・・ｽE繧ｿ繧ｹ螟画峩
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
      console.error('荳諡ｬ逶｣譟ｻ譖ｴ譁ｰ繧ｨ繝ｩ繝ｼ:', e);
      setError('\u4E00\u62EC\u76E3\u67FB\u30B9\u30C6\u30FC\u30BF\u30B9\u306E\u66F4\u65B0\u306B\u5931\u6557\u3057\u307E\u3057\u305F');
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
    const visibleIds = visibleTreatmentHistory.map(t => t.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedHistoryIds.has(id));
    setSelectedHistoryIds(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  };

  const filtered = patients.filter(p => {
    if (filterUnaudited) {
      const doubt = Number(p.doubt_count) || 0;
      const unaudited = Number(p.unaudited_count) || 0;
      if (doubt === 0 && unaudited === 0) return false;
    }
    return !searchText || p.name?.includes(searchText) || p.patient_no?.includes(searchText) || p.furigana?.includes(searchText);
  });

  const p = detail?.patient;
  const age = p ? calcAge(p.dob) : null;
  const displayGender = p ? formatGenderLabel(p.gender) : null;
  const todayStr = new Date().toISOString().split('T')[0];
  const futureDate = detail?.futureOrders?.[0]?.order_date || '';

  // 谺｡蝗樔ｺ亥ｮ壽律・ｽE・ｽ豐ｻ逋よｭｴ縺九ｉ縲・SC繧ｽ繝ｼ繝医↑縺ｮ縺ｧ莉頑律繧医ｊ蠕鯉ｿｽE譛蛻晢ｿｽE繧ゑｿｽE・ｽE・ｽE
  const nextDate = useMemo(() => {
    if (!detail?.treatmentHistory) return null;
    const found = detail.treatmentHistory.find(t => (t.scheduled_date?.slice(0, 10) || '') > todayStr);
    return found?.scheduled_date?.slice(0, 10) || null;
  }, [detail?.treatmentHistory, todayStr]);

  const visibleTreatmentHistory = useMemo(() => {
    if (!detail?.treatmentHistory) return [];
    return showAllHistoryRows
      ? detail.treatmentHistory
      : detail.treatmentHistory.slice(-HISTORY_PREVIEW_COUNT);
  }, [detail?.treatmentHistory, showAllHistoryRows]);

  useEffect(() => {
    if (!detail?.treatmentHistory || showAllHistoryRows) return;
    const visibleIds = new Set(detail.treatmentHistory.slice(-HISTORY_PREVIEW_COUNT).map(t => t.id));
    setSelectedHistoryIds(prev => {
      if (prev.size === 0) return prev;
      const next = new Set<number>();
      for (const id of prev) if (visibleIds.has(id)) next.add(id);
      return next;
    });
  }, [detail?.treatmentHistory, showAllHistoryRows]);

  // Treatment marks for lab charts: show only done/changed/cancelled by treatment date.
  const treatmentStatusPriority: Record<TreatmentDisplayStatus, number> = { done: 1, changed: 2, cancelled: 3 };
  const treatmentMarks = useMemo((): TreatmentMark[] => {
    if (!detail?.treatmentHistory) return [];

    const byDate = new Map<string, TreatmentMark>();
    for (const t of detail.treatmentHistory) {
      const date = t.scheduled_date?.slice(0, 10) || '';
      const status = normalizeTreatmentStatus(t.calendar_status || t.status || null);
      if (!date || !status) continue;

      const existing = byDate.get(date);
      if (!existing) {
        byDate.set(date, { date, dateValue: toDateValue(date), calStatus: status });
        continue;
      }

      const existingStatus = normalizeTreatmentStatus(existing.calStatus);
      if (!existingStatus || treatmentStatusPriority[status] >= treatmentStatusPriority[existingStatus]) {
        byDate.set(date, { date, dateValue: toDateValue(date), calStatus: status });
      }
    }

    return Array.from(byDate.values()).sort((a, b) => a.dateValue - b.dateValue);
  }, [detail?.treatmentHistory]);

  // HBVDNA 3繝ｶ譛茨ｿｽE讀懈渊繝ｯ繝ｼ繝九Φ繧ｰ
  // HBs謚怜次髯ｽ諤ｧ OR HBc謚嶺ｽ馴區諤ｧ OR HBs謚嶺ｽ馴區諤ｧ 竊・HBVDNA 繧・繝ｶ譛医＃縺ｨ縺ｫ繝輔か繝ｭ繝ｼ
  const hbvDnaWarning = useMemo((): string | null => {
    if (!detail?.infectionLabs?.length) return null;
    const labs = detail.infectionLabs;
    const isAtRisk = labs.some(l =>
      (l.test_name === '\u0048\u0042\u0073\u6297\u539F' || l.test_name === '\u0048\u0042\u0063\u6297\u4F53' || l.test_name === '\u0048\u0042\u0073\u6297\u4F53') &&
      l.result.includes('\u967D\u6027')
    );
    if (!isAtRisk) return null;
    const hbvDna = labs.find(l => l.test_name === 'HBVDNA螳夐㍼');
    if (!hbvDna) return '\u26A0\uFE0F HBVDNA\u672A\u6E2C\u5B9A';
    const testDate = new Date(hbvDna.test_date);
    const today = new Date();
    const diffDays = Math.floor((today.getTime() - testDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays >= 90) return `\u26A0\uFE0F HBVDNA ${diffDays}\u65E5\u672A\u6E2C\u5B9A`;
    return null;
  }, [detail?.infectionLabs]);

  const periodicLabStatuses = useMemo(() => {
    const periodicLabs = detail?.periodicLabs ?? [];
    if (!periodicLabs.length) return [];

    const normalizeTestName = (name: string) => name.replace(/[-\s]/g, '').toUpperCase();
    const rules = [
      { name: '\u4E9C\u925B', warnDays: 90 },
      { name: '\u9285', warnDays: 90 },
      { name: 'KL6', warnDays: 30 },
      { name: 'TSH', warnDays: 30 },
    ] as const;

    const now = Date.now();
    return rules.flatMap(rule => {
      const candidates = periodicLabs.filter(
        l => normalizeTestName(l.test_name) === normalizeTestName(rule.name)
      );
      if (!candidates.length) return [];

      const latest = candidates.reduce((a, b) =>
        new Date(b.test_date).getTime() > new Date(a.test_date).getTime() ? b : a
      );
      const measuredAt = new Date(latest.test_date).getTime();
      if (!Number.isFinite(measuredAt)) return [];

      const diffDays = Math.floor((now - measuredAt) / (1000 * 60 * 60 * 24));
      if (diffDays < rule.warnDays) return [];

      return [{
        ...rule,
        result: latest.result,
        testDate: latest.test_date,
        warning: `${rule.name} ${diffDays}\u65E5\u672A\u6E2C\u5B9A`,
      }];
    });
  }, [detail?.periodicLabs]);

  // 繝ｬ繧ｸ繝｡繝ｳ貂幃㍼蝓ｺ貅悶Ρ繝ｼ繝九Φ繧ｰ・ｽE・ｽ譛譁ｰ謗｡陦蛟､繧辰TCAE蝓ｺ貅悶〒蛻､螳夲ｼ・
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
          // plt は x10^4/uL 単位（5.0 = 50,000/uL）
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
          // eGFR で評価
          const v = latest.egfr != null ? Number(latest.egfr) : null;
          if (v === null) return 0;
          if (v < 30) return 3; if (v < 60) return 2; return 1;
        }
        default:
          return 0;
      }
    };

    return detail.toxicityRules
      .filter(r => getGrade(r.toxicity_item) >= 2)
      .map(r => {
        const grade = getGrade(r.toxicity_item);
        const action = grade === 4 ? r.grade4_action : grade === 3 ? r.grade3_action : r.grade2_action;
        const labValue = (() => {
          switch (r.toxicity_item) {
            case 'ANC': return `ANC ${latest.anc} x10^3/uL`;
            case 'Plt': return `Plt ${latest.plt} x10^4/uL`;
            case 'AST': return `AST ${latest.ast} U/L`;
            case 'ALT': return `ALT ${latest.alt} U/L`;
            case 'Cre': return `eGFR ${latest.egfr} mL/min`;
            default: return r.toxicity_item;
          }
        })();
        return { item: r.toxicity_item, grade, action, labValue };
      });
  }, [detail?.toxicityRules, detail?.labs]);

  const guidelineRules = detail?.guidelineRules ?? [];
  const guidelineAlerts = detail?.guidelineAlerts ?? [];
  const guidelineRegimenName = guidelineRules[0]?.regimen_name || detail?.toxicityRules?.[0]?.regimen_name || '';
  const guidelineMarkdown = detail?.guidelineSource?.markdown_content || '';
  const guidelineSourceFile = detail?.guidelineSource?.source_file || '';
  const guidelineSources = detail?.guidelineSources ?? [];
  const isGuidelineSourceUrl = /^https?:\/\//i.test(guidelineSourceFile);
  const isGuidelineHtml = !isGuidelineSourceUrl && /<\s*(html|body|table|div|section|article|h1|p)\b/i.test(guidelineMarkdown);
  const guidelineMarkdownTitle = detail?.guidelineSource?.regimen_name || guidelineRegimenName || '';
  const guidelineDepartmentOptions = Array.from(new Set([
    detail?.patient?.department || '',
    ...guidelineSources.map((row) => row.department || ''),
  ].filter(Boolean)));
  const guidelineRegimenOptions = guidelineSources
    .filter((row) => !guidelineFilterDepartment || (row.department || '') === guidelineFilterDepartment)
    .reduce<Array<{ key: string; name: string }>>((acc, row) => {
      if (!acc.some((item) => item.key === row.regimen_key)) {
        acc.push({ key: row.regimen_key, name: row.regimen_name });
      }
      return acc;
    }, []);
  const decisionSupport = detail?.decisionSupport;
  const decisionCriteriaAlerts = decisionSupport?.criteriaAlerts ?? [];
  const decisionMatchedToxicityActions = decisionSupport?.matchedToxicityActions ?? [];
  const decisionHasData = (decisionSupport?.criteria?.length ?? 0) > 0
    || (decisionSupport?.doseLevels?.length ?? 0) > 0
    || (decisionSupport?.toxicityActions?.length ?? 0) > 0;
  const decisionLatestLabDate = useMemo(() => {
    const labs = detail?.labs ?? [];
    if (!labs.length) return null;
    let latest = labs[0];
    for (const row of labs) {
      if (toDateValue(row.lab_date) > toDateValue(latest.lab_date)) latest = row;
    }
    return latest.lab_date ? latest.lab_date.slice(0, 10) : null;
  }, [detail?.labs]);
  const decisionDoseMatrix = useMemo<DoseMatrix>(() => {
    const rows = decisionSupport?.doseLevels ?? [];
    const drugNames = Array.from(new Set(rows.map((r) => r.drug_name).filter(Boolean)));
    const byLevel = new Map<string, { levelIndex: number; levelLabel: string; doses: Record<string, string> }>();
    for (const row of rows) {
      const key = `${row.level_index}|${row.level_label}`;
      const current = byLevel.get(key) || {
        levelIndex: row.level_index,
        levelLabel: row.level_label || `${row.level_index}段階減量`,
        doses: {},
      };
      current.doses[row.drug_name] = row.dose_text;
      byLevel.set(key, current);
    }
    const levels = Array.from(byLevel.values()).sort((a, b) => a.levelIndex - b.levelIndex);
    if (drugNames.length > 0 && levels.length > 0) {
      return { drugNames, levels };
    }
    return parseDoseMatrixFromGuidelineSource(guidelineMarkdown);
  }, [decisionSupport?.doseLevels, guidelineMarkdown]);
  const showDoseReductionTable = decisionDoseMatrix.levels.length > 0
    && (
      decisionCriteriaAlerts.length > 0
      || ((decisionSupport?.recommendedReductionLevel ?? 0) > 0)
      || decisionMatchedToxicityActions.length > 0
    );

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* 笏笏 蟾ｦ繝代ロ繝ｫ・ｽE・ｽ謔｣閠・・ｽ・ｽ隕ｧ 笏笏 */}
      <Box sx={{ width: 220, flexShrink: 0, borderRight: '1px solid #ddd', display: 'flex', flexDirection: 'column', bgcolor: '#fafafa' }}>
        <Box sx={{ p: 1, borderBottom: '1px solid #ddd' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 0.5, fontSize: '0.82rem' }}>
            {filterUnaudited ? '未監査レジメン' : 'レジメン監査一覧'}
          </Typography>
          <TextField
            size="small" fullWidth placeholder={'\u60A3\u8005\u540D\u30FBID\u691C\u7D22'}
            value={searchText} onChange={e => setSearchText(e.target.value)}
            InputProps={{ startAdornment: <Search sx={{ fontSize: 15, color: '#aaa', mr: 0.5 }} /> }}
            sx={{ '& .MuiInputBase-input': { fontSize: '0.75rem', py: 0.5 } }}
          />
        </Box>
        <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
          {filtered.length === 0 && (
            <Typography variant="body2" sx={{ color: '#888', p: 2, fontSize: '0.75rem' }}>{'\u60A3\u8005\u304C\u3044\u307E\u305B\u3093'}</Typography>
          )}
          {filtered.map(pt => (
            <Box key={pt.id} onClick={() => handleSelect(pt.id)}
              sx={{
                px: 1.5, py: 0.8, cursor: 'pointer', borderBottom: '1px solid #eee',
                bgcolor: selectedId === pt.id ? '#e3f2fd' : 'transparent',
                '&:hover': { bgcolor: selectedId === pt.id ? '#e3f2fd' : '#f0f4f8' },
              }}>
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 'bold', color: '#1a237e' }}>
                {pt.patient_no} {pt.name}
              </Typography>
              <Typography sx={{ fontSize: '0.68rem', color: '#666' }}>{pt.latest_regimen || '-'}</Typography>
              <Box sx={{ display: 'flex', gap: 0.4, mt: 0.3, flexWrap: 'wrap' }}>
                {pt.doubt_count > 0 && (
                  <Chip label={`疑義照会${pt.doubt_count}件`} size="small"
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

      {/* 笏笏 蜿ｳ繝代ロ繝ｫ・ｽE・ｽ隧ｳ邏ｰ・ｽE・ｽ繧ｹ繧ｯ繝ｭ繝ｼ繝ｫ・ｽE・ｽE笏笏 */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* 謔｣閠・・ｽE繝・・ｽ・ｽ繝ｼ */}
        {p ? (
          <>
            <Box sx={{ px: 2, py: 0.8, borderBottom: '1px solid #ddd', bgcolor: '#f0f4ff', display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', flexShrink: 0 }}>
              <Person sx={{ color: '#3f51b5', fontSize: 20 }} />
              <Typography sx={{ fontWeight: 'bold', fontSize: '1rem' }}>{p.name}</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#555' }}>{p.furigana ? `(${p.furigana})` : ''}</Typography>
              <Chip label={`ID: ${p.patient_no}`} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
              {p.dob && <Chip label={`${fmtDate(p.dob)} / ${age}\u6B73`} size="small" sx={{ fontSize: '0.7rem' }} />}
              {displayGender && (
                <Chip
                  label={displayGender === '\u5973\u6027' ? '\u2640 \u5973\u6027' : '\u2642 \u7537\u6027'}
                  size="small"
                  variant="outlined"
                  sx={{
                    fontSize: '0.7rem',
                    fontWeight: 'bold',
                    color: displayGender === '\u5973\u6027' ? '#c62828' : '#1565c0',
                    borderColor: displayGender === '\u5973\u6027' ? '#ef9a9a' : '#90caf9',
                    bgcolor: displayGender === '\u5973\u6027' ? '#ffebee' : '#e3f2fd',
                  }}
                />
              )}
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

            <Box sx={{ px: 2, py: 0.5, borderBottom: '1px solid #ddd', bgcolor: '#fffbe6', flexShrink: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#8d6e63', whiteSpace: 'nowrap' }}>
                  {'\u60A3\u8005\u30B3\u30E1\u30F3\u30C8'}
                </Typography>
                <TextField
                  multiline
                  minRows={1}
                  maxRows={3}
                  size="small"
                  value={patientComment}
                  onChange={e => setPatientComment(e.target.value)}
                  placeholder={'\u4F8B: \u767D\u91D1\u88FD\u5264\u30A2\u30EC\u30EB\u30AE\u30FC\u6B74\u3042\u308A'}
                  sx={{
                    flex: '1 1 420px',
                    maxWidth: 620,
                    '& .MuiInputBase-input': { fontSize: '0.74rem', py: 0.55 },
                  }}
                />
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleSavePatientComment}
                  disabled={savingPatientComment}
                  sx={{ fontSize: '0.7rem', minWidth: 86, height: 30 }}
                >
                  {savingPatientComment ? '\u4FDD\u5B58\u4E2D...' : '\u4FDD\u5B58'}
                </Button>
              </Box>
            </Box>
            {/* 諢滓沒逞・・ｽ・ｽ繝ｼ・ｽE・ｽ・ｽE繝・・ｽ・ｽ繝ｼ逶ｴ荳具ｼ・*/}
            {detail?.infectionLabs && detail.infectionLabs.length > 0 && (
              <Box sx={{ px: 2, py: 0.5, borderBottom: '1px solid #ddd', bgcolor: '#fff8e1', display: 'flex', alignItems: 'center', gap: 1.2, flexShrink: 0, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#e65100', whiteSpace: 'nowrap' }}>{'\u611F\u67D3\u75C7/\u4ED6\u63A1\u8840\u60C5\u5831'}</Typography>
                {(['HBs\u6297\u539F', 'HBs\u6297\u4F53', 'HBc\u6297\u4F53', 'HBVDNA\u5B9A\u91CF'] as const).map(name => {
                  const lab = detail.infectionLabs.find(l => l.test_name === name);
                  if (!lab) return null;
                  const isPositive = lab.result.includes('\u967D\u6027') || (name === 'HBVDNA\u5B9A\u91CF' && !lab.result.includes('\u672A\u691C\u51FA'));
                  return (
                    <Tooltip key={name} title={`最終測定日: ${fmtDate(lab.test_date)}`} placement="bottom">
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

            {periodicLabStatuses.length > 0 && (
              <Box sx={{ px: 2, py: 0.5, borderBottom: '1px solid #ddd', bgcolor: '#f5fff5', display: 'flex', alignItems: 'center', gap: 1.2, flexShrink: 0, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#2e7d32', whiteSpace: 'nowrap' }}>{'\u5B9A\u671F\u8A55\u4FA1\u63A1\u8840'}</Typography>
                {periodicLabStatuses.map(item => (
                  <Tooltip
                    key={item.name}
                    title={`Last test: ${fmtDate(item.testDate)} / Result: ${item.result ?? '-'}`}
                    placement="bottom"
                  >
                    <Chip
                      label={item.warning}
                      size="small"
                      sx={{
                        fontSize: '0.65rem',
                        height: 18,
                        bgcolor: '#fff3e0',
                        color: '#e65100',
                        border: '1px solid #ffcc80',
                        fontWeight: 'bold',
                      }}
                    />
                  </Tooltip>
                ))}
              </Box>
            )}
            {/* 譌｢蠕豁ｴ繝撰ｿｽE・ｽE・ｽ・ｽE繝・・ｽ・ｽ繝ｼ逶ｴ荳具ｼ・*/}
            <Box
              onClick={() => setMedHistoryOpen(v => !v)}
              sx={{ px: 2, py: 0.5, borderBottom: '1px solid #ddd', bgcolor: '#f8f4ff', display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, cursor: 'pointer', '&:hover': { bgcolor: '#f0eaff' } }}>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#37474f', whiteSpace: 'nowrap' }}>{'\u65E2\u5F80\u6B74'}</Typography>
              {detail?.medHistory && detail.medHistory.length > 0 ? (
                detail.medHistory.slice(0, 4).map(m => (
                  <Chip key={m.id} label={m.condition_name} size="small" variant="outlined"
                    sx={{ fontSize: '0.65rem', height: 18, bgcolor: '#fff' }} />
                ))
              ) : (
                <Typography sx={{ fontSize: '0.7rem', color: '#999' }}>{'\u8A18\u8F09\u306A\u3057'}</Typography>
              )}
              {detail?.medHistory && detail.medHistory.length > 4 && (
                <Typography sx={{ fontSize: '0.7rem', color: '#888' }}>+{detail.medHistory.length - 4}{'\u4EF6'}</Typography>
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
                        <TableCell sx={{ fontSize: '0.7rem', py: 0.3, fontWeight: 'bold' }}>{'\u75BE\u60A3\u540D'}</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem', py: 0.3, fontWeight: 'bold' }}>{'\u767A\u75C7\u65E5'}</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem', py: 0.3, fontWeight: 'bold' }}>{'\u5099\u8003'}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {detail.medHistory.map(m => (
                        <TableRow key={m.id}>
                          <TableCell sx={{ fontSize: '0.75rem', py: 0.3, fontWeight: 'bold' }}>{m.condition_name}</TableCell>
                          <TableCell sx={{ fontSize: '0.72rem', py: 0.3, whiteSpace: 'nowrap' }}>{fmtDate(m.onset_date)}</TableCell>
                          <TableCell sx={{ fontSize: '0.72rem', py: 0.3 }}>{m.notes || '-'}</TableCell>
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
            <Typography color="text.secondary" variant="body2">{'\u2190\u5DE6\u304B\u3089\u60A3\u8005\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044'}</Typography>
          </Box>
        )}

        {loading && <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>}
        {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}

        {!loading && detail && (
          <Box sx={{ flexGrow: 1, overflow: 'auto', p: 1.5 }}>

            {/* 笏≫煤笏≫煤 貂幃㍼蝓ｺ貅悶Ρ繝ｼ繝九Φ繧ｰ 笏≫煤笏≫煤 */}
            {toxicityWarnings.length > 0 && (
              <Alert severity="warning" sx={{ mb: 1.5, py: 0.5 }}
                icon={<Warning sx={{ fontSize: 18 }} />}>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 'bold', mb: 0.5 }}>
                  {'\u26A0\uFE0F \u6E1B\u91CF\u30FB\u4E2D\u6B62\u57FA\u6E96\u306B\u8A72\u5F53\u3059\u308B\u9805\u76EE\u304C\u3042\u308A\u307E\u3059'} ({detail.toxicityRules?.[0]?.regimen_name})
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8 }}>
                  {toxicityWarnings.map(w => (
                    <Box key={w.item} sx={{
                      bgcolor: w.grade >= 3 ? '#ffebee' : '#fff8e1',
                      border: `1px solid ${w.grade >= 3 ? '#ef9a9a' : '#ffe082'}`,
                      borderRadius: 1, px: 1, py: 0.4,
                    }}>
                      <Typography sx={{ fontSize: '0.72rem', fontWeight: 'bold', color: w.grade >= 3 ? '#c62828' : '#e65100' }}>
                        {`Grade ${w.grade}: ${w.item} (${w.labValue})`}
                      </Typography>
                      <Typography sx={{ fontSize: '0.7rem', color: '#555' }}>{`\u5BFE\u5FDC: ${w.action}`}</Typography>
                    </Box>
                  ))}
                </Box>
              </Alert>
            )}

            {/* 笏≫煤笏≫煤 竭 豐ｻ逋よｭｴ 笏≫煤笏≫煤 */}
            {(guidelineAlerts.length > 0 || guidelineRules.length > 0) && (
              <Alert
                severity={guidelineAlerts.some((a) => a.severity === 'error') ? 'error' : 'warning'}
                sx={{ mb: 1.5, py: 0.5 }}
                icon={<Warning sx={{ fontSize: 18 }} />}
              >
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 'bold', mb: 0.5 }}>
                  {'\u30AC\u30A4\u30C9\u30E9\u30A4\u30F3\u8B66\u544A'}{guidelineRegimenName ? `(${guidelineRegimenName})` : ''}
                </Typography>
                {guidelineAlerts.length > 0 ? (
                  <Stack spacing={0.5} sx={{ mb: 0.8 }}>
                    {guidelineAlerts.slice(0, 5).map((alert) => (
                      <Box key={alert.rule_id}>
                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 'bold' }}>
                          {metricLabel(alert.metric_key)} {alert.current_value ?? '-'}
                          {' '}({alert.comparator}{alert.threshold_value ?? '-'} {alert.threshold_unit ?? ''})
                        </Typography>
                        <Typography sx={{ fontSize: '0.7rem', color: '#555' }}>
                          {alert.action_text}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                ) : (
                  <Typography sx={{ fontSize: '0.72rem', mb: 0.8 }}>
                    {'\u6761\u4EF6\u4E00\u81F4\u306E\u8B66\u544A\u306F\u3042\u308A\u307E\u305B\u3093\u3002\u30EB\u30FC\u30EB\u4E00\u89A7\u3067\u78BA\u8A8D\u3067\u304D\u307E\u3059\u3002'}                  </Typography>
                )}
                <Button size="small" variant="outlined" onClick={() => setGuidelineDialogOpen(true)}>
                  {'\u30EB\u30FC\u30EB\u4E00\u89A7'}
                </Button>
              </Alert>
            )}

            {decisionHasData && (
              <Alert
                severity={decisionCriteriaAlerts.length > 0 ? 'warning' : 'info'}
                sx={{ mb: 1.5, py: 0.5 }}
              >
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 'bold', mb: 0.5 }}>
                  {'適格基準・減量規定'}
                </Typography>
                {decisionLatestLabDate && (
                  <Typography sx={{ fontSize: '0.72rem', color: '#455a64', mb: 0.5 }}>
                    採血日: {decisionLatestLabDate}
                  </Typography>
                )}
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: showDoseReductionTable ? '1fr minmax(380px, 56%)' : '1fr' },
                    gap: 1,
                    alignItems: 'start',
                  }}
                >
                  <Box>
                    {decisionCriteriaAlerts.length > 0 ? (
                      <Stack spacing={0.35} sx={{ mb: 0.6 }}>
                        {decisionCriteriaAlerts.map((alert, idx) => (
                          <Typography key={`${alert.metric_key}-${idx}`} sx={{ fontSize: '0.72rem' }}>
                            {metricLabel(alert.metric_key)} {alert.current_value ?? '-'} {' '}
                            ({alert.comparator}{alert.threshold_value} {alert.threshold_unit ?? ''})
                          </Typography>
                        ))}
                      </Stack>
                    ) : (
                      <Typography sx={{ fontSize: '0.72rem', mb: 0.6 }}>
                        適格基準の抵触はありません。
                      </Typography>
                    )}
                    {decisionMatchedToxicityActions.length > 0 && (
                      <Stack spacing={0.35}>
                        {decisionMatchedToxicityActions.slice(0, 5).map((row, idx) => (
                          <Typography key={`${row.toxicity_name}-${idx}`} sx={{ fontSize: '0.72rem' }}>
                            {row.toxicity_name}: {row.action_text}
                          </Typography>
                        ))}
                      </Stack>
                    )}
                  </Box>

                  {showDoseReductionTable && (
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 0.5,
                        mt: { xs: 0, md: '-2.4rem' },
                        ml: { xs: 0, md: '2cm' },
                        width: { xs: '100%', md: 'calc(100% - 2cm)' },
                        bgcolor: '#fdfdfd',
                        borderColor: '#bbdefb',
                        borderRadius: 1.5,
                        overflow: 'hidden',
                      }}
                    >
                      <Typography sx={{ fontSize: '0.72rem', fontWeight: 'bold', mb: 0.3 }}>
                        初回基準量と減量レベル
                      </Typography>
                      <Table size="small" sx={{ '& td, & th': { borderColor: '#d6dbe5' } }}>
                        <TableHead>
                          <TableRow>
                            <TableCell
                              align="center"
                              sx={{ fontSize: '0.68rem', py: 0.4, bgcolor: '#dceffc', fontWeight: 'bold', width: 118 }}
                            >
                              減量レベル
                            </TableCell>
                            {decisionDoseMatrix.drugNames.map((drug) => (
                              <TableCell
                                key={drug}
                                align="center"
                                sx={{ fontSize: '0.68rem', py: 0.4, bgcolor: '#dceffc', fontWeight: 'bold', minWidth: 88 }}
                              >
                                {drug}
                              </TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {decisionDoseMatrix.levels.map((level, idx) => (
                            <TableRow
                              key={`${level.levelIndex}-${idx}`}
                              sx={{
                                bgcolor: level.levelIndex === (decisionSupport?.recommendedReductionLevel ?? 0)
                                  ? '#fff8e1'
                                  : 'transparent',
                              }}
                            >
                              <TableCell
                                align="center"
                                sx={{ fontSize: '0.72rem', py: 0.34, whiteSpace: 'nowrap', fontWeight: 'bold' }}
                              >
                                {level.levelIndex === 0 ? '初回投与量' : level.levelLabel}
                              </TableCell>
                              {decisionDoseMatrix.drugNames.map((drug) => (
                                <TableCell
                                  key={`${level.levelIndex}-${drug}`}
                                  align="center"
                                  sx={{ fontSize: '0.72rem', py: 0.34, fontVariantNumeric: 'tabular-nums' }}
                                >
                                  {level.doses[drug] || '-'}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Paper>
                  )}
                </Box>
              </Alert>
            )}

            <Paper variant="outlined" sx={{ mb: 1.5, overflow: 'hidden' }}>
              <Box
                sx={{ px: 1.5, py: 0.8, bgcolor: '#1c2833', display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => setHistoryExpanded(v => !v)}
              >
                <Typography sx={{ fontWeight: 'bold', color: '#fff', fontSize: '0.82rem', flexGrow: 1 }}>
                  {`\u3053\u308C\u307E\u3067\u306E\u6CBB\u7642\u6B74 (${detail.treatmentHistory.length}\u4EF6)`}                </Typography>
                {historyExpanded ? <ExpandLess sx={{ color: '#aed6f1', fontSize: 18 }} /> : <ExpandMore sx={{ color: '#aed6f1', fontSize: 18 }} />}
              </Box>

              {historyExpanded && detail.treatmentHistory.length > HISTORY_PREVIEW_COUNT && (
                <Box sx={{ px: 1.5, py: 0.5, bgcolor: '#f5f7fa', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontSize: '0.72rem', color: '#546e7a' }}>
                    {showAllHistoryRows ? '\u5168\u4EF6\u8868\u793A\u4E2D' : `\u76F4\u8FD1${HISTORY_PREVIEW_COUNT}\u4EF6\u3092\u8868\u793A\u4E2D`}
                  </Typography>
                  <Box sx={{ flexGrow: 1 }} />
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => setShowAllHistoryRows(v => !v)}
                    startIcon={showAllHistoryRows ? <ExpandLess /> : <ExpandMore />}
                    sx={{ fontSize: '0.72rem', py: 0.2 }}
                  >
                    {showAllHistoryRows ? '\u76F4\u8FD1\u8868\u793A\u306B\u623B\u3059' : '\u5168\u4EF6\u8868\u793A'}
                  </Button>
                </Box>
              )}

              {/* 荳諡ｬ謫堺ｽ懊ヰ繝ｼ */}
              {historyExpanded && selectedHistoryIds.size > 0 && (
                <Box sx={{ px: 1.5, py: 0.6, bgcolor: '#e8f0fe', borderBottom: '1px solid #c5cae9', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontSize: '0.78rem', color: '#3949ab', fontWeight: 'bold' }}>
                    {`${selectedHistoryIds.size}\u4EF6\u9078\u629E\u4E2D`}
                  </Typography>
                  <Button size="small" variant="contained" disabled={batchLoading}
                    sx={{ fontSize: '0.72rem', py: 0.2, bgcolor: '#1565c0', '&:hover': { bgcolor: '#0d47a1' } }}
                    onClick={() => handleBatchAudit('audited')}>
                    {'\u76E3\u67FB\u6E08\u306B\u3059\u308B'}
                  </Button>
                  <Button size="small" variant="contained" disabled={batchLoading}
                    sx={{ fontSize: '0.72rem', py: 0.2, bgcolor: '#c62828', '&:hover': { bgcolor: '#b71c1c' } }}
                    onClick={() => handleBatchAudit('doubt')}>
                    {'\u7591\u7FA9\u7167\u4F1A\u4E2D\u306B\u3059\u308B'}
                  </Button>
                  <Button size="small" variant="outlined" disabled={batchLoading}
                    sx={{ fontSize: '0.72rem', py: 0.2 }}
                    onClick={() => handleBatchAudit(null)}>
                    {'\u672A\u76E3\u67FB\u306B\u623B\u3059'}
                  </Button>
                  <Button size="small" sx={{ fontSize: '0.72rem', py: 0.2, ml: 'auto' }}
                    onClick={() => setSelectedHistoryIds(new Set())}>
                    {'\u9078\u629E\u89E3\u9664'}
                  </Button>
                </Box>
              )}

              {historyExpanded && (
                detail.treatmentHistory.length === 0 ? (
                  <Box sx={{ px: 2, py: 1.5 }}>
                    <Typography variant="body2" color="text.secondary">{'scheduled_treatments \u306B\u8A18\u9332\u304C\u3042\u308A\u307E\u305B\u3093'}</Typography>
                  </Box>
                ) : (
                  <TableContainer>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell padding="checkbox" sx={{ py: 0.3, bgcolor: '#eceff1' }}>
                            <Checkbox size="small" sx={{ p: 0 }}
                              checked={visibleTreatmentHistory.length > 0 && visibleTreatmentHistory.every(t => selectedHistoryIds.has(t.id))}
                              indeterminate={
                                selectedHistoryIds.size > 0
                                && visibleTreatmentHistory.some(t => selectedHistoryIds.has(t.id))
                                && !visibleTreatmentHistory.every(t => selectedHistoryIds.has(t.id))
                              }
                              onChange={toggleAllHistory} />
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.72rem', py: 0.5, bgcolor: '#eceff1', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{'\u6295\u4E0E\u65E5'}</TableCell>
                          <TableCell sx={{ fontSize: '0.72rem', py: 0.5, bgcolor: '#eceff1', fontWeight: 'bold' }}>{'\u30EC\u30B8\u30E1\u30F3'}</TableCell>
                          <TableCell sx={{ fontSize: '0.72rem', py: 0.5, bgcolor: '#eceff1', fontWeight: 'bold' }}>Cycle</TableCell>
                          <TableCell sx={{ fontSize: '0.72rem', py: 0.5, bgcolor: '#eceff1', fontWeight: 'bold' }}>{'\u76E3\u67FB'}</TableCell>
                          <TableCell sx={{ fontSize: '0.72rem', py: 0.5, bgcolor: '#eceff1', fontWeight: 'bold' }}>{'\u76E3\u67FB\u8005'}</TableCell>
                          <TableCell sx={{ fontSize: '0.72rem', py: 0.5, bgcolor: '#eceff1', fontWeight: 'bold' }}>{'\u72B6\u614B'}</TableCell>
                          <TableCell sx={{ fontSize: '0.72rem', py: 0.5, bgcolor: '#eceff1', fontWeight: 'bold' }}>{'\u6297\u816B\u760D\u85AC\uFF08\u30AA\u30FC\u30C0\u30FC\uFF09'}</TableCell>
                          <TableCell sx={{ fontSize: '0.72rem', py: 0.5, bgcolor: '#eceff1', fontWeight: 'bold' }}>{'\u7591\u7FA9\u7167\u4F1A'}</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {visibleTreatmentHistory.map((t, i) => {
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
                                {isToday && <Chip label={'\u5F53\u65E5'} size="small" color="warning" sx={{ ml: 0.5, fontSize: '0.62rem', height: 15 }} />}
                                {isNext && <Chip label={'\u6B21\u56DE'} size="small" color="success" sx={{ ml: 0.5, fontSize: '0.62rem', height: 15 }} />}
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.78rem', py: 0.4, fontWeight: 'bold', color: '#1a237e' }}>{t.regimen_name}</TableCell>
                              <TableCell sx={{ py: 0.2 }}>
                                <TextField
                                  key={`cycle-${t.id}-${t.cycle_no}`}
                                  defaultValue={t.cycle_no ?? ''}
                                  onBlur={e => handleSaveCycle(t, e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                  size="small"
                                  placeholder=""
                                  type="number"
                                  inputProps={{ min: 1, style: { textAlign: 'center' } }}
                                  sx={{ width: 56, '& .MuiInputBase-input': { fontSize: '0.75rem', py: 0.2, px: 0.5 } }}
                                />
                              </TableCell>
                              <TableCell sx={{ py: 0.2 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                                  <AuditStatusChip status={t.audit_status} />
                                  <Tooltip title={t.audit_status === 'audited' ? '\u672A\u76E3\u67FB\u306B\u623B\u3059' : '\u76E3\u67FB\u6E08\u306B\u3059\u308B'}>
                                    <IconButton size="small"
                                      sx={{ p: 0.3, color: t.audit_status === 'audited' ? '#1565c0' : '#bbb' }}
                                      onClick={() => handleSetAuditStatus(t, 'audited')}>
                                      <CheckCircle sx={{ fontSize: 15 }} />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title={t.audit_status === 'doubt' ? '\u672A\u76E3\u67FB\u306B\u623B\u3059' : '\u7591\u7FA9\u7167\u4F1A\u4E2D\u306B\u3059\u308B'}>
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
                                ) : '-'}
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.72rem', py: 0.4 }}>
                                <TreatmentStatusChip status={t.status} />
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.72rem', py: 0.4, color: t.antineoplastic_drugs ? '#b71c1c' : '#bbb' }}>
                                {t.antineoplastic_drugs
                                  ? t.antineoplastic_drugs.split('\n').filter(Boolean).map((line, idx) => (
                                    <Typography
                                      key={`${t.id}-${idx}`}
                                      sx={{ fontSize: '0.72rem', lineHeight: 1.4, color: '#b71c1c', fontWeight: 600 }}
                                    >
                                      {line}
                                    </Typography>
                                  ))
                                  : '\u30AA\u30FC\u30C0\u30FC\u30C7\u30FC\u30BF\u306A\u3057'}
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.7rem', py: 0.4, color: '#555' }}>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3 }}>
                                  {t.doubt_summary
                                    ? t.doubt_summary.split('\n').filter(Boolean).map((line, idx) => (
                                      <Typography
                                        key={`${t.id}-doubt-${idx}`}
                                        sx={{
                                          fontSize: '0.68rem',
                                          lineHeight: 1.35,
                                          color: line.startsWith('\u672A\u89E3\u6C7A') ? '#c62828' : '#2e7d32',
                                          fontWeight: line.startsWith('\u672A\u89E3\u6C7A') ? 'bold' : 'normal',
                                        }}
                                      >
                                        {line}
                                      </Typography>
                                    ))
                                    : <Typography sx={{ fontSize: '0.68rem', color: '#999' }}>-</Typography>}
                                  <Box>
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      color={t.has_open_doubt ? 'error' : 'inherit'}
                                      onClick={() => {
                                        setDoubtTarget(t);
                                        setDoubtContent('');
                                        setDoubtDialog(true);
                                      }}
                                      sx={{ fontSize: '0.64rem', py: 0, minWidth: 48 }}
                                    >
                                      {'\u767B\u9332'}
                                    </Button>
                                  </Box>
                                </Box>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )
              )}
              {/* 莉雁ｾ鯉ｿｽE莠亥ｮ・*/}
              {detail.futureSchedule.length > 0 && historyExpanded && (
                <Box sx={{ borderTop: '1px dashed #ccc', px: 1.5, py: 0.8, bgcolor: '#e8f5e9' }}>
                  <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#2e7d32' }}>{'\u4ECA\u5F8C\u306E\u4E88\u5B9A\u30AA\u30FC\u30C0\u30FC'}</Typography>
                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 0.5 }}>
                    {detail.futureSchedule.map(f => (
                      <Box key={f.order_date} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Chip label={fmtDate(f.order_date)} size="small" color="success" sx={{ fontSize: '0.68rem', height: 18 }} />
                        <Typography variant="caption" sx={{ color: '#1b5e20' }}>{f.antineoplastic_drugs || '-'}</Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}
            </Paper>

            {/* 笏≫煤笏≫煤 竭｡ 繧ｪ繝ｼ繝繝ｼ遒ｺ隱搾ｼ井ｻ雁屓 vs 谺｡蝗橸ｼ俄煤笏≫煤笏・*/}
            <Paper variant="outlined" sx={{ mb: 1.5, p: 1.2 }}>
              <SectionHeader color="#c62828">{'オーダー確認（今回 vs 次回）'}</SectionHeader>
              {(detail.todayOrders.length > 0 || detail.futureOrders.length > 0) && (
                <Box sx={{ fontSize: '0.65rem', color: '#888', mb: 0.8 }}>
                  {'\u25CB\uFF1A\u4E88\u5B9A / \uD83D\uDC89\uFF1A\u5B9F\u65BD / \u25B2\uFF1A\u5909\u66F4 / \u00D7\uFF1A\u4E2D\u6B62 / \u26A0\uFE0F\uFF1A\u6B21\u56DE\u3068\u7528\u91CF\u5DEE\u3042\u308A'}
                </Box>
              )}
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                <OrderColumn
                  orders={detail.todayOrders} label={'\u4ECA\u56DE\u30AA\u30FC\u30C0\u30FC'} dateStr={fmtDate(todayStr)}
                  onReload={() => selectedId && loadDetail(selectedId)}
                  compareOrders={detail.futureOrders}
                />
                <OrderColumn
                  orders={detail.futureOrders} label={'\u6B21\u56DE\u30AA\u30FC\u30C0\u30FC'} dateStr={fmtDate(futureDate)}
                  onReload={() => selectedId && loadDetail(selectedId)}
                  compareOrders={detail.todayOrders}
                />
              </Box>
            </Paper>

            {/* 笏≫煤笏≫煤 竭｢ 謗｡陦繧ｰ繝ｩ繝・笏≫煤笏≫煤 */}
            <Paper variant="outlined" sx={{ mb: 1.5, p: 1.2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                <SectionHeader color="#2e7d32">{'\u9AA8\u9AC4\u7CFB\u63A1\u8840\uFF08\u5BFE\u6570\u30B9\u30B1\u30FC\u30EB\uFF09'}</SectionHeader>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={variableLabSpacing}
                      onChange={(_, checked) => setVariableLabSpacing(checked)}
                    />
                  }
                  label={<Typography sx={{ fontSize: '0.72rem' }}>{'\u65E5\u4ED8\u9593\u9694\u3092\u5B9F\u65E5\u6570\u3067\u8868\u793A'}</Typography>}
                  sx={{ m: 0 }}
                />
              </Box>
              <BloodChart labs={detail.labs} treatmentMarks={treatmentMarks} variableSpacing={variableLabSpacing} />
            </Paper>

            {/* 笏≫煤笏≫煤 竭｣ 菴捺ｼ繝ｻ閻趣ｿｽE讖滂ｿｽE・ｽE・ｽE蛻暦ｼ・笏≫煤笏≫煤 */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1.5, mb: 1.5 }}>
              <Paper variant="outlined" sx={{ p: 1.2 }}>
                <SectionHeader color="#1565c0">{'\u4F53\u91CD\u30FBBSA\uFF08\u904E\u53BB1\u5E74\uFF09'}</SectionHeader>
                <VitalChart vitals={detail.vitals} />
              </Paper>
              <Paper variant="outlined" sx={{ p: 1.2 }}>
                <SectionHeader color="#0277bd">{'\u814E\u6A5F\u80FD\uFF08Cre / eGFR\uFF09'}</SectionHeader>
                <RenalChart labs={detail.labs} treatmentMarks={treatmentMarks} variableSpacing={variableLabSpacing} />
              </Paper>
              <Paper variant="outlined" sx={{ p: 1.2 }}>
                <SectionHeader color="#6a1b9a">{'\u809D\u6A5F\u80FD\uFF08AST / ALT / T-Bil\u00D710 / CRP\uFF09'}</SectionHeader>
                <HepaticChart labs={detail.labs} treatmentMarks={treatmentMarks} variableSpacing={variableLabSpacing} />
              </Paper>
            </Box>

            {/* 笏≫煤笏≫煤 竭､ 逶｣譟ｻ繝ｻ逍醍ｾｩ・ｽE・ｽE蛻暦ｼ・笏≫煤笏≫煤 */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 1.5 }}>
              {/* 逶｣譟ｻ繧ｳ繝｡繝ｳ繝・*/}
              <Paper variant="outlined" sx={{ p: 1.2 }}>
                <SectionHeader color="#1565c0">{'\u76E3\u67FB\u30B3\u30E1\u30F3\u30C8\u30FB\u7533\u3057\u9001\u308A'}</SectionHeader>
                <Stack spacing={1}>
                  <TextField label={'\u76E3\u67FB\u30B3\u30E1\u30F3\u30C8'} multiline rows={3} fullWidth size="small"
                    value={auditComment} onChange={e => setAuditComment(e.target.value)}
                    placeholder={'\u76E3\u67FB\u306E\u6240\u898B\u3084\u6CE8\u610F\u70B9\u3092\u8A18\u8F09'}
                    sx={{ '& .MuiInputBase-input': { fontSize: '0.8rem' } }} />
                  <TextField label={'\u7533\u3057\u9001\u308A'} multiline rows={2} fullWidth size="small"
                    value={handoverNote} onChange={e => setHandoverNote(e.target.value)}
                    placeholder={'\u6B21\u56DE\u62C5\u5F53\u8005\u3078\u306E\u7533\u3057\u9001\u308A'}
                    sx={{ '& .MuiInputBase-input': { fontSize: '0.8rem' } }} />
                  <Button variant="contained" size="small" onClick={handleSaveAudit}
                    disabled={savingAudit} sx={{ alignSelf: 'flex-start', fontSize: '0.75rem' }}>
                    {'\u76E3\u67FB\u8A18\u9332\u3092\u4FDD\u5B58'}
                  </Button>
                </Stack>
              </Paper>

              {/* 逍醍ｾｩ辣ｧ莨・*/}
              <Paper variant="outlined" sx={{ p: 1.2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.8 }}>
                  <SectionHeader color="#b71c1c">{'\u2753 \u7591\u7FA9\u7167\u4F1A'}</SectionHeader>
                  <Box sx={{ flexGrow: 1 }} />
                  <Button size="small" variant="outlined" color="error" startIcon={<Add />}
                    onClick={() => { setDoubtTarget(null); setDoubtContent(''); setDoubtDialog(true); }} sx={{ fontSize: '0.72rem', py: 0.3 }}>
                    {'\u767B\u9332'}
                  </Button>
                </Box>
                {detail.doubts.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">{'\u7591\u7FA9\u7167\u4F1A\u306F\u3042\u308A\u307E\u305B\u3093'}</Typography>
                ) : (
                  <List dense disablePadding sx={{ maxHeight: 220, overflow: 'auto' }}>
                    {detail.doubts.map(d => (
                      <ListItem key={d.id} disableGutters divider alignItems="flex-start"
                        sx={{ py: 0.6 }}
                        secondaryAction={
                          d.status === 'open' ? (
                            <Tooltip title={'\u89E3\u6C7A\u6E08\u307F\u306B\u3059\u308B'}>
                              <IconButton size="small" color="success" onClick={() => { setResolveDialog(d); setResolution(''); }}>
                                <CheckCircle sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Tooltip>
                          ) : (
                            <Tooltip title={'\u518D\u30AA\u30FC\u30D7\u30F3'}>
                              <IconButton size="small" onClick={() => handleReopenDoubt(d)}>
                                <RadioButtonUnchecked sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Tooltip>
                          )
                        }>
                        <Box sx={{ pr: 4, width: '100%' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 0.2 }}>
                            <Chip label={d.status === 'open' ? '\u672A\u89E3\u6C7A' : '\u89E3\u6C7A\u6E08'} size="small"
                              color={d.status === 'open' ? 'error' : 'success'}
                              sx={{ fontSize: '0.62rem', height: 16 }} />
                            <Typography sx={{ fontSize: '0.68rem', color: '#888' }}>{fmtDate(d.doubt_date)} / {d.pharmacist_name}</Typography>
                          </Box>
                          {(d.treatment_date || d.regimen_name) && (
                            <Typography sx={{ fontSize: '0.68rem', color: '#455a64', mb: 0.15 }}>
                              {'\u5BFE\u8C61'}: {d.treatment_date ? fmtDate(d.treatment_date) : '\u65E5\u4ED8\u672A\u8A2D\u5B9A'}
                              {d.regimen_name ? ` / ${d.regimen_name}` : ''}
                            </Typography>
                          )}
                          <Typography sx={{ fontSize: '0.78rem' }}>{d.content}</Typography>
                          {d.resolution && (
                            <Typography sx={{ fontSize: '0.72rem', color: '#2e7d32', mt: 0.2 }}>{`\u89E3\u6C7A: ${d.resolution}`}</Typography>
                          )}
                        </Box>
                      </ListItem>
                    ))}
                  </List>
                )}
              </Paper>
            </Box>

            {/* 笏≫煤笏≫煤 竭･ 逶｣譟ｻ繝ｭ繧ｰ 笏≫煤笏≫煤 */}
            {detail.audits.length > 0 && (
              <Paper variant="outlined" sx={{ p: 1.2 }}>
                <SectionHeader color="#37474f">{'\u76E3\u67FB\u30ED\u30B0'}</SectionHeader>
                <TableContainer>
                  <Table size="small">
                    <TableHead sx={{ bgcolor: '#f5f5f5' }}>
                      <TableRow>
                        <TableCell sx={{ fontSize: '0.7rem', py: 0.4 }}>{'\u65E5\u4ED8'}</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem', py: 0.4 }}>{'\u85AC\u5264\u5E2B'}</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem', py: 0.4 }}>{'\u30B3\u30E1\u30F3\u30C8'}</TableCell>
                        <TableCell sx={{ fontSize: '0.7rem', py: 0.4 }}>{'\u7533\u3057\u9001\u308A'}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {detail.audits.map(a => (
                        <TableRow key={a.id}>
                          <TableCell sx={{ fontSize: '0.75rem', py: 0.4, whiteSpace: 'nowrap' }}>{fmtDate(a.audit_date)}</TableCell>
                          <TableCell sx={{ fontSize: '0.75rem', py: 0.4, whiteSpace: 'nowrap' }}>{a.pharmacist_name}</TableCell>
                          <TableCell sx={{ fontSize: '0.75rem', py: 0.4 }}>{a.comment || '-'}</TableCell>
                          <TableCell sx={{ fontSize: '0.75rem', py: 0.4, color: '#555' }}>{a.handover_note || '-'}</TableCell>
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

      {/* 笏笏 逍醍ｾｩ霑ｽ蜉繝繧､繧｢繝ｭ繧ｰ 笏笏 */}
      {!loading && detail && detail.guidelineSource && (
        <Paper
          className="no-print"
          sx={{
            position: 'fixed',
            right: 8,
            top: 8,
            zIndex: 1200,
            width: mdPanelExpanded ? { xs: 'calc(100vw - 16px)', md: 520 } : 300,
            maxWidth: 'calc(100vw - 16px)',
            height: mdPanelExpanded ? 'calc(100vh - 16px)' : 'auto',
            maxHeight: 'calc(100vh - 16px)',
            border: '1px solid #cfd8dc',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            bgcolor: '#fafafa',
            boxShadow: '0 3px 12px rgba(0,0,0,0.18)',
          }}
        >
          <Box
            sx={{
              px: 1,
              py: 0.75,
              borderBottom: mdPanelExpanded ? '1px solid #e0e0e0' : 'none',
              bgcolor: '#eceff1',
              display: 'flex',
              alignItems: 'center',
              gap: 0.8,
            }}
          >
            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#263238', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {'\u76E3\u67FB\u6839\u62E0'}{guidelineMarkdownTitle ? ' (' + guidelineMarkdownTitle + ')' : ''}
              </Typography>
              {!mdPanelExpanded && (
                <Typography sx={{ fontSize: '0.62rem', color: '#607d8b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {guidelineSourceFile || '-'}
                </Typography>
              )}
            </Box>
            <Tooltip title={mdPanelExpanded ? '\u6700\u5C0F\u5316' : '\u6700\u5927\u5316'}>
              <IconButton size="small" onClick={() => setMdPanelExpanded(v => !v)}>
                {mdPanelExpanded ? <CloseFullscreen sx={{ fontSize: 16 }} /> : <OpenInFull sx={{ fontSize: 16 }} />}
              </IconButton>
            </Tooltip>
          </Box>

          {mdPanelExpanded && (
            <Box sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flexGrow: 1, bgcolor: '#fff' }}>
              <Box sx={{ p: 1, borderBottom: '1px solid #e0e0e0', bgcolor: '#f5f8fc' }}>
                <Stack direction="row" spacing={0.8}>
                  <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel id="guideline-dept-select-label">{'\u8A3A\u7642\u79D1'}</InputLabel>
                    <Select
                      labelId="guideline-dept-select-label"
                      value={guidelineFilterDepartment}
                      label={'\u8A3A\u7642\u79D1'}
                      onChange={(e) => { void handleGuidelineDepartmentChange(String(e.target.value || '')); }}
                    >
                      <MenuItem value="">{'\u5168\u3066'}</MenuItem>
                      {guidelineDepartmentOptions.map((dept) => (
                        <MenuItem key={dept} value={dept}>{dept}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl size="small" fullWidth>
                    <InputLabel id="guideline-regimen-select-label">{'\u30EC\u30B8\u30E1\u30F3'}</InputLabel>
                    <Select
                      labelId="guideline-regimen-select-label"
                      value={guidelineFilterRegimen}
                      label={'\u30EC\u30B8\u30E1\u30F3'}
                      onChange={(e) => { void handleGuidelineRegimenChange(String(e.target.value || '')); }}
                    >
                      <MenuItem value="">{'\u81EA\u52D5\u9078\u629E'}</MenuItem>
                      {guidelineRegimenOptions.map((item) => (
                        <MenuItem key={item.key} value={item.key}>{item.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>
              </Box>

              <Box sx={{ p: 1, overflow: 'auto', flexGrow: 1, bgcolor: '#fff' }}>
              {isGuidelineSourceUrl ? (
                <Box sx={{ height: '100%', minHeight: 420 }}>
                  <iframe
                    title="guideline-article"
                    src={guidelineSourceFile}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                  />
                </Box>
              ) : isGuidelineHtml ? (
                <Box sx={{ height: '100%', minHeight: 420 }}>
                  <iframe
                    title="guideline-html"
                    srcDoc={guidelineMarkdown}
                    style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
                  />
                </Box>
              ) : (
                <Typography
                  component="pre"
                  sx={{
                    m: 0,
                    fontSize: '0.7rem',
                    lineHeight: 1.45,
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                  }}
                >
                  {guidelineMarkdown || '\u53D6\u308A\u8FBC\u307F\u6E08\u307F\u60C5\u5831\u304C\u3042\u308A\u307E\u305B\u3093'}
                </Typography>
              )}
            </Box>
          </Box>
          )}
        </Paper>
      )}
      <Dialog
        open={guidelineDialogOpen}
        onClose={() => setGuidelineDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ fontSize: '0.92rem', pb: 1 }}>
          {`\u6E1B\u91CF\u898F\u5B9A\u30FB\u76E3\u67FB\u30AC\u30A4\u30C9\u30E9\u30A4\u30F3 ${guidelineRegimenName ? `(${guidelineRegimenName})` : ''}`}
        </DialogTitle>
        <DialogContent dividers>
          {guidelineRules.length === 0 ? (
            <Typography sx={{ fontSize: '0.8rem', color: '#666' }}>
              {'\u53D6\u308A\u8FBC\u307F\u6E08\u307F\u30EB\u30FC\u30EB\u304C\u3042\u308A\u307E\u305B\u3093\u3002'}
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontSize: '0.72rem', width: 70 }}>{'\u512A\u5148\u5EA6'}</TableCell>
                  <TableCell sx={{ fontSize: '0.72rem', width: 130 }}>{'\u5224\u5B9A'}</TableCell>
                  <TableCell sx={{ fontSize: '0.72rem', width: 130 }}>{'\u6761\u4EF6'}</TableCell>
                  <TableCell sx={{ fontSize: '0.72rem' }}>{'\u5BFE\u5FDC'}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {guidelineRules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell sx={{ fontSize: '0.72rem', py: 0.5 }}>
                      <Chip
                        size="small"
                        label={rule.severity}
                        color={rule.severity === 'error' ? 'error' : rule.severity === 'warning' ? 'warning' : 'default'}
                        sx={{ fontSize: '0.65rem', height: 18 }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.72rem', py: 0.5 }}>
                      {metricLabel(rule.metric_key)}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.72rem', py: 0.5 }}>
                      {rule.comparator && rule.threshold_value != null
                        ? `${rule.comparator}${rule.threshold_value}${rule.threshold_unit ? ` ${rule.threshold_unit}` : ''}`
                        : rule.condition_text}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.72rem', py: 0.5 }}>{rule.action_text}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGuidelineDialogOpen(false)}>{'\u9589\u3058\u308B'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={doubtDialog}
        onClose={() => { setDoubtDialog(false); setDoubtTarget(null); }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontSize: '0.92rem', pb: 1 }}>
          {'\u7591\u7FA9\u7167\u4F1A\u3092\u767B\u9332'}
          {doubtTarget && `${fmtDate(doubtTarget.scheduled_date)} / ${doubtTarget.regimen_name}`}
        </DialogTitle>
        <DialogContent>
          {doubtTarget && (
            <Typography sx={{ fontSize: '0.74rem', color: '#666', mt: 0.5 }}>
              {'\u5BFE\u8C61\u30EC\u30B8\u30E1\u30F3'}: {fmtDate(doubtTarget.scheduled_date)} / {doubtTarget.regimen_name}
            </Typography>
          )}
          <TextField autoFocus fullWidth multiline rows={4} label={'\u7591\u7FA9\u5185\u5BB9'} size="small"
            value={doubtContent} onChange={e => setDoubtContent(e.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDoubtDialog(false); setDoubtTarget(null); }}>{'\u30AD\u30E3\u30F3\u30BB\u30EB'}</Button>
          <Button variant="contained" color="error" onClick={handleAddDoubt}
            disabled={savingDoubt || !doubtContent.trim()}>{'\u767B\u9332'}</Button>
        </DialogActions>
      </Dialog>

      {/* 笏笏 逍醍ｾｩ隗｣豎ｺ繝繧､繧｢繝ｭ繧ｰ 笏笏 */}
      <Dialog open={!!resolveDialog} onClose={() => setResolveDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: '0.92rem', pb: 1 }}>{'\u7591\u7FA9\u7167\u4F1A\u3092\u89E3\u6C7A\u6E08\u307F\u306B\u3059\u308B'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1, color: '#555' }}>{resolveDialog?.content}</Typography>
          <TextField fullWidth multiline rows={3} label={'\u89E3\u6C7A\u5185\u5BB9\u30FB\u5BFE\u5FDC'} size="small"
            value={resolution} onChange={e => setResolution(e.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResolveDialog(null)}>{'\u30AD\u30E3\u30F3\u30BB\u30EB'}</Button>
          <Button variant="contained" color="success" onClick={handleResolveDoubt}>{'\u89E3\u6C7A\u6E08\u307F\u306B\u3059\u308B'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}




