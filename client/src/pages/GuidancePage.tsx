import { useState, useRef, useCallback } from 'react';
import {
  Box, Typography, Button, AppBar, Toolbar, Paper,
  List, ListItemButton, ListItemText, Alert, Chip,
} from '@mui/material';
import { Upload, Print } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

// ─── 型定義 ───────────────────────────────────────────────
interface DrugGroup {
  index:    number;
  image:    string | null;
  duration: string;
  names:    string[];
  takeHome: boolean;
  isEqual:  boolean;  // ＝（同時開始）表示
}

interface PatientSheet {
  patientId:   string;
  patientName: string;
  orderDate:   string;
  totalTime:   string;
  groups:      DrugGroup[];
}

// ─── VBAロジック移植 ──────────────────────────────────────

// 補正注入時間数値（薬剤コード→デフォルト分）
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

// 整形薬剤名
function normName(raw: string): string {
  let s = raw
    .replace(/５/g, '5')
    .replace(/[〈<（][ＨH][Ｒ R][〉>）]/g, '')
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

// 注入時間文字列→分
function parseMins(raw: string, code: string): number {
  const t = raw.trim();
  if (!t) return DRUG_DEFAULTS[code] ?? 10;
  const hm = t.match(/(\d+)時間\s*(\d*)分?/);
  if (hm) return parseInt(hm[1]) * 60 + (hm[2] ? parseInt(hm[2]) : 0);
  const mn = t.match(/(\d+)分/);
  if (mn) return parseInt(mn[1]);
  return 10;
}

// 分→表示（5分丸め）
function fmtDur(min: number): string {
  if (min <= 0) return '';
  const r = Math.min(240, Math.round(min / 5) * 5);
  if (r % 60 === 0) return `${r / 60}時間`;
  if (r > 60) return `${Math.floor(r / 60)}時間${r % 60}分`;
  return `${r}分`;
}

// 総時間表示
function fmtTotal(min: number): string {
  if (min <= 0) return '0分';
  const h = Math.floor(min / 60), m = min % 60;
  if (h && m) return `${h}時間${m}分`;
  return h ? `${h}時間` : `${m}分`;
}

// 薬剤名から容量(mL)を抽出
function extractVol(name: string): number | null {
  const m = name.match(/(\d+)\s*[mｍ][lＬ]/i);
  return m ? parseInt(m[1]) : null;
}

// 薬剤コード・薬剤名→画像ファイル名
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

// ─── CSV列インデックス（Excelのorderシートと同一） ─────────
// A=0, B=1, H=7, M=12, O=14, Q=16, R=17, Y=24, Z=25, AD=29
const C = {
  PID:   0,  // A: 患者ID
  ONO:   1,  // B: オーダー番号（グループ）
  DATE:  7,  // H: オーダー日付
  PNAME: 12, // M: 患者氏名
  CODES: 14, // O: 薬剤コード（SC判定用）
  CODE:  16, // Q: 薬剤コード（画像・vesicant判定）
  NAME:  17, // R: 薬剤名
  NOTE1: 24, // Y: 注入備考1
  NOTE2: 25, // Z: 注入備考2
  TIME:  29, // AD: 注入時間
};

// 引用符込みCSV1行パース
function parseLine(line: string): string[] {
  const cols: string[] = [];
  let inQ = false, cur = '';
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { cols.push(cur); cur = ''; }
    else { cur += ch; }
  }
  cols.push(cur);
  return cols;
}

