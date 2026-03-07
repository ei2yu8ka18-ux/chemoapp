import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, AppBar, Toolbar, Button,
  Table, TableHead, TableRow, TableCell, TableBody,
  Paper, TextField, CircularProgress, Checkbox,
  IconButton,
} from '@mui/material';
import { Add, Delete, Print } from '@mui/icons-material';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

interface PhRow {
  sort_order: number; pharmacist_name: string;
  start_time: string; end_time: string;
  has_lunch: boolean; lunch_minutes: number;
}
interface DiaryManual {
  first_visit_counseling: number;
  allergy_stop: number; regimen_check: number; regimen_operation: number;
  oral_scheduled: number; oral_done: number; oral_cancelled: number; oral_changed: number;
  oral_patient_counseling: number; oral_first_visit: number;
  oral_doubt: number; oral_propose: number; oral_inquiry: number;
  notes: string;
}
interface AutoStats {
  inj_done: number; inj_cancelled: number; inj_changed: number; inj_total: number;
  cancer_guidance_count: number; pre_consultation_count: number;
  doubt_count: number; propose_count: number; inquiry_count: number; presc_changed_count: number;
}
interface IntRecord {
  id: number; recorded_at: string; patient_no: string; patient_name: string;
  department: string; regimen_name: string; intervention_type: string; consultation_timing: string;
  intervention_category: string; intervention_content: string; pharmacist_name: string;
  prescription_changed: boolean; proxy_prescription: boolean; case_candidate: boolean;
  calc_cancer_guidance: boolean; calc_pre_consultation: boolean;
}

