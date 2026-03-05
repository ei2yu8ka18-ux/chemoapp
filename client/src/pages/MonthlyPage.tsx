import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, AppBar, Toolbar, Button, CircularProgress, Paper,
  Table, TableHead, TableRow, TableCell, TableBody, Select, MenuItem,
} from '@mui/material';
import { Print } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

// A4縦・1枚
const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 8mm; }
  html, body { font-size: 7pt !important; }
  .no-print { display: none !important; }
  table { border-collapse: collapse !important; width: 100%; }
  th, td { font-size: 6.5pt !important; padding: 1px 4px !important; line-height: 1.3; }
  .MuiPaper-root { box-shadow: none !important; border: 1px solid #bbb !important; margin-bottom: 2mm !important; }
}
@media screen { .print-only { display: none !important; } }
`;

// 介入分類マスタ（0件でも表示するため）
const ALL_CATEGORIES = [
  'オピオイド','検査提案','抗がん剤用量調節','他科受診提案',
  '実施指示確認','注射薬不備','内服薬不備','登録レジメン不一致',
  '副作用対策','その他',
];

const TH = ({ children, w }: { children: React.ReactNode; w?: number | string }) => (
  <TableCell sx={{ border: '1px solid #bbb', bgcolor: '#dce8f5', fontWeight: 'bold',
    fontSize: '0.72rem', p: '3px 6px', whiteSpace: 'nowrap', width: w, textAlign: 'center' }}>
    {children}
  </TableCell>
);
const TD = ({ children, bold, center }: { children?: React.ReactNode; bold?: boolean; center?: boolean }) => (
  <TableCell sx={{ border: '1px solid #ddd', fontSize: '0.78rem', p: '2px 6px',
    textAlign: center ? 'center' : 'left', fontWeight: bold ? 'bold' : 'normal' }}>
    {children ?? 0}
  </TableCell>
);

function fmtMin(m: number): string {
  if (!m || m <= 0) return '-';
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2,'0')}m`;
}

interface PharmacistStat {
  pharmacist_name: string;
  mon: number; tue: number; wed: number; thu: number; fri: number;
  days: number; total_minutes: number;
}

interface MonthlyData {
  period:          { year: number; month: number; from: string; to: string };
  injection:       Record<string, number>;
  diary:           Record<string, number>;
  intervention:    Record<string, number>;
  categories:      { category: string; cnt: number }[];
  pharmacists:     PharmacistStat[];
  categoryDetails: { category: string; detail: string; drug_route: string; cnt: number }[];
}

const now = new Date();