// CSV全体→PatientSheet[]
function parseOrderCsv(text: string): PatientSheet[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const rows = lines.slice(1).map(parseLine); // ヘッダー行をスキップ

  // Map<患者ID, Map<オーダー番号, 行[]>>
  const pat = new Map<string, Map<string, string[][]>>();
  for (const r of rows) {
    const pid = (r[C.PID] ?? '').trim();
    if (!pid) continue;
    const ono = (r[C.ONO] ?? '').trim();
    if (!pat.has(pid)) pat.set(pid, new Map());
    const om = pat.get(pid)!;
    if (!om.has(ono)) om.set(ono, []);
    om.get(ono)!.push(r);
  }

  const result: PatientSheet[] = [];

  for (const [pid, orderMap] of pat) {
    const firstRow = [...orderMap.values()][0][0];
    const patientName = (firstRow[C.PNAME] ?? '').trim();
    const rawDate     = (firstRow[C.DATE]  ?? '').trim();
    const orderDate   = rawDate.match(/^\d{8}$/)
      ? `${rawDate.slice(0,4)}/${rawDate.slice(4,6)}/${rawDate.slice(6,8)}`
      : rawDate;

    const groups: DrugGroup[] = [];
    let totalMin = 0;
    let gi = 0;

    for (const [, oRows] of orderMap) {
      if (gi >= 12) break;

      const allNotes = oRows
        .map(r => `${r[C.NOTE1] ?? ''} ${r[C.NOTE2] ?? ''}`)
        .join(' ');

      // 持ち帰り（インフュージョンポンプ）
      const takeHome = allNotes.includes('ｲﾝﾌｭｰｻﾞｰにて約46時間');

      // レボホリナートスキップ（FOLFIRI等）
      const simStart = /イリノテカンと同時に開始|エルプラットと同時に開始/.test(allNotes);
      const hasLevo  = oRows.some(r => /レボホリナート/.test(r[C.NAME] ?? ''));
      const skipLevo = simStart && hasLevo;

      // グループ最大注入時間
      let groupMax = 0;
      for (const r of oRows) {
        if (skipLevo && /レボホリナート/.test(r[C.NAME] ?? '')) continue;
        const m = parseMins(r[C.TIME] ?? '', r[C.CODE] ?? '');
        if (m > groupMax) groupMax = m;
      }

      // 画像選択（グループ内で最初に一致した薬剤の画像）
      let img: string | null = takeHome ? 'pomp.png' : null;
      if (!img) {
        for (const r of oRows) {
          if (skipLevo && /レボホリナート/.test(r[C.NAME] ?? '')) continue;
          const found = selectImage(r[C.CODE] ?? '', r[C.NAME] ?? '');
          if (found) { img = found; break; }
        }
        if (!img) img = 'ns100.png'; // フォールバック
      }

      // 薬剤名一覧（重複除去・空文字除外）
      const nameSet = new Set<string>();
      for (const r of oRows) {
        if (skipLevo && /レボホリナート/.test(r[C.NAME] ?? '')) continue;
        const n = normName(r[C.NAME] ?? '');
        if (n) nameSet.add(n);
      }

      const duration = takeHome ? '持ち帰り' : fmtDur(groupMax);
      if (!takeHome) totalMin += groupMax;

      groups.push({
        index: gi, image: img, duration,
        names: [...nameSet], takeHome, isEqual: false,
      });
      gi++;
    }

    result.push({ patientId: pid, patientName, orderDate, totalTime: fmtTotal(totalMin), groups });
  }

  return result;
}

// ─── 説明書コンポーネント ────────────────────────────────
const LABELS = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫'];

