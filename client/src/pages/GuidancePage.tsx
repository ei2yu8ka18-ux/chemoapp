import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, AppBar, Toolbar, Paper,
  List, ListItemButton, ListItemText, Alert, CircularProgress,
  TextField, Divider, Chip,
} from '@mui/material';
import { Download, Print, PrintOutlined } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

// ─── 型定義 ──────────────────────────────────────────────────────
interface OrderRow {
  patient_id:   string;
  order_no:     string;
  order_date:   string;
  patient_name: string;
  patient_no:   string;   // カルテ番号
  drug_code_sc: string;
  drug_code:    string;
  drug_name:    string;
  note1:        string;
  note2:        string;
  inject_time:  string;
}

interface DrugGroup {
  index:        number;
  image:        string | null;
  duration:     string;
  names:        { text: string; isHR: boolean }[];  // isHR=true → 赤字表示
  takeHome:     boolean;
  isEqual:      boolean;
  vesicantType: 'vesicant' | 'warning' | null;       // 付箋種別
}

// ─── vesicantシート薬剤コード ─────────────────────────────────────
const VESICANT_CODES = new Set([
  'I5000304','I5000303','I5000050','I5000678','I5000677',
  'I5001311','I5000086','II5001152','I5000838','I5000839',
  'I5000683','I5000684','I5000685','I5000147','I5000148',
  'I5000928','I5000236','I5001310','I5000848','I5000248',
  'I5001172','I5001173','I5000102','I5000139','I5000681',
]);
const WARNING_CODES = new Set([
  'I5000859','I5000860','I5000686','I5000498','I5001080',
  'I5001062','I5000674','I5000675','I5000152','I5000153',
  'I5000851','I5000861','II5000862','I5000734','I5000203',
  'I5000204','I5000238','I5000252','I5001143','I5000298',
  'I5000858','II5000116','II5000117',
]);

interface PatientSheet {
  patientId:   string;
  patientNo:   string;   // カルテ番号
  patientName: string;
  orderDate:   string;
  totalTime:   string;
  groups:      DrugGroup[];
}

// ─── VBAロジック移植 ─────────────────────────────────────────────

const DRUG_DEFAULTS: Record<string, number> = {
  'I5001350': 30, 'I5001349': 30, 'I5000048': 30, 'I5000049': 30,
  'I5000970': 240, 'I5000960': 30, 'I5000050': 30,
  'I5000954': 240, 'I5000953': 240, 'I5000439': 240,
  'I9000022': 240, 'I5000440': 240, 'I9000089': 240,
  'I5000029': 75, 'I5000030': 75, 'I5000031': 75,
  'I5000983': 90, 'I5000888': 60, 'I5000889': 60,
  'I5000453': 240, 'I5001110': 30, 'I5001111': 30,
  'I5001271': 5, 'I5001002': 1, 'I5000379': 1,
  'I5001112': 3, 'I5001200': 1,
};

/** 薬剤名に<HR>または〈HR〉が含まれるか判定 */
function hasHR(raw: string): boolean {
  return /[〈<（][ＨH][ＲR ][〉>）]/.test(raw);
}

function normName(raw: string): string {
  let s = raw
    .replace(/５/g, '5')
    .replace(/[〈<（][ＨH][ＲR ][〉>）]/g, '')
    .replace(/注射用水PL「フソー」２０ｍＬ/g, '')
    .replace(/注射用/g, '')
    .replace(/高\)/g, '')
    .trim();
  if (!s || s.includes('注射用水')) return '';
  if (s.includes('5％') && s.includes('糖液')) return '5％ブドウ糖液';
  if (s.includes('生食') || s.includes('生理食塩')) return '生理食塩液';
  if (s.includes('ﾊﾟｸﾘﾀｷｾﾙ')) return 'パクリタキセル';
  if (s.includes('ｶﾙﾎﾞﾌﾟﾗﾁﾝ')) return 'カルボプラチン';
  if (s.includes('硫酸')) return '硫酸マグネシウム';
  if (s.includes('ハイドロ')) return 'ハイドロコートン';
  const m = s.match(/^[ァ-ヶー・]+/);
  return m ? m[0] : s;
}