export default function MonthlyPage() {
  const { user, logout } = useAuth();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data,  setData]  = useState<MonthlyData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<MonthlyData>('/monthly', { params: { year, month } });
      setData(res.data);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const d  = data;
  const inj = d?.injection  || {};
  const di  = d?.diary      || {};
  const iv  = d?.intervention || {};

  const injIntTotal  = (iv.propose_count||0) + (iv.doubt_count||0) + (iv.inquiry_count||0);
  const oralTotal    = (di.oral_propose||0) + (di.oral_doubt||0) + (di.oral_inquiry||0);
  const prescPct     = injIntTotal > 0
    ? `${Math.round((iv.presc_changed||0) / injIntTotal * 100)}%` : '0%';

  // 介入分類×詳細をグループ化（点滴/内服別）+ 0件カテゴリも表示
  type RouteCount = { inj: number; oral: number };
  const catDetailMap: Record<string, Record<string, RouteCount>> = {};
  ALL_CATEGORIES.forEach(cat => { catDetailMap[cat] = {}; });
  (d?.categoryDetails || []).forEach(r => {
    if (!catDetailMap[r.category]) catDetailMap[r.category] = {};
    const det = r.detail || '（未分類）';
    if (!catDetailMap[r.category][det]) catDetailMap[r.category][det] = { inj: 0, oral: 0 };
    if (r.drug_route === '内服') {
      catDetailMap[r.category][det].oral += r.cnt;
    } else {
      catDetailMap[r.category][det].inj += r.cnt;
    }
  });

  // カテゴリ合計を取得（ソート: 件数降順）
  const catTotals: Record<string, number> = {};
  ALL_CATEGORIES.forEach(cat => {
    catTotals[cat] = Object.values(catDetailMap[cat] || {}).reduce((s, v) => s + v.inj + v.oral, 0);
  });
  const sortedCats = [...ALL_CATEGORIES].sort((a, b) => catTotals[b] - catTotals[a]);

  return (
    <>
      <style>{PRINT_CSS}</style>
      <AppBar position="static" className="no-print" sx={{ bgcolor: '#1a5276' }}>
        <Toolbar sx={{ gap: 1.5, minHeight: 44 }}>
          <Typography fontWeight="bold" sx={{ fontSize: '0.9rem' }}>月報</Typography>
          <Select size="small" value={year}
            onChange={e => setYear(Number(e.target.value))}
            sx={{ bgcolor: '#fff', height: 30, fontSize: '0.8rem' }}>
            {[now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1].map(y => (
              <MenuItem key={y} value={y}>{y}年</MenuItem>
            ))}
          </Select>
          <Select size="small" value={month}
            onChange={e => setMonth(Number(e.target.value))}
            sx={{ bgcolor: '#fff', height: 30, fontSize: '0.8rem' }}>
            {Array.from({length:12},(_,i)=>i+1).map(m => (
              <MenuItem key={m} value={m}>{m}月</MenuItem>
            ))}
          </Select>
          <Button variant="outlined" size="small" color="inherit"
            startIcon={<Print />} onClick={() => window.print()} sx={{ fontSize: '0.75rem' }}>
            印刷
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          <Typography sx={{ fontSize: '0.78rem' }}>{user?.displayName}</Typography>
          <Button color="inherit" size="small" onClick={logout} sx={{ fontSize: '0.72rem' }}>ログアウト</Button>
        </Toolbar>
      </AppBar>

      {/* 印刷タイトル */}
      <Box className="print-only" sx={{ textAlign: 'center', mb: '3mm' }}>
        <Typography sx={{ fontSize: '13pt', fontWeight: 'bold' }}>外来化学療法センター 月報</Typography>
        <Typography sx={{ fontSize: '10pt' }}>{year}年{month}月</Typography>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>
      ) : !d ? null : (
        <Box sx={{ p: 1.5, maxWidth: 800 }}>

          {/* ── 1. 外来化学療法センター（点滴）── */}
          <Paper elevation={1} sx={{ p: 1, mb: 1.5 }}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 'bold', mb: 0.5 }}>
              ■ 外来化学療法センター（点滴）
            </Typography>

            {/* 実施内容 */}
            <Typography sx={{ fontSize: '0.75rem', color: '#555', mb: 0.25 }}>実施内容</Typography>
            <Table size="small" sx={{ borderCollapse: 'collapse', mb: 0.75 }}>
              <TableHead>
                <TableRow>
                  {['実施予定件数','実施件数','中止件数','変更件数'].map(h => <TH key={h}>{h}</TH>)}
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TD center bold>{inj.inj_total}</TD>
                  <TD center bold>{inj.inj_done}</TD>
                  <TD center>{inj.inj_cancelled}</TD>
                  <TD center>{inj.inj_changed}</TD>
                </TableRow>
              </TableBody>
            </Table>

            {/* 介入内容 */}
            <Typography sx={{ fontSize: '0.75rem', color: '#555', mb: 0.25 }}>介入内容</Typography>
            <Table size="small" sx={{ borderCollapse: 'collapse', mb: 0.75 }}>
              <TableHead>
                <TableRow>
                  {['提案','疑義','問合せ','介入合計','処方変更あり','代行処方','症例候補'].map(h => <TH key={h}>{h}</TH>)}
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TD center>{iv.propose_count}</TD>
                  <TD center>{iv.doubt_count}</TD>
                  <TD center>{iv.inquiry_count}</TD>
                  <TD center bold>{injIntTotal}</TD>
                  <TD center>
                    {iv.presc_changed ?? 0}
                    <Typography component="span" sx={{ fontSize: '0.68rem', color: '#777', ml: 0.25 }}>({prescPct})</Typography>
                  </TD>
                  <TD center>{iv.proxy_presc}</TD>
                  <TD center>{iv.case_candidate}</TD>
                </TableRow>
              </TableBody>
            </Table>

            {/* 算定 */}
            <Typography sx={{ fontSize: '0.75rem', color: '#555', mb: 0.25 }}>算定</Typography>
            <Table size="small" sx={{ borderCollapse: 'collapse' }}>
              <TableHead>
                <TableRow>
                  {['がん患者指導料ハ','診察前面談算定あり'].map(h => <TH key={h}>{h}</TH>)}
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TD center bold>{iv.cancer_guidance}</TD>
                  <TD center bold>{iv.pre_consultation}</TD>
                </TableRow>
              </TableBody>
            </Table>
          </Paper>

          {/* ── 2. 外来化学療法センター（内服）── */}
          <Paper elevation={1} sx={{ p: 1, mb: 1.5 }}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 'bold', mb: 0.5 }}>
              ■ 外来化学療法センター（内服）
            </Typography>

            {/* 実施内容 */}
            <Typography sx={{ fontSize: '0.75rem', color: '#555', mb: 0.25 }}>実施内容</Typography>
            <Table size="small" sx={{ borderCollapse: 'collapse', mb: 0.75 }}>
              <TableHead>
                <TableRow>
                  {['実施予定件数','実施件数','中止件数','変更件数','患者指導','初回指導'].map(h => <TH key={h}>{h}</TH>)}
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TD center bold>{di.oral_scheduled}</TD>
                  <TD center bold>{di.oral_done}</TD>
                  <TD center>{di.oral_cancelled}</TD>
                  <TD center>{di.oral_changed}</TD>
                  <TD center>{di.oral_patient_counseling}</TD>
                  <TD center>{di.oral_first_visit}</TD>
                </TableRow>
              </TableBody>
            </Table>

            {/* 介入内容 */}
            <Typography sx={{ fontSize: '0.75rem', color: '#555', mb: 0.25 }}>介入内容</Typography>
            <Table size="small" sx={{ borderCollapse: 'collapse' }}>
              <TableHead>
                <TableRow>
                  {['提案','疑義','問合せ','介入合計'].map(h => <TH key={h}>{h}</TH>)}
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TD center>{di.oral_propose}</TD>
                  <TD center>{di.oral_doubt}</TD>
                  <TD center>{di.oral_inquiry}</TD>
                  <TD center bold>{oralTotal}</TD>
                </TableRow>
              </TableBody>
            </Table>
          </Paper>

          {/* ── 3. 介入分類別件数（点滴/内服別 / 件数降順） ── */}
          <Paper elevation={1} sx={{ p: 1, mb: 1.5 }}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 'bold', mb: 0.5 }}>
              ■ 介入分類別件数（点滴/内服別・件数降順・0件含む）
            </Typography>
            <Table size="small" sx={{ borderCollapse: 'collapse' }}>
              <TableHead>
                <TableRow>
                  <TH w={120}>介入分類</TH>
                  <TH w={140}>詳細</TH>
                  <TH w={48}>点滴</TH>
                  <TH w={48}>内服</TH>
                  <TH w={48}>合計</TH>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedCats.map(cat => {
                  const detailEntries = Object.entries(catDetailMap[cat] || {});
                  const total = catTotals[cat];
                  if (detailEntries.length === 0) {
                    // 0件カテゴリ
                    return (
                      <TableRow key={cat}>
                        <TableCell sx={{ border: '1px solid #ddd', fontSize: '0.72rem', p: '2px 6px',
                          fontWeight: 'bold', bgcolor: '#f5f5f5' }}>
                          {cat}
                        </TableCell>
                        <TableCell sx={{ border: '1px solid #ddd', fontSize: '0.72rem', p: '2px 6px',
                          color: '#aaa' }}>
                          -
                        </TableCell>
                        <TD center>0</TD>
                        <TD center>0</TD>
                        <TD center bold>0</TD>
                      </TableRow>
                    );
                  }
                  return detailEntries.map(([det, counts], i) => {
                    const rowTotal = counts.inj + counts.oral;
                    return (
                      <TableRow key={`${cat}-${i}`}>
                        {i === 0 && (
                          <TableCell rowSpan={detailEntries.length}
                            sx={{ border: '1px solid #ddd', fontSize: '0.72rem', p: '2px 6px',
                              fontWeight: 'bold', verticalAlign: 'top', bgcolor: '#f5f5f5' }}>
                            {cat}
                            <Typography sx={{ fontSize: '0.65rem', color: '#888' }}>
                              計{total}件
                            </Typography>
                          </TableCell>
                        )}
                        <TD>{det}</TD>
                        <TD center>{counts.inj || 0}</TD>
                        <TD center>{counts.oral || 0}</TD>
                        <TD center bold>{rowTotal}</TD>
                      </TableRow>
                    );
                  });
                })}
              </TableBody>
            </Table>
          </Paper>

          {/* ── 4. 薬剤師業務時間 ── */}
          <Paper elevation={1} sx={{ p: 1, mb: 1.5 }}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 'bold', mb: 0.5 }}>■ 薬剤師業務時間</Typography>
            <Table size="small" sx={{ borderCollapse: 'collapse' }}>
              <TableHead>
                <TableRow>
                  <TH>氏名</TH>
                  <TH w={32}>月</TH>
                  <TH w={32}>火</TH>
                  <TH w={32}>水</TH>
                  <TH w={32}>木</TH>
                  <TH w={32}>金</TH>
                  <TH w={48}>合計日数</TH>
                  <TH w={80}>合計実働時間</TH>
                </TableRow>
              </TableHead>
              <TableBody>
                {(d.pharmacists || []).map(ph => (
                  <TableRow key={ph.pharmacist_name}>
                    <TD bold>{ph.pharmacist_name}</TD>
                    <TD center>{ph.mon || 0}</TD>
                    <TD center>{ph.tue || 0}</TD>
                    <TD center>{ph.wed || 0}</TD>
                    <TD center>{ph.thu || 0}</TD>
                    <TD center>{ph.fri || 0}</TD>
                    <TD center bold>{ph.days}</TD>
                    <TD center>{fmtMin(ph.total_minutes)}</TD>
                  </TableRow>
                ))}
                {(d.pharmacists || []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} sx={{ fontSize: '0.72rem', color: '#888', p: '4px 6px' }}>
                      データなし
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>

          {/* 手動集計項目 */}
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 1 }}>
            {([
              ['記録日数', 'diary_days'],
              ['初回指導', 'first_visit_counseling'],
              ['アレルギー中止', 'allergy_stop'],
              ['レジメンチェック', 'regimen_check'],
              ['レジメン操作', 'regimen_operation'],
            ] as [string, string][]).map(([lbl, key]) => (
              <Box key={key} sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                <Typography sx={{ fontSize: '0.72rem', color: '#555' }}>{lbl}：</Typography>
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 'bold' }}>{di[key] ?? 0}</Typography>
              </Box>
            ))}
          </Box>

        </Box>
      )}
    </>
  );
}