function ExplanationSheet({ ps }: { ps: PatientSheet }) {
  return (
    <Box sx={{ p: '6mm', fontFamily: '"Noto Sans JP", "Yu Gothic", sans-serif', bgcolor: '#fff' }}>
      {/* タイトル */}
      <Typography sx={{
        textAlign: 'center', fontWeight: 'bold', fontSize: '1rem', mb: '2mm',
        borderBottom: '2px solid #1565c0', pb: '1mm',
      }}>
        京都桂病院　外来化学療法センターで治療を受ける方へ
      </Typography>

      {/* 患者情報行 */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: '3mm' }}>
        <Typography sx={{ fontWeight: 'bold', fontSize: '1.05rem' }}>
          {ps.patientName} 様
        </Typography>
        <Typography sx={{ fontWeight: 'bold', fontSize: '0.95rem', color: '#1565c0' }}>
          本日の予定時間：約{ps.totalTime}
        </Typography>
        <Typography sx={{ fontSize: '0.9rem' }}>{ps.orderDate}</Typography>
      </Box>

      {/* 薬剤タイムライン */}
      <Box sx={{
        display: 'flex', alignItems: 'flex-start',
        flexWrap: 'wrap', gap: 0, rowGap: '2mm', mb: '3mm',
        borderTop: '1px solid #ccc', borderBottom: '1px solid #ccc',
        py: '3mm',
      }}>
        {ps.groups.map((grp, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start' }}>
            {/* 矢印（2つ目以降） */}
            {i > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', height: 90, px: '2mm' }}>
                <Typography sx={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#333', lineHeight: 1 }}>
                  {grp.isEqual ? '＝' : '→'}
                </Typography>
              </Box>
            )}

            {/* バッグカード */}
            <Box sx={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              width: 82, flexShrink: 0,
            }}>
              {/* 番号ラベル */}
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#555' }}>
                {LABELS[grp.index] ?? ''}
              </Typography>

              {/* 画像エリア */}
              <Box sx={{
                width: 72, height: 76,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                my: '1mm',
              }}>
                {grp.image ? (
                  <img
                    src={`/images/drug-bags/${grp.image}`}
                    alt={grp.names[0] || '点滴'}
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                  />
                ) : (
                  <Box sx={{
                    width: 60, height: 70, border: '1px solid #aaa',
                    borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Typography sx={{ fontSize: '0.6rem', color: '#999' }}>袋</Typography>
                  </Box>
                )}
              </Box>

              {/* 時間 */}
              {grp.duration && (
                <Typography sx={{
                  fontSize: '0.72rem', fontWeight: 'bold',
                  color: grp.takeHome ? '#c62828' : '#1565c0',
                  textAlign: 'center',
                }}>
                  {grp.duration}
                </Typography>
              )}

              {/* 薬剤名 */}
              {grp.names.map((name, ni) => (
                <Typography key={ni} sx={{
                  fontSize: '0.62rem', textAlign: 'center',
                  lineHeight: 1.3, mt: '0.5mm', color: '#111',
                  wordBreak: 'break-all', width: '100%',
                }}>
                  {name}
                </Typography>
              ))}
            </Box>
          </Box>
        ))}

        {/* 終了ブロック */}
        {ps.groups.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', height: 90, px: '2mm' }}>
              <Typography sx={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#333' }}>→</Typography>
            </Box>
            <Box sx={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', width: 60, height: 90,
            }}>
              <Box sx={{
                border: '2px solid #333', borderRadius: 1,
                px: '3mm', py: '1mm',
              }}>
                <Typography sx={{ fontWeight: 'bold', fontSize: '0.9rem' }}>終了</Typography>
              </Box>
            </Box>
          </Box>
        )}
      </Box>

      {/* 注意事項 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '4mm', mt: '2mm' }}>
        <Typography sx={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#c62828', whiteSpace: 'nowrap' }}>
          点滴漏れ注意！
        </Typography>
        <Typography sx={{ fontSize: '0.8rem' }}>
          点滴中、痛みやはれを感じたらお知らせ下さい
        </Typography>
      </Box>

      {/* フッター */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: '2mm' }}>
        <Typography sx={{ fontSize: '0.8rem', color: '#555' }}>
          外来化学療法センター
        </Typography>
      </Box>
    </Box>
  );
}