function parseMins(raw: string, code: string): number {
  const t = raw.trim();
  if (!t) return DRUG_DEFAULTS[code] ?? 10;
  const hm = t.match(/(\d+)時間\s*(\d*)分?/);
  if (hm) return parseInt(hm[1]) * 60 + (hm[2] ? parseInt(hm[2]) : 0);
  const mn = t.match(/(\d+)分/);
  if (mn) return parseInt(mn[1]);
  return 10;
}

function fmtDur(min: number): string {
  if (min <= 0) return '';
  const r = Math.min(240, Math.round(min / 5) * 5);
  if (r % 60 === 0) return `${r / 60}時間`;
  if (r > 60) return `${Math.floor(r / 60)}時間${r % 60}分`;
  return `${r}分`;
}

function fmtTotal(min: number): string {
  if (min <= 0) return '0分';
  const h = Math.floor(min / 60), m = min % 60;
  if (h && m) return `${h}時間${m}分`;
  return h ? `${h}時間` : `${m}分`;
}

function extractVol(name: string): number | null {
  const m = name.match(/(\d+)\s*[mｍ][lＬ]/i);
  return m ? parseInt(m[1]) : null;
}

function selectImage(code: string, rawName: string): string | null {
  if (code === 'I20118') return 'sc.png';
  const vol = extractVol(rawName);
  if (/生食|生理食塩/.test(rawName)) {
    if (vol === 10)  return 'ns10.png';
    if (vol === 50)  return 'ns50.png';
    if (vol === 250) return 'ns250.png';
    if (vol === 500) return 'ns500.png';
    return 'ns100.png';
  }
  if (/ソリタ/.test(rawName)) return (vol ?? 0) >= 400 ? 'sorita500.png' : 'sorita200.png';
  if (/KN|ケーエヌ/i.test(rawName)) return 'kn1.png';
  if (/マンニトール/.test(rawName)) return 'mannitol.jpg';
  if (/ヘパリン/.test(rawName)) return 'hepa100.png';
  if (/ブドウ糖/.test(rawName)) {
    if (vol === 250) return 'tz250.png';
    if (vol === 500) return 'tz500.png';
    return 'tz100.png';
  }
  return null;
}

// ─── APIレスポンス → PatientSheet[] ─────────────────────────────
function parseOrderRows(rows: OrderRow[]): PatientSheet[] {
  const pat = new Map<string, Map<string, OrderRow[]>>();
  for (const r of rows) {
    const pid = r.patient_id.trim();
    if (!pid) continue;
    const ono = r.order_no.trim();
    if (!pat.has(pid)) pat.set(pid, new Map());
    const om = pat.get(pid)!;
    if (!om.has(ono)) om.set(ono, []);
    om.get(ono)!.push(r);
  }

  const result: PatientSheet[] = [];

  for (const [pid, orderMap] of pat) {
    const firstRow = [...orderMap.values()][0][0];
    const patientName = firstRow.patient_name.trim();
    const patientNo   = firstRow.patient_no ?? '';
    const rawDate     = firstRow.order_date.trim();
    const orderDate   = rawDate.match(/^\d{8}$/)
      ? `${rawDate.slice(0,4)}/${rawDate.slice(4,6)}/${rawDate.slice(6,8)}`
      : rawDate;

    const groups: DrugGroup[] = [];
    let totalMin = 0;
    let gi = 0;

    for (const [, oRows] of orderMap) {
      if (gi >= 12) break;

      const allNotes = oRows.map(r => `${r.note1} ${r.note2}`).join(' ');
      const takeHome = allNotes.includes('ｲﾝﾌｭｰｻﾞｰにて約46時間');
      const simStart = /イリノテカンと同時に開始|エルプラットと同時に開始/.test(allNotes);
      const hasLevo  = oRows.some(r => /レボホリナート/.test(r.drug_name));
      const skipLevo = simStart && hasLevo;

      let groupMax = 0;
      for (const r of oRows) {
        if (skipLevo && /レボホリナート/.test(r.drug_name)) continue;
        const m = parseMins(r.inject_time, r.drug_code);
        if (m > groupMax) groupMax = m;
      }

      let img: string | null = takeHome ? 'pomp.png' : null;
      if (!img) {
        for (const r of oRows) {
          if (skipLevo && /レボホリナート/.test(r.drug_name)) continue;
          const found = selectImage(r.drug_code, r.drug_name);
          if (found) { img = found; break; }
        }
        if (!img) img = 'ns100.png';
      }

      const nameMap = new Map<string, boolean>(); // name → isHR
      let vesicantType: 'vesicant' | 'warning' | null = null;
      for (const r of oRows) {
        if (skipLevo && /レボホリナート/.test(r.drug_name)) continue;
        const n = normName(r.drug_name);
        if (n && !nameMap.has(n)) nameMap.set(n, hasHR(r.drug_name));
        // vesicant判定（vesicant優先）
        if (VESICANT_CODES.has(r.drug_code)) {
          vesicantType = 'vesicant';
        } else if (WARNING_CODES.has(r.drug_code) && vesicantType !== 'vesicant') {
          vesicantType = 'warning';
        }
      }
      const names = [...nameMap.entries()].map(([text, isHR]) => ({ text, isHR }));

      const duration = takeHome ? '持ち帰り' : fmtDur(groupMax);
      if (!takeHome) totalMin += groupMax;

      groups.push({
        index: gi, image: img, duration,
        names, takeHome, isEqual: false, vesicantType,
      });
      gi++;
    }

    result.push({ patientId: pid, patientNo, patientName, orderDate, totalTime: fmtTotal(totalMin), groups });
  }

  return result;
}