function calcWork(start: string, end: string, lunch: boolean, lunchMin: number): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const t = (eh * 60 + em) - (sh * 60 + sm);
  return t > 0 ? t - (lunch ? lunchMin : 0) : 0;
}
function fmtMin(m: number): string {
  return m > 0 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m` : '-';
}
function fmtTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

const EMPTY_MANUAL = (): DiaryManual => ({
  first_visit_counseling: 0, allergy_stop: 0,
  regimen_check: 0, regimen_operation: 0,
  oral_scheduled: 0, oral_done: 0, oral_cancelled: 0, oral_changed: 0,
  oral_patient_counseling: 0, oral_first_visit: 0,
  oral_doubt: 0, oral_propose: 0, oral_inquiry: 0, notes: '',
});
const EMPTY_PH = (): PhRow => ({
  sort_order: 0, pharmacist_name: '', start_time: '08:30', end_time: '17:30',
  has_lunch: true, lunch_minutes: 60,
});

const todayStr = new Date().toISOString().split('T')[0];

function NumCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <TextField size="small" type="number" value={value}
      onChange={e => onChange(Number(e.target.value) || 0)}
      inputProps={{ min: 0, style: { fontSize: '0.75rem', padding: '1px 3px', width: 38, textAlign: 'right' } }}
      sx={{ '& .MuiOutlinedInput-root': { height: 20 } }} />
  );
}

const TH = ({ children, w }: { children: React.ReactNode; w?: number }) => (
  <TableCell sx={{ border: '1px solid #bbb', bgcolor: '#ecf0f1', fontWeight: 'bold',
    fontSize: '0.68rem', p: '1px 4px', whiteSpace: 'nowrap', width: w }}>
    {children}
  </TableCell>
);
const TD = ({ children, center, bold }: { children?: React.ReactNode; center?: boolean; bold?: boolean }) => (
  <TableCell sx={{ border: '1px solid #ddd', fontSize: '0.75rem', p: '1px 4px',
    textAlign: center ? 'center' : 'left', fontWeight: bold ? 'bold' : 'normal' }}>
    {children}
  </TableCell>
);
const GH = ({ children, span, color }: { children: React.ReactNode; span?: number; color?: string }) => (
  <TableCell colSpan={span ?? 1} sx={{
    border: '1px solid #bbb', fontWeight: 'bold', fontSize: '0.65rem',
    p: '1px 4px', textAlign: 'center', whiteSpace: 'nowrap',
    bgcolor: color ?? '#ecf0f1',
  }}>
    {children}
  </TableCell>
);

// ─────────────────────────────────────────────────────────
export default function DiaryPage() {
  const [searchParams] = useSearchParams();
  const { user, logout } = useAuth();
  const [date, setDate]       = useState(searchParams.get('date') || todayStr);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [manual, setManual]   = useState<DiaryManual>(EMPTY_MANUAL());
  const [pharmacists, setPharmacists] = useState<PhRow[]>([EMPTY_PH()]);
  const [pharmacistNames, setPharmacistNames] = useState<string[]>([]);
  const [auto, setAuto]       = useState<AutoStats | null>(null);
  const [interventions, setInterventions] = useState<IntRecord[]>([]);

  useEffect(() => {
    api.get<string[]>('/users/pharmacists')
      .then(res => setPharmacistNames(res.data))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/workdiaries/${date}`);
      setAuto(data.auto);
      setInterventions(data.interventions || []);
      if (data.diary) {
        const d = data.diary;
        setManual({
          first_visit_counseling: d.first_visit_counseling,
          allergy_stop: d.allergy_stop, regimen_check: d.regimen_check, regimen_operation: d.regimen_operation,
          oral_scheduled: d.oral_scheduled, oral_done: d.oral_done, oral_cancelled: d.oral_cancelled,
          oral_changed: d.oral_changed, oral_patient_counseling: d.oral_patient_counseling,
          oral_first_visit: d.oral_first_visit, oral_doubt: d.oral_doubt,
          oral_propose: d.oral_propose, oral_inquiry: d.oral_inquiry, notes: d.notes || '',
        });
        setPharmacists(data.pharmacists?.length ? data.pharmacists : [EMPTY_PH()]);
      } else {
        setManual(EMPTY_MANUAL());
        setPharmacists(data.pharmacists?.length ? data.pharmacists : [EMPTY_PH()]);
      }
    } finally { setLoading(false); }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const setM = <K extends keyof DiaryManual>(k: K, v: DiaryManual[K]) =>
    setManual(m => ({ ...m, [k]: v }));
  const setPh = (i: number, k: keyof PhRow, v: any) =>
    setPharmacists(prev => prev.map((p, idx) => idx === i ? { ...p, [k]: v } : p));
  const addPh = () => setPharmacists(prev => [...prev, { ...EMPTY_PH(), sort_order: prev.length }]);
  const delPh = (i: number) => setPharmacists(prev => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/workdiaries/${date}`, { ...manual, pharmacists });
      alert('保存しました');
    } catch { alert('保存に失敗しました'); }
    finally { setSaving(false); }
  };

  // 集計値
  const injIntTotal  = auto ? auto.propose_count + auto.doubt_count + auto.inquiry_count : 0;
  const oralTotal    = manual.oral_propose + manual.oral_doubt + manual.oral_inquiry;
  const prescPct     = injIntTotal > 0
    ? `${Math.round((auto?.presc_changed_count || 0) / injIntTotal * 100)}%`
    : '0%';

  const dateObj  = new Date(date + 'T00:00:00');
  const dateDisp = `${dateObj.getFullYear()}年${dateObj.getMonth()+1}月${dateObj.getDate()}日（${WEEKDAYS[dateObj.getDay()]}）`;
  const phNames  = pharmacists.map(p => p.pharmacist_name).filter(Boolean).join('・');

  return (
    <>
      {/* 印刷CSS */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 6mm; }
          html, body { font-size: 7pt !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .diary-print-root {
            padding: 0 !important;
            max-width: 100% !important;
          }
          .print-grid {
            display: flex !important;
            flex-direction: column !important;
            gap: 2mm !important;
            padding: 0 !important;
            max-width: 100% !important;
          }
          .print-right-top {
            display: flex !important;
            flex-direction: row !important;
            gap: 2mm !important;
          }
          .print-right-top .MuiPaper-root { flex: 1 !important; min-width: 0 !important; }
          .MuiPaper-root {
            box-shadow: none !important;
            border: 1px solid #bbb !important;
            padding: 2mm !important;
          }
          table { border-collapse: collapse !important; }
          th, td {
            font-size: 7pt !important;
            padding: 1px 3px !important;
            line-height: 1.2 !important;
            text-align: center !important;
          }
          .MuiOutlinedInput-root {
            border: none !important;
            padding: 0 !important;
            height: auto !important;
            min-height: unset !important;
          }
          .MuiOutlinedInput-notchedOutline { display: none !important; }
          .MuiOutlinedInput-input, .MuiNativeSelect-select {
            padding: 0 !important;
            height: auto !important;
            font-size: 7pt !important;
            -webkit-text-fill-color: #000 !important;
            -webkit-appearance: none !important;
            appearance: none !important;
            background: transparent !important;
            border: none !important;
          }
          input[type="time"]::-webkit-calendar-picker-indicator { display: none !important; }
          input[type="number"]::-webkit-inner-spin-button,
          input[type="number"]::-webkit-outer-spin-button { display: none !important; }
          .MuiCheckbox-root { padding: 0 !important; transform: scale(0.7); }
          .MuiTypography-root { font-size: 7pt !important; }
        }
        @media screen {
          .print-only { display: none !important; }
        }
      `}</style>

      {/* ── ヘッダー（画面のみ） ── */}
      <AppBar position="static" className="no-print" sx={{ bgcolor: '#1a5276' }}>
        <Toolbar sx={{ gap: 1.5, minHeight: 44 }}>
          <Typography fontWeight="bold" sx={{ fontSize: '0.9rem' }}>業務日誌</Typography>
          <TextField type="date" size="small" value={date}
            onChange={e => setDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ bgcolor: '#fff', borderRadius: 1, width: 150 }}
            inputProps={{ style: { fontSize: '0.8rem', padding: '4px 8px' } }} />
          <Button variant="contained" size="small" onClick={save} disabled={saving}
            sx={{ bgcolor: '#27ae60', '&:hover': { bgcolor: '#1e8449' }, fontSize: '0.75rem' }}>
            {saving ? '保存中...' : '保存'}
          </Button>
          <Button variant="outlined" size="small" color="inherit"
            startIcon={<Print />} onClick={() => window.print()} sx={{ fontSize: '0.75rem' }}>
            印刷
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>{user?.displayName}</Typography>
          <Button color="inherit" size="small" onClick={logout} sx={{ fontSize: '0.72rem' }}>ログアウト</Button>
        </Toolbar>
      </AppBar>

      {/* 印刷用タイトル */}
      <Box className="print-only" sx={{ textAlign: 'center', mb: '3mm' }}>
        <Typography sx={{ fontSize: '13pt', fontWeight: 'bold' }}>
          外来化学療法センター 業務日誌
        </Typography>
        <Typography sx={{ fontSize: '10pt' }}>
          {dateDisp} &nbsp;&nbsp; 担当：{phNames}
        </Typography>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box className="print-grid" sx={{ p: 1.5, maxWidth: 960 }}>

          {/* ── 左上：薬剤師勤務時間 ── */}
          <Paper elevation={1} className="print-left-top" sx={{ p: 1, mb: { xs: 1.5, sm: 0 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 'bold' }}>■ 薬剤師勤務時間</Typography>
              <Button size="small" startIcon={<Add />} onClick={addPh}
                className="no-print"
                sx={{ fontSize: '0.68rem', py: 0, minWidth: 0 }}>追加</Button>
            </Box>
            <Table size="small" sx={{ borderCollapse: 'collapse' }}>
              <TableHead>
                <TableRow>
                  <TH w={64}>氏名</TH><TH w={104}>開始</TH><TH w={104}>終了</TH><TH w={28}>昼</TH><TH w={44}>昼休(分)</TH><TH w={44}>実働</TH>
                  <TableCell className="no-print" sx={{ p: 0, border: 0, width: 28 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {pharmacists.map((ph, i) => {
                  const wm = calcWork(ph.start_time, ph.end_time, ph.has_lunch, ph.lunch_minutes);
                  return (
                    <TableRow key={i}>
                      <TD>
                        <TextField select size="small" value={ph.pharmacist_name}
                          onChange={e => setPh(i, 'pharmacist_name', e.target.value)}
                          SelectProps={{ native: true }}
                          sx={{ minWidth: 60, width: '100%', '& .MuiOutlinedInput-root': { height: 24 } }}
                          inputProps={{ style: { fontSize: '0.78rem', padding: '1px 2px' } }}>
                          <option value=""></option>
                          {pharmacistNames.map(n => <option key={n} value={n}>{n}</option>)}
                        </TextField>
                      </TD>
                      <TD center>
                        <TextField type="time" size="small" value={ph.start_time}
                          onChange={e => setPh(i, 'start_time', e.target.value)}
                          inputProps={{ style: { fontSize: '0.78rem', padding: '1px 4px', width: 90 } }}
                          sx={{ '& .MuiOutlinedInput-root': { height: 24 } }} />
                      </TD>
                      <TD center>
                        <TextField type="time" size="small" value={ph.end_time}
                          onChange={e => setPh(i, 'end_time', e.target.value)}
                          inputProps={{ style: { fontSize: '0.78rem', padding: '1px 4px', width: 90 } }}
                          sx={{ '& .MuiOutlinedInput-root': { height: 24 } }} />
                      </TD>
                      <TD center>
                        <Checkbox size="small" checked={ph.has_lunch}
                          onChange={e => setPh(i, 'has_lunch', e.target.checked)} sx={{ p: 0 }} />
                      </TD>
                      <TD>
                        <TextField type="number" size="small" value={ph.lunch_minutes}
                          onChange={e => setPh(i, 'lunch_minutes', Number(e.target.value) || 0)}
                          inputProps={{ min: 0, style: { fontSize: '0.78rem', padding: '1px 4px', width: 36 } }}
                          sx={{ '& .MuiOutlinedInput-root': { height: 24 } }} />
                      </TD>
                      <TD bold>{fmtMin(wm)}</TD>
                      <TableCell className="no-print" sx={{ p: 0, border: 0 }}>
                        <IconButton size="small" onClick={() => delPh(i)} sx={{ p: 0.25 }}>
                          <Delete fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

          </Paper>

          {/* ── 右上：点滴＋内服（横並び） ── */}
          <Box className="print-right-top" sx={{ mb: { xs: 1.5, sm: 0 } }}>

          {/* 外来化学療法センター（点滴） */}
          <Paper elevation={1} sx={{ p: 0.75, mb: { xs: 1.5, sm: 0 } }}>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 'bold', mb: 0.25 }}>
              ■ 外来化学療法センター（点滴）
            </Typography>

            {/* 実施内容 + 介入内容 横並び */}
            <Box sx={{ display: 'flex', gap: 0.75, mb: 0.25, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <Table size="small" sx={{ borderCollapse: 'collapse', width: 'auto' }}>
                <TableHead>
                  <TableRow><GH span={4} color="#d5e8d4">実施内容</GH></TableRow>
                  <TableRow>{['予定','実施','中止','変更'].map(h => <TH key={h}>{h}</TH>)}</TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    {[auto?.inj_total, auto?.inj_done, auto?.inj_cancelled, auto?.inj_changed].map((v, i) => (
                      <TD key={i} center bold>{v ?? 0}</TD>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>

              <Table size="small" sx={{ borderCollapse: 'collapse', width: 'auto' }}>
                <TableHead>
                  <TableRow><GH span={5} color="#dae8fc">介入内容</GH></TableRow>
                  <TableRow>{['提案','疑義','問合','介入計','処変'].map(h => <TH key={h}>{h}</TH>)}</TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TD center>{auto?.propose_count ?? 0}</TD>
                    <TD center>{auto?.doubt_count ?? 0}</TD>
                    <TD center>{auto?.inquiry_count ?? 0}</TD>
                    <TD center bold>{injIntTotal}</TD>
                    <TD center>
                      {auto?.presc_changed_count ?? 0}
                      <Typography component="span" sx={{ fontSize: '0.6rem', color: '#777', ml: 0.25 }}>
                        ({prescPct})
                      </Typography>
                    </TD>
                  </TableRow>
                </TableBody>
              </Table>
            </Box>

            {/* 算定 + 手動入力 横並び */}
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
              <Table size="small" sx={{ borderCollapse: 'collapse', width: 'auto' }}>
                <TableHead>
                  <TableRow><GH span={2} color="#f8cecc">算定</GH></TableRow>
                  <TableRow><TH>がん指導ハ</TH><TH>診察前</TH></TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TD center bold>{auto?.cancer_guidance_count ?? 0}</TD>
                    <TD center bold>{auto?.pre_consultation_count ?? 0}</TD>
                  </TableRow>
                </TableBody>
              </Table>

              {([
                ['初回指導', 'first_visit_counseling'],
                ['アレ中止', 'allergy_stop'],
                ['レジチェック', 'regimen_check'],
                ['レジメン操作', 'regimen_operation'],
              ] as [string, keyof DiaryManual][]).map(([lbl, key]) => (
                <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                  <Typography sx={{ fontSize: '0.68rem', whiteSpace: 'nowrap' }}>{lbl}：</Typography>
                  <NumCell value={manual[key] as number} onChange={v => setM(key, v)} />
                </Box>
              ))}
            </Box>
          </Paper>

          {/* 外来化学療法センター（内服） */}
          <Paper elevation={1} sx={{ p: 0.75 }}>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 'bold', mb: 0.25 }}>
              ■ 外来化学療法センター（内服）
            </Typography>

            {/* 実施内容 + 介入内容 横並び */}
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <Table size="small" sx={{ borderCollapse: 'collapse', width: 'auto' }}>
                <TableHead>
                  <TableRow><GH span={6} color="#d5e8d4">実施内容</GH></TableRow>
                  <TableRow>{['予定','実施','中止','変更','患者指導','初回指導'].map(h => <TH key={h}>{h}</TH>)}</TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    {(['oral_scheduled','oral_done','oral_cancelled','oral_changed',
                      'oral_patient_counseling','oral_first_visit',
                    ] as (keyof DiaryManual)[]).map(k => (
                      <TableCell key={k} sx={{ border: '1px solid #ddd', p: '1px 3px' }}>
                        <NumCell value={manual[k] as number} onChange={v => setM(k, v)} />
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>

              <Table size="small" sx={{ borderCollapse: 'collapse', width: 'auto' }}>
                <TableHead>
                  <TableRow><GH span={4} color="#dae8fc">介入内容</GH></TableRow>
                  <TableRow>{['提案','疑義','問合','介入計'].map(h => <TH key={h}>{h}</TH>)}</TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    {(['oral_propose','oral_doubt','oral_inquiry'] as (keyof DiaryManual)[]).map(k => (
                      <TableCell key={k} sx={{ border: '1px solid #ddd', p: '1px 3px' }}>
                        <NumCell value={manual[k] as number} onChange={v => setM(k, v)} />
                      </TableCell>
                    ))}
                    <TD center bold>{oralTotal}</TD>
                  </TableRow>
                </TableBody>
              </Table>
            </Box>
          </Paper>

          </Box>{/* end print-right-top */}

          {/* ── 下段：介入記録一覧 ── */}
          <Paper elevation={1} className="print-bottom" sx={{ p: 1 }}>
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 'bold', mb: 0.5 }}>
              ■ 当日介入記録（{interventions.length}件）
            </Typography>
            {interventions.length === 0 ? (
              <Typography sx={{ fontSize: '0.78rem', color: '#888', py: 1 }}>介入記録なし</Typography>
            ) : (
              <Table size="small" sx={{ borderCollapse: 'collapse' }}>
                <TableHead>
                  <TableRow>
                    {['介入種別','前/後','患者番号','患者氏名','レジメン','分類','介入内容','結果','薬剤師'].map(h => (
                      <TH key={h}>{h}</TH>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {interventions.map(r => (
                    <TableRow key={r.id}>
                      <TD>{r.intervention_type}</TD>
                      <TD center>{r.consultation_timing}</TD>
                      <TD>{r.patient_no}</TD>
                      <TD bold>{r.patient_name}</TD>
                      <TD>{r.regimen_name}</TD>
                      <TD>{r.intervention_category}</TD>
                      <TableCell sx={{ border: '1px solid #ddd', fontSize: '0.72rem', p: '2px 4px',
                        maxWidth: 220, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {r.intervention_content}
                      </TableCell>
                      <TableCell sx={{ border: '1px solid #ddd', fontSize: '0.65rem', p: '2px 4px' }}>
                        {r.calc_cancer_guidance  ? 'がん指導 ' : ''}
                        {r.calc_pre_consultation ? '診察前 '  : ''}
                        {r.prescription_changed  ? '処方変更 ' : ''}
                        {r.proxy_prescription    ? '代行処方 ' : ''}
                        {r.case_candidate        ? '症例候補'  : ''}
                      </TableCell>
                      <TD>{r.pharmacist_name}</TD>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>

          {/* ── 特記事項（最下段） ── */}
          <Paper elevation={1} className="print-notes" sx={{ p: 1, mt: { xs: 1.5, sm: 1 } }}>
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 'bold', mb: 0.5 }}>■ 特記事項</Typography>
            <TextField fullWidth multiline rows={3} value={manual.notes}
              onChange={e => setM('notes', e.target.value)}
              size="small" placeholder="特記事項・申し送り"
              inputProps={{ style: { fontSize: '0.8rem' } }} />
          </Paper>

        </Box>
      )}
    </>
  );
}