// ─── メインページ ─────────────────────────────────────────
export default function GuidancePage() {
  const { user, logout } = useAuth();
  const [patients, setPatients]   = useState<PatientSheet[]>([]);
  const [selected, setSelected]   = useState<PatientSheet | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [fileName, setFileName]   = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    setError(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const buf = e.target?.result as ArrayBuffer;
      let text = '';
      // UTF-8 → Shift-JIS の順で試みる
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
      } catch {
        try {
          text = new TextDecoder('shift-jis').decode(buf);
        } catch {
          setError('文字コードの読み取りに失敗しました（UTF-8またはShift-JIS）');
          return;
        }
      }

      const result = parseOrderCsv(text);
      if (!result.length) {
        setError('患者データが見つかりません。CSVの列形式を確認してください（Order シート形式対応）');
        return;
      }
      setPatients(result);
      setSelected(result[0]);
    };
    reader.readAsArrayBuffer(file);
  }, []);

  return (
    <>
      {/* 印刷CSS */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 6mm; }
          .no-print { display: none !important; }
          .print-sheet { display: block !important; }
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
        {/* 左パネル：インポート＋患者リスト */}
        <Box sx={{
          width: 220, flexShrink: 0, bgcolor: '#f5f5f5',
          borderRight: '1px solid #ddd',
          display: 'flex', flexDirection: 'column', p: 1, gap: 1, overflow: 'hidden',
        }}>
          {/* ファイルアップロード */}
          <Paper
            elevation={0}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            sx={{
              border: '2px dashed #90caf9', borderRadius: 1, p: 1.5,
              textAlign: 'center', cursor: 'pointer',
              '&:hover': { borderColor: '#1976d2', bgcolor: '#e3f2fd' },
            }}
          >
            <Upload sx={{ color: '#1976d2', fontSize: 28, mb: 0.5 }} />
            <Typography sx={{ fontSize: '0.72rem', color: '#555' }}>
              CSVをドロップ<br />またはクリックして選択
            </Typography>
            {fileName && (
              <Chip
                label={fileName} size="small"
                sx={{ mt: 0.5, maxWidth: 190, fontSize: '0.62rem' }}
              />
            )}
            <input
              ref={fileRef} type="file" accept=".csv" hidden
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </Paper>

          {/* CSV形式の説明 */}
          <Typography sx={{ fontSize: '0.62rem', color: '#888', px: 0.5, lineHeight: 1.4 }}>
            OrderシートCSV形式<br />
            列A:患者ID・B:オーダー番号<br />
            H:日付・M:患者名・Q:薬剤コード<br />
            R:薬剤名・AD:注入時間
          </Typography>

          {error && (
            <Alert severity="error" sx={{ fontSize: '0.7rem', py: 0.25 }}>{error}</Alert>
          )}

          {/* 患者リスト */}
          {patients.length > 0 && (
            <>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#555', px: 0.5 }}>
                患者 {patients.length} 名
              </Typography>
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
                      secondary={`${p.groups.length}bag · ${p.totalTime}`}
                      primaryTypographyProps={{ fontSize: '0.78rem', fontWeight: 'bold', noWrap: true }}
                      secondaryTypographyProps={{ fontSize: '0.62rem' }}
                    />
                  </ListItemButton>
                ))}
              </List>
            </>
          )}
        </Box>

        {/* 右パネル：説明書プレビュー */}
        <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, bgcolor: '#e8e8e8' }}>
          {selected ? (
            <>
              <Box sx={{ mb: 1.5, display: 'flex', gap: 1, alignItems: 'center' }}>
                <Button
                  variant="contained" size="small" startIcon={<Print />}
                  onClick={() => window.print()}
                  sx={{ fontSize: '0.75rem' }}
                >
                  印刷（A4横）
                </Button>
                <Typography sx={{ fontSize: '0.72rem', color: '#666' }}>
                  ※ 選択中の患者の説明書のみ印刷されます
                </Typography>
              </Box>
              <Paper elevation={3} sx={{ maxWidth: 900, mx: 'auto' }}>
                <ExplanationSheet ps={selected} />
              </Paper>
            </>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <Typography sx={{ color: '#aaa', fontSize: '0.9rem' }}>
                CSVを読み込み、左のリストから患者を選択してください
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* 印刷専用：選択患者の説明書のみ出力 */}
      <Box className="print-sheet">
        {selected && <ExplanationSheet ps={selected} />}
      </Box>
    </>
  );
}