// ─── 説明書コンポーネント ─────────────────────────────────────────
const LABELS = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫'];

function ExplanationSheet({ ps }: { ps: PatientSheet }) {
  return (
    <Box sx={{ p: '6mm', fontFamily: '"Noto Sans JP", "Yu Gothic", sans-serif', bgcolor: '#fff' }}>
      <Typography sx={{
        textAlign: 'center', fontWeight: 'bold', fontSize: '1rem', mb: '2mm',
        borderBottom: '2px solid #1565c0', pb: '1mm',
      }}>
        京都桂病院　外来化学療法センターで治療を受ける方へ
      </Typography>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: '3mm' }}>
        <Typography sx={{ fontWeight: 'bold', fontSize: '1.05rem' }}>
          {ps.patientName} 様
        </Typography>
        <Typography sx={{ fontWeight: 'bold', fontSize: '0.95rem', color: '#1565c0' }}>
          本日の予定時間：約{ps.totalTime}
        </Typography>
        <Typography sx={{ fontSize: '0.9rem' }}>{ps.orderDate}</Typography>
      </Box>

      <Box sx={{
        display: 'flex', alignItems: 'flex-start',
        flexWrap: 'wrap', gap: 0, rowGap: '2mm', mb: '3mm',
        borderTop: '1px solid #ccc', borderBottom: '1px solid #ccc',
        py: '3mm',
      }}>
        {ps.groups.map((grp, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start' }}>
            {i > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', height: 90, px: '2mm' }}>
                <Typography sx={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#333', lineHeight: 1 }}>
                  {grp.isEqual ? '＝' : '→'}
                </Typography>
              </Box>
            )}
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 82, flexShrink: 0 }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#555' }}>
                {LABELS[grp.index] ?? ''}
              </Typography>
              {/* 点滴袋画像 + vesicant付箋オーバーレイ */}
              <Box sx={{ width: 72, height: 76, display: 'flex', alignItems: 'center', justifyContent: 'center', my: '1mm', position: 'relative' }}>
                {grp.image ? (
                  <img
                    src={`/images/drug-bags/${grp.image}`}
                    alt={grp.names[0]?.text || '点滴'}
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                  />
                ) : (
                  <Box sx={{ width: 60, height: 70, border: '1px solid #aaa', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography sx={{ fontSize: '0.6rem', color: '#999' }}>袋</Typography>
                  </Box>
                )}
                {/* vesicant / warning 付箋 */}
                {grp.vesicantType && (
                  <img
                    src={`/images/drug-bags/${grp.vesicantType}.png`}
                    alt={grp.vesicantType}
                    style={{
                      position: 'absolute', top: 0, right: 0,
                      width: 30, height: 30, objectFit: 'contain', zIndex: 2,
                    }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
              </Box>
              {grp.duration && (
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 'bold', color: grp.takeHome ? '#c62828' : '#1565c0', textAlign: 'center' }}>
                  {grp.duration}
                </Typography>
              )}
              {/* 薬剤名：<HR>含むものは赤字太字 */}
              {grp.names.map((entry, ni) => (
                <Typography key={ni} sx={{
                  fontSize: '0.62rem', textAlign: 'center', lineHeight: 1.3, mt: '0.5mm',
                  color: entry.isHR ? '#c62828' : '#111',
                  fontWeight: entry.isHR ? 'bold' : 'normal',
                  wordBreak: 'break-all', width: '100%',
                }}>
                  {entry.text}
                </Typography>
              ))}
            </Box>
          </Box>
        ))}

        {ps.groups.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', height: 90, px: '2mm' }}>
              <Typography sx={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#333' }}>→</Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 60, height: 90 }}>
              <Box sx={{ border: '2px solid #333', borderRadius: 1, px: '3mm', py: '1mm' }}>
                <Typography sx={{ fontWeight: 'bold', fontSize: '0.9rem' }}>終了</Typography>
              </Box>
            </Box>
          </Box>
        )}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: '4mm', mt: '2mm' }}>
        <Typography sx={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#c62828', whiteSpace: 'nowrap' }}>
          点滴漏れ注意！
        </Typography>
        <Typography sx={{ fontSize: '0.8rem' }}>
          点滴中、痛みやはれを感じたらお知らせ下さい
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mt: '2mm' }}>
        <Typography sx={{ fontSize: '0.8rem', color: '#555' }}>外来化学療法センター</Typography>
        {/* 印刷時右下マスコット */}
        <img
          src="/images/mascot.png"
          alt="マスコット"
          style={{ width: 192, height: 192, objectFit: 'contain' }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      </Box>
    </Box>
  );
}

