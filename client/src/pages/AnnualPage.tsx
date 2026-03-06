import { useState, useCallback } from 'react';
import {
  Box, Typography, Button, AppBar, Toolbar,
  Alert, CircularProgress, MenuItem, Select,
  FormControl, InputLabel, Paper, Divider,
} from '@mui/material';
import { Download, Print } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

// ─── 型定義 ──────────────────────────────────────────────────────
interface MonthInj {
  month: number;
  inj_total: number; inj_done: number; inj_cancelled: number;
  inj_changed: number; inj_pending: number;
}
interface MonthDiary {
  month: number;
  oral_scheduled: number; oral_done: number;
  oral_cancelled: number; oral_changed: number;
}
interface MonthInt {
  month: number;
  total: number; propose_count: number; doubt_count: number;
  inquiry_count: number; presc_changed: number;
  cancer_guidance: number; pre_consultation: number;
}
interface DeptRow  { department: string; month: number; total: number; done: number; }
interface CatRow   { category: string; cnt: number; }
interface RegiRow  { regimen_name: string; done_count: number; }

interface AnnualData {
  year:         number;
  months_inj:   MonthInj[];
  months_diary: MonthDiary[];
  months_int:   MonthInt[];
  departments:  DeptRow[];
  categories:   CatRow[];
  regimens:     RegiRow[];
}

// ─── 定数・ヘルパー ───────────────────────────────────────────────
const MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12];
const MN     = (m: number) => `${m}月`;
const v      = (n: number | undefined | null): number => n ?? 0;
const dash   = (n: number) => n === 0 ? '-' : String(n);
const pct    = (a: number, b: number) =>
  b > 0 ? `${Math.round(a / b * 1000) / 10}%` : '-';

function mkInjMap(rows: MonthInj[])   { return new Map(rows.map(r => [r.month, r])); }
function mkDiaryMap(rows: MonthDiary[]){ return new Map(rows.map(r => [r.month, r])); }
function mkIntMap(rows: MonthInt[])   { return new Map(rows.map(r => [r.month, r])); }

// ─── テーブルCSS定数 ─────────────────────────────────────────────
const T: React.CSSProperties = {
  width: '100%', borderCollapse: 'collapse',
  fontSize: '0.7rem', tableLayout: 'fixed',
};
const TH: React.CSSProperties = {
  background: '#1a3a5c', color: '#fff',
  padding: '4px 3px', border: '1px solid #888',
  textAlign: 'center', whiteSpace: 'nowrap', fontWeight: 'bold',
};
const TH_TOT: React.CSSProperties = {
  ...TH, background: '#bf360c',
};
const TD_LBL: React.CSSProperties = {
  background: '#e8eaf6', padding: '3px 6px',
  border: '1px solid #ccc', textAlign: 'left',
  whiteSpace: 'nowrap', fontWeight: 'bold', fontSize: '0.68rem',
};
const TD: React.CSSProperties = {
  padding: '3px 4px', border: '1px solid #ddd',
  textAlign: 'right', color: '#222',
};
const TD_TOT: React.CSSProperties = {
  ...TD, background: '#fff8e1', fontWeight: 'bold', color: '#bf360c',
};
const TD_PCT: React.CSSProperties = {
  ...TD, color: '#1565c0', background: '#f3f4fe',
};
const TD_PCT_TOT: React.CSSProperties = {
  ...TD_TOT, color: '#1565c0', background: '#e8eaf6',
};
const TD_DEPT_TOT: React.CSSProperties = {
  ...TD_TOT, background: '#bbdefb', color: '#1a237e',
};
const TD_GRAND: React.CSSProperties = {
  ...TD_TOT, background: '#90caf9', color: '#1a237e',
};

const SECTION_BOX: React.CSSProperties = {
  marginBottom: 16, pageBreakInside: 'avoid',
};
const SEC_TITLE: React.CSSProperties = {
  background: '#1a3a5c', color: '#fff',
  padding: '4px 10px', fontSize: '0.82rem',
  fontWeight: 'bold', marginBottom: 0,
};
const COL_LBL  = { width: '14%' };
const COL_MON  = { width: '5.83%' };
const COL_TOT  = { width: '6%' };