// ─── メインページ ──────────────────────────────────────────────────
function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function GuidancePage() {
  const { user, logout } = useAuth();
  const [date, setDate]           = useState<string>(toLocalDateStr(new Date()));
  const [patients, setPatients]   = useState<PatientSheet[]>([]);
  const [selected, setSelected]   = useState<PatientSheet | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [printAll, setPrintAll]   = useState(false);

  // 取り込みボタン → APIコール
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPatients([]);
    setSelected(null);
    try {
      const res = await api.get<OrderRow[]>('/guidance/orders', { params: { date } });
      const rows = res.data;
      if (!rows.length) {
        setError('該当日のオーダーデータが見つかりません');
        return;
      }
      const sheets = parseOrderRows(rows);
      setPatients(sheets);
      setSelected(sheets[0]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [date]);

  // 一括印刷（全患者）
  const handleBatchPrint = useCallback(() => {
    setPrintAll(true);
  }, []);

  // 個別印刷（選択患者）
  const handleSinglePrint = useCallback(() => {
    setPrintAll(false);
    setTimeout(() => window.print(), 50);
  }, []);

  // printAll がtrueになったらRe-renderの後に印刷
  useEffect(() => {
    if (printAll) {
      const timer = setTimeout(() => {
        window.print();
        setPrintAll(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [printAll]);

  return (
    <>
      {/* 印刷CSS */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 6mm; }
          .no-print { display: none !important; }
          .print-sheet { display: block !important; page-break-after: always; }
          .print-sheet:last-child { page-break-after: avoid; }
        }
        @media screen {
          .print-sheet { display: none !important; }
        }
      `}</style>

      {/* AppBar */}
      <AppBar position="static" className="no-print" sx={{ bgcolor: '#1a5276' }}>
        <Toolbar sx={{ gap: 1.5, minHeight: 44 }}>
          <Typography fontWeight="bold" sx={{ fontSize: '0.9rem' }}>点滴説明書</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>{user?.displayName}</Typography>
          <Button color="inherit" size="small" onClick={logout} sx={{ fontSize: '0.72rem' }}>ログアウト</Button>
        </Toolbar>
      </AppBar>

      {/* 画面レイアウト */}
      <Box className="no-print" sx={{ display: 'flex', height: 'calc(100vh - 44px)' }}>

        {/* 左パネル：日付選択 + 患者リスト */}
        <Box sx={{
          width: 230, flexShrink: 0, bgcolor: '#f5f5f5',
          borderRight: '1px solid #ddd',
          display: 'flex', flexDirection: 'column', p: 1.5, gap: 1.5, overflow: 'hidden',
        }}>

          {/* 日付入力 + 取り込みボタン */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <TextField
              type="date"
              size="small"
              label="日付"
              value={date}
              onChange={e => setDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              inputProps={{ max: '2099-12-31' }}
              fullWidth
            />
            <Button
              variant="contained"
              size="small"
              startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <Download />}
              onClick={fetchOrders}
              disabled={loading}
              fullWidth
              sx={{ bgcolor: '#1a5276', '&:hover': { bgcolor: '#154360' }, fontSize: '0.8rem' }}
            >
              {loading ? '取り込み中...' : 'DWHから取り込み'}
            </Button>
          </Box>

          {error && (
            <Alert severity="error" sx={{ fontSize: '0.7rem', py: 0.25 }}>{error}</Alert>
          )}

          {/* 一括印刷ボタン */}
          {patients.length > 0 && (
            <>
              <Divider />
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#555' }}>
                    患者 {patients.length} 名
                  </Typography>
                  <Chip label={date} size="small" sx={{ fontSize: '0.62rem' }} />
                </Box>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<Print />}
                  onClick={handleBatchPrint}
                  fullWidth
                  color="success"
                  sx={{ fontSize: '0.8rem' }}
                >
                  全員まとめて印刷
                </Button>
              </Box>

              {/* 患者リスト */}
              <List dense disablePadding sx={{ overflow: 'auto', flexGrow: 1 }}>
                {patients.map(p => (
                  <ListItemButton
                    key={p.patientId}
                    selected={selected?.patientId === p.patientId}
                    onClick={() => setSelected(p)}
                    sx={{ borderRadius: 1, mb: 0.25, py: 0.4, px: 0.75 }}
                  >
                    <ListItemText
                      primary={p.patientName || p.patientId}
                      secondary={`${p.patientNo} · ${p.groups.length}bag · ${p.totalTime}`}
                      primaryTypographyProps={{ fontSize: '0.78rem', fontWeight: 'bold', noWrap: true }}
                      secondaryTypographyProps={{ fontSize: '0.62rem' }}
                    />
                  </ListItemButton>
                ))}
              </List>
            </>
          )}
        </Box>

        {/* 右パネル：プレビュー */}
        <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, bgcolor: '#e8e8e8' }}>
          {selected ? (
            <>
              <Box sx={{ mb: 1.5, display: 'flex', gap: 1, alignItems: 'center' }}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<PrintOutlined />}
                  onClick={handleSinglePrint}
                  sx={{ fontSize: '0.75rem' }}
                >
                  この患者のみ印刷
                </Button>
                <Typography sx={{ fontSize: '0.72rem', color: '#666' }}>
                  {selected.patientName} 様
                </Typography>
              </Box>
              <Paper elevation={3} sx={{ maxWidth: 900, mx: 'auto' }}>
                <ExplanationSheet ps={selected} />
              </Paper>
            </>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <Typography sx={{ color: '#aaa', fontSize: '0.9rem' }}>
                日付を選択して「DWHから取り込み」ボタンを押してください
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* 印刷専用エリア */}
      {printAll
        ? patients.map(p => (
            <Box key={p.patientId} className="print-sheet">
              <ExplanationSheet ps={p} />
            </Box>
          ))
        : selected && (
            <Box className="print-sheet">
              <ExplanationSheet ps={selected} />
            </Box>
          )
      }
    </>
  );
}