// ─── 注射月別テーブル ─────────────────────────────────────────────
function InjTable({ data }: { data: MonthInj[] }) {
  const map = mkInjMap(data);
  const rows: { label: string; key: keyof MonthInj }[] = [
    { label: '予定件数',  key: 'inj_total' },
    { label: '実施件数',  key: 'inj_done' },
    { label: '中止件数',  key: 'inj_cancelled' },
    { label: '変更件数',  key: 'inj_changed' },
  ];
  const tot: Record<string, number> = {};
  rows.forEach(r => { tot[r.key] = MONTHS.reduce((s, m) => s + v(map.get(m)?.[r.key]), 0); });

  return (
    <table style={T}>
      <colgroup>
        <col style={COL_LBL} />
        {MONTHS.map(m => <col key={m} style={COL_MON} />)}
        <col style={COL_TOT} />
      </colgroup>
      <thead>
        <tr>
          <th style={TH}>項目</th>
          {MONTHS.map(m => <th key={m} style={TH}>{MN(m)}</th>)}
          <th style={TH_TOT}>年計</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ label, key }) => (
          <tr key={key}>
            <td style={TD_LBL}>{label}</td>
            {MONTHS.map(m => <td key={m} style={TD}>{dash(v(map.get(m)?.[key]))}</td>)}
            <td style={TD_TOT}>{dash(tot[key])}</td>
          </tr>
        ))}
        <tr>
          <td style={TD_LBL}>実施率</td>
          {MONTHS.map(m => {
            const r = map.get(m);
            return <td key={m} style={TD_PCT}>{r ? pct(r.inj_done, r.inj_total) : '-'}</td>;
          })}
          <td style={TD_PCT_TOT}>{pct(tot.inj_done, tot.inj_total)}</td>
        </tr>
      </tbody>
    </table>
  );
}

// ─── 内服月別テーブル ─────────────────────────────────────────────
function OralTable({ data }: { data: MonthDiary[] }) {
  const map = mkDiaryMap(data);
  const rows: { label: string; key: keyof MonthDiary }[] = [
    { label: '予定件数',  key: 'oral_scheduled' },
    { label: '実施件数',  key: 'oral_done' },
    { label: '中止件数',  key: 'oral_cancelled' },
    { label: '変更件数',  key: 'oral_changed' },
  ];
  const tot: Record<string, number> = {};
  rows.forEach(r => { tot[r.key] = MONTHS.reduce((s, m) => s + v(map.get(m)?.[r.key]), 0); });

  return (
    <table style={T}>
      <colgroup>
        <col style={COL_LBL} />
        {MONTHS.map(m => <col key={m} style={COL_MON} />)}
        <col style={COL_TOT} />
      </colgroup>
      <thead>
        <tr>
          <th style={TH}>項目</th>
          {MONTHS.map(m => <th key={m} style={TH}>{MN(m)}</th>)}
          <th style={TH_TOT}>年計</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ label, key }) => (
          <tr key={key}>
            <td style={TD_LBL}>{label}</td>
            {MONTHS.map(m => <td key={m} style={TD}>{dash(v(map.get(m)?.[key]))}</td>)}
            <td style={TD_TOT}>{dash(tot[key])}</td>
          </tr>
        ))}
        <tr>
          <td style={TD_LBL}>実施率</td>
          {MONTHS.map(m => {
            const r = map.get(m);
            return <td key={m} style={TD_PCT}>{r ? pct(r.oral_done, r.oral_scheduled) : '-'}</td>;
          })}
          <td style={TD_PCT_TOT}>{pct(tot.oral_done, tot.oral_scheduled)}</td>
        </tr>
      </tbody>
    </table>
  );
}

// ─── 介入月別テーブル ─────────────────────────────────────────────
function IntTable({ data }: { data: MonthInt[] }) {
  const map = mkIntMap(data);
  const rows: { label: string; key: keyof MonthInt; indent?: boolean }[] = [
    { label: '介入件数（計）',      key: 'total' },
    { label: '　提案',              key: 'propose_count',   indent: true },
    { label: '　疑義',              key: 'doubt_count',     indent: true },
    { label: '　問い合わせ',        key: 'inquiry_count',   indent: true },
    { label: '処方変更',            key: 'presc_changed' },
    { label: 'がん患者指導料ハ',    key: 'cancer_guidance' },
    { label: '体制充実加算',        key: 'pre_consultation' },
  ];
  const tot: Record<string, number> = {};
  rows.forEach(r => { tot[r.key] = MONTHS.reduce((s, m) => s + v(map.get(m)?.[r.key]), 0); });

  return (
    <table style={T}>
      <colgroup>
        <col style={COL_LBL} />
        {MONTHS.map(m => <col key={m} style={COL_MON} />)}
        <col style={COL_TOT} />
      </colgroup>
      <thead>
        <tr>
          <th style={TH}>項目</th>
          {MONTHS.map(m => <th key={m} style={TH}>{MN(m)}</th>)}
          <th style={TH_TOT}>年計</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ label, key, indent }) => (
          <tr key={key}>
            <td style={{ ...TD_LBL, background: indent ? '#f3f4fe' : '#e8eaf6', fontWeight: indent ? 'normal' : 'bold' }}>
              {label}
            </td>
            {MONTHS.map(m => <td key={m} style={TD}>{dash(v(map.get(m)?.[key]))}</td>)}
            <td style={TD_TOT}>{dash(tot[key])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── 診療科別テーブル ─────────────────────────────────────────────
function DeptTable({ data }: { data: DeptRow[] }) {
  const depts = [...new Set(data.map(r => r.department))].sort();
  const map = new Map<string, Map<number, DeptRow>>();
  data.forEach(r => {
    if (!map.has(r.department)) map.set(r.department, new Map());
    map.get(r.department)!.set(r.month, r);
  });

  const grandTotal = depts.reduce(
    (acc, d) => acc + MONTHS.reduce((s, m) => s + v(map.get(d)?.get(m)?.done), 0), 0
  );

  return (
    <table style={T}>
      <colgroup>
        <col style={COL_LBL} />
        {MONTHS.map(m => <col key={m} style={COL_MON} />)}
        <col style={COL_TOT} />
      </colgroup>
      <thead>
        <tr>
          <th style={TH}>診療科</th>
          {MONTHS.map(m => <th key={m} style={TH}>{MN(m)}</th>)}
          <th style={TH_TOT}>年計</th>
        </tr>
      </thead>
      <tbody>
        {depts.map(dept => {
          const dm = map.get(dept)!;
          const total = MONTHS.reduce((s, m) => s + v(dm.get(m)?.done), 0);
          return (
            <tr key={dept}>
              <td style={TD_LBL}>{dept}</td>
              {MONTHS.map(m => <td key={m} style={TD}>{dash(v(dm.get(m)?.done))}</td>)}
              <td style={TD_TOT}>{dash(total)}</td>
            </tr>
          );
        })}
        <tr>
          <td style={{ ...TD_LBL, background: '#bbdefb', color: '#1a237e' }}>合計</td>
          {MONTHS.map(m => {
            const s = depts.reduce((acc, d) => acc + v(map.get(d)?.get(m)?.done), 0);
            return <td key={m} style={TD_DEPT_TOT}>{dash(s)}</td>;
          })}
          <td style={TD_GRAND}>{dash(grandTotal)}</td>
        </tr>
      </tbody>
    </table>
  );
}

// ─── 介入分類＋レジメン並列テーブル ─────────────────────────────
function CatRegiSection({ categories, regimens }: { categories: CatRow[]; regimens: RegiRow[] }) {
  const catTotal = categories.reduce((s, r) => s + r.cnt, 0);
  const regiTotal = regimens.reduce((s, r) => s + r.done_count, 0);

  const tdS: React.CSSProperties = {
    padding: '3px 6px', border: '1px solid #ddd', fontSize: '0.68rem',
  };
  const tdN: React.CSSProperties = {
    ...tdS, textAlign: 'right', width: 46,
  };
  const tdP: React.CSSProperties = {
    ...tdS, textAlign: 'right', width: 46, color: '#555',
  };

  return (
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
      {/* 介入分類別年間集計 */}
      <Box sx={{ flex: 1 }}>
        <div style={SEC_TITLE}>介入分類別年間集計</div>
        <table style={{ ...T, marginTop: 0 }}>
          <colgroup>
            <col />
            <col style={{ width: 46 }} />
            <col style={{ width: 46 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={TH}>分類</th>
              <th style={TH}>件数</th>
              <th style={TH}>割合</th>
            </tr>
          </thead>
          <tbody>
            {categories.map(r => (
              <tr key={r.category}>
                <td style={{ ...tdS, background: '#e8eaf6', fontWeight: 'bold' }}>{r.category}</td>
                <td style={tdN}>{r.cnt}</td>
                <td style={tdP}>{pct(r.cnt, catTotal)}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...tdS, background: '#bbdefb', fontWeight: 'bold' }}>合計</td>
              <td style={{ ...tdN, background: '#fff8e1', fontWeight: 'bold' }}>{catTotal}</td>
              <td style={{ ...tdP, background: '#fff8e1' }}>100%</td>
            </tr>
          </tbody>
        </table>
      </Box>

      {/* 主要レジメン年間実施件数 */}
      <Box sx={{ flex: 1 }}>
        <div style={SEC_TITLE}>主要レジメン年間実施件数（上位25）</div>
        <table style={{ ...T, marginTop: 0 }}>
          <colgroup>
            <col />
            <col style={{ width: 46 }} />
            <col style={{ width: 46 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={TH}>レジメン名</th>
              <th style={TH}>件数</th>
              <th style={TH}>割合</th>
            </tr>
          </thead>
          <tbody>
            {regimens.map(r => (
              <tr key={r.regimen_name}>
                <td style={{ ...tdS, background: '#e8eaf6' }}>{r.regimen_name}</td>
                <td style={tdN}>{r.done_count}</td>
                <td style={tdP}>{pct(r.done_count, regiTotal)}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...tdS, background: '#bbdefb', fontWeight: 'bold' }}>合計（上位25計）</td>
              <td style={{ ...tdN, background: '#fff8e1', fontWeight: 'bold' }}>{regiTotal}</td>
              <td style={{ ...tdP, background: '#fff8e1' }}>-</td>
            </tr>
          </tbody>
        </table>
      </Box>
    </Box>
  );
}

// ─── セクションラッパー ───────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={SECTION_BOX}>
      <div style={SEC_TITLE}>{title}</div>
      {children}
    </div>
  );
}

// ─── 年報レポート本体 ─────────────────────────────────────────────
function AnnualReport({ data }: { data: AnnualData }) {
  const injTotalYear  = data.months_inj.reduce((s, r) => s + r.inj_total, 0);
  const injDoneYear   = data.months_inj.reduce((s, r) => s + r.inj_done,  0);
  const oralDoneYear  = data.months_diary.reduce((s, r) => s + r.oral_done, 0);
  const intTotalYear  = data.months_int.reduce((s, r) => s + r.total, 0);

  return (
    <Box sx={{
      fontFamily: '"Noto Sans JP", "Yu Gothic", sans-serif',
      bgcolor: '#fff', p: '10mm',
      width: '210mm', minHeight: '297mm',
      boxSizing: 'border-box',
    }}>
      {/* ヘッダー */}
      <Box sx={{ textAlign: 'center', mb: '5mm', borderBottom: '2.5px solid #1a3a5c', pb: '3mm' }}>
        <Typography sx={{ fontWeight: 'bold', fontSize: '1.2rem', color: '#1a3a5c' }}>
          京都桂病院　外来化学療法センター
        </Typography>
        <Typography sx={{ fontWeight: 'bold', fontSize: '1.4rem', color: '#1a3a5c' }}>
          {data.year}年　年報
        </Typography>
      </Box>

      {/* サマリーカード */}
      <Box sx={{ display: 'flex', gap: 2, mb: '5mm', justifyContent: 'center' }}>
        {[
          { label: '注射　予定件数', val: injTotalYear },
          { label: '注射　実施件数', val: injDoneYear },
          { label: '注射　実施率',   val: pct(injDoneYear, injTotalYear) },
          { label: '内服　実施件数', val: oralDoneYear },
          { label: '介入件数（計）', val: intTotalYear },
        ].map(item => (
          <Box key={item.label} sx={{
            border: '1.5px solid #1a3a5c', borderRadius: 1,
            px: 1.5, py: 0.75, textAlign: 'center', minWidth: 90,
          }}>
            <Typography sx={{ fontSize: '0.62rem', color: '#555', whiteSpace: 'nowrap' }}>{item.label}</Typography>
            <Typography sx={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#1a3a5c' }}>
              {typeof item.val === 'number' ? item.val.toLocaleString() : item.val}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* ① 注射 */}
      <Section title="① 月別実施状況（注射）">
        <InjTable data={data.months_inj} />
      </Section>

      {/* ② 内服 */}
      <Section title="② 月別実施状況（内服）">
        <OralTable data={data.months_diary} />
      </Section>

      {/* ③ 介入 */}
      <Section title="③ 介入件数　月別推移">
        <IntTable data={data.months_int} />
      </Section>

      {/* ④ 診療科別 */}
      <Section title="④ 診療科別　月別実施件数（注射）">
        <DeptTable data={data.departments} />
      </Section>

      {/* ⑤ 分類 + レジメン */}
      <div style={SECTION_BOX}>
        <CatRegiSection categories={data.categories} regimens={data.regimens} />
      </div>

      {/* フッター */}
      <Divider sx={{ my: '3mm' }} />
      <Typography sx={{ fontSize: '0.65rem', color: '#888', textAlign: 'right' }}>
        外来化学療法センター薬剤師業務　{data.year}年度年報
      </Typography>
    </Box>
  );
}

// ─── メインページ ─────────────────────────────────────────────────
export default function AnnualPage() {
  const { user, logout } = useAuth();
  const currentYear = new Date().getFullYear();
  const [year,    setYear]    = useState(currentYear);
  const [data,    setData]    = useState<AnnualData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);

  const fetchAnnual = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<AnnualData>('/annual', { params: { year } });
      setData(res.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [year]);

  const handlePrint = () => window.print();

  return (
    <>
      {/* 印刷CSS */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          .no-print { display: none !important; }
          .print-body { display: block !important; }
        }
        @media screen {
          .print-body { display: block; }
        }
      `}</style>

      {/* AppBar */}
      <AppBar position="static" className="no-print" sx={{ bgcolor: '#1a3a5c' }}>
        <Toolbar sx={{ gap: 1.5, minHeight: 44 }}>
          <Typography fontWeight="bold" sx={{ fontSize: '0.9rem' }}>年報</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>{user?.displayName}</Typography>
          <Button color="inherit" size="small" onClick={logout} sx={{ fontSize: '0.72rem' }}>ログアウト</Button>
        </Toolbar>
      </AppBar>

      {/* コントロールバー */}
      <Box className="no-print" sx={{
        display: 'flex', alignItems: 'center', gap: 1.5,
        px: 2, py: 1, bgcolor: '#f5f5f5', borderBottom: '1px solid #ddd',
      }}>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel sx={{ fontSize: '0.8rem' }}>年度</InputLabel>
          <Select
            value={year}
            label="年度"
            onChange={e => setYear(Number(e.target.value))}
            sx={{ fontSize: '0.8rem' }}
          >
            {yearOptions.map(y => (
              <MenuItem key={y} value={y} sx={{ fontSize: '0.8rem' }}>{y}年</MenuItem>
            ))}
          </Select>
        </FormControl>

        <Button
          variant="contained"
          size="small"
          startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <Download />}
          onClick={fetchAnnual}
          disabled={loading}
          sx={{ bgcolor: '#1a3a5c', '&:hover': { bgcolor: '#0d2137' }, fontSize: '0.8rem' }}
        >
          {loading ? '集計中...' : 'データ取り込み'}
        </Button>

        {data && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<Print />}
            onClick={handlePrint}
            sx={{ fontSize: '0.8rem' }}
          >
            印刷（A4縦）
          </Button>
        )}

        {error && (
          <Alert severity="error" sx={{ py: 0.25, fontSize: '0.75rem' }}>{error}</Alert>
        )}

        {data && (
          <Typography sx={{ fontSize: '0.75rem', color: '#555', ml: 'auto' }}>
            {data.year}年　集計完了
          </Typography>
        )}
      </Box>

      {/* プレビュー / 印刷エリア */}
      {data ? (
        <Box className="print-body" sx={{
          bgcolor: '#e0e0e0',
          p: { xs: 1, sm: 2 },
          minHeight: 'calc(100vh - 100px)',
          display: 'flex', justifyContent: 'center',
        }}>
          <Paper elevation={4} sx={{
            '@media print': { boxShadow: 'none', width: '100%' },
          }}>
            <AnnualReport data={data} />
          </Paper>
        </Box>
      ) : (
        <Box className="no-print" sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: 'calc(100vh - 100px)', flexDirection: 'column', gap: 1,
        }}>
          <Typography sx={{ color: '#aaa', fontSize: '0.9rem' }}>
            年度を選択して「データ取り込み」ボタンを押してください
          </Typography>
        </Box>
      )}
    </>
  );
}
