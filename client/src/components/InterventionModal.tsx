import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, TextField,
  FormControl, FormLabel, RadioGroup, FormControlLabel, Radio,
  Checkbox, List, ListItemButton, ListItemText,
  Divider, Grid, FormGroup,
} from '@mui/material';
import { Treatment, Intervention } from '../types/treatment';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

// ── 介入分類 → 介入詳細マスタ（VBAに準拠）────────────────────
const DETAIL_MAP: Record<string, string[]> = {
  'オピオイド': [
    'オピオイド導入', 'オピオイド用量調節', 'オピオイド副作用対策', 'オピオイド導入延期',
  ],
  '検査提案': [
    'HBVスクリーニング', '亜鉛', '血糖', '甲状腺機能', '心エコー', '電解質', '尿検査', '他',
  ],
  '抗がん剤用量調節': [
    '腎機能', '肝機能', '腎・肝機能', '体重', '副作用', 'オーダー複写ミス', '骨髄抑制',
  ],
  '他科受診提案': [
    'irAE関連', '内分泌系', '循環器系', '消化器系', '皮膚科系', '呼吸器系', '神経系',
    '膠原病関連', '眼科系', '口腔外科系', '泌尿器科系', '整形外科系', '乳腺系', '婦人科系', '耳鼻咽喉科系',
  ],
  '実施指示確認': ['継続', '中止'],
  '注射薬不備': [
    'アブラキサン生食量', 'インフューザーポンプ生食量', 'ゾレドロン酸', '抗コリン症状対策',
    'VB12製剤', 'ポート前後フラッシュ', 'ポラーミン', 'ランマーク', '削除忘れ', '他',
  ],
  '内服薬不備': [
    'DEX処方漏れ', 'APR処方漏れ', 'ARP・DEX処方漏れ', '残薬調整',
    '定期内服処方漏れ', '内服抗がん剤処方漏れ', '前投薬処方漏れ',
  ],
  '登録レジメン不一致': [
    'レジメン名相違', '用量相違', '投与経路相違', '投与日数相違', '他',
  ],
  '副作用対策': [
    'irAE対策', 'アレルギー', '嘔気嘔吐', '肝障害', '関節痛', '血管痛', '下痢', '倦怠感',
    '高血圧', '高血糖', '口内炎', '骨髄抑制', 'こむら返り', 'コリン作動性症状', '視覚異常',
    '脂質異常', '食欲不振', '心障害', '腎障害', '体重増減', '蛋白尿', '電解質異常', '涙流',
    '肺障害', '発熱', '皮膚障害', '浮腫', '便秘', '末梢神経障害', '味覚異常', '他',
  ],
  'その他': ['その他'],
};

const INTERVENTION_CATEGORIES = Object.keys(DETAIL_MAP);

// ──────────────────────────────────────────────────────────────
function generateRecordId(patientNo: string): string {
  const n = new Date();
  const date = `${n.getFullYear()}${String(n.getMonth()+1).padStart(2,'0')}${String(n.getDate()).padStart(2,'0')}`;
  const time = `${String(n.getHours()).padStart(2,'0')}${String(n.getMinutes()).padStart(2,'0')}${String(n.getSeconds()).padStart(2,'0')}`;
  return `${date}${time}-${patientNo}`;
}

function todayLabel(): string {
  const n = new Date();
  return `${n.getFullYear()}/${String(n.getMonth()+1).padStart(2,'0')}/${String(n.getDate()).padStart(2,'0')}`;
}

const EMPTY_FORM = (): Omit<Intervention, 'treatment_id'> => ({
  intervention_type: '',
  consultation_timing: '',
  calc_cancer_guidance: false,
  calc_pre_consultation: false,
  intervention_category: '',
  intervention_detail: '',
  intervention_content: '',
  pharmacist_name: '',
  memo: '',
  prescription_changed: false,
  proxy_prescription: false,
  case_candidate: false,
  drug_route: '注射',
});

interface Props {
  open: boolean;
  treatment: Treatment | null;
  onClose: () => void;
  onSaved?: () => void;
}

const listBoxSx = {
  border: '1px solid #bdbdbd', borderRadius: 1,
  height: 380, overflowY: 'auto' as const, p: 0, bgcolor: '#fff',
};
const itemSx = {
  py: 0.25, px: 1,
  '&.Mui-selected': { bgcolor: '#1976d2 !important', color: '#fff' },
  '&.Mui-selected:hover': { bgcolor: '#1565c0 !important' },
};

const infoBox = (label: string, value: string, wide = false) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
    <Typography sx={{ fontSize: '0.75rem', fontWeight: 'bold', minWidth: wide ? 60 : 48, color: '#444' }}>
      {label}
    </Typography>
    <Typography sx={{
      fontSize: '0.75rem', bgcolor: '#fff', border: '1px solid #ccc',
      px: 0.75, py: 0.1, minWidth: wide ? 140 : 90, borderRadius: 0.5,
    }}>
      {value || '　'}
    </Typography>
  </Box>
);

// ──────────────────────────────────────────────────────────────
export default function InterventionModal({ open, treatment, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const [form, setForm]         = useState(EMPTY_FORM);
  const [recordId, setRecordId] = useState('');
  const [saving, setSaving]     = useState(false);
  // 薬剤師リスト（APIから取得）
  const [pharmacists, setPharmacists] = useState<string[]>([]);

  useEffect(() => {
    api.get<string[]>('/users/pharmacists')
      .then(res => setPharmacists(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open && treatment) {
      setForm({ ...EMPTY_FORM(), pharmacist_name: user?.displayName || '' });
      setRecordId(generateRecordId(treatment.patient_no));
    }
  }, [open, treatment, user?.displayName]);

  if (!treatment) return null;

  const handleCategorySelect = (cat: string) => {
    setForm(f => ({ ...f, intervention_category: cat, intervention_detail: '' }));
  };

  const currentDetails = DETAIL_MAP[form.intervention_category] || [];

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post('/interventions', {
        treatment_id: treatment.id,
        record_id: recordId,
        ...form,
      });
      onSaved?.();
      onClose();
    } catch (err) {
      console.error('介入記録保存エラー:', err);
    } finally {
      setSaving(false);
    }
  };

  const set = <K extends keyof ReturnType<typeof EMPTY_FORM>>(
    key: K, value: ReturnType<typeof EMPTY_FORM>[K]
  ) => setForm(f => ({ ...f, [key]: value }));

  return (
    <Dialog open={open} onClose={onClose} maxWidth={false} fullWidth
      PaperProps={{ sx: {
        width: '85vw', maxWidth: '85vw',
        maxHeight: '92vh',
        bgcolor: '#f5f5f5',
      } }}>

      {/* タイトルバー */}
      <DialogTitle sx={{ py: 0.75, px: 2, bgcolor: '#dce8f5', borderBottom: '1px solid #aaa' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography fontWeight="bold" sx={{ fontSize: '0.95rem' }}>
            外来化学療法センター疑義照会・提案入力
          </Typography>
          <Typography sx={{ fontSize: '0.85rem' }}>日付　{todayLabel()}</Typography>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 1.25 }}>

        {/* 患者情報 - コンパクトに1行 */}
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 0.75, alignItems: 'center' }}>
          {infoBox('患者ID', treatment.patient_no)}
          {infoBox('患者氏名', treatment.patient_name, true)}
          {infoBox('診療科', treatment.department)}
          {infoBox('医師', treatment.doctor)}
          {infoBox('疾患名', treatment.diagnosis, true)}
          {infoBox('レジメン', treatment.regimen_name, true)}
        </Box>

        <Divider sx={{ mb: 0.75 }} />

        {/* 注射/内服 + 介入種別 + 前後 + 算定 - 1行にまとめる */}
        <Box sx={{ display: 'flex', gap: 2, mb: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* 注射/内服ラジオ（介入種別の左） */}
          <FormControl size="small">
            <FormLabel sx={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#333' }}>注射/内服</FormLabel>
            <RadioGroup row value={form.drug_route}
              onChange={e => set('drug_route', e.target.value as '注射' | '内服')}>
              {(['注射', '内服'] as const).map(v => (
                <FormControlLabel key={v} value={v}
                  control={<Radio size="small" sx={{ py: 0.1 }} />}
                  label={<Typography sx={{ fontSize: '0.75rem' }}>{v}</Typography>} />
              ))}
            </RadioGroup>
          </FormControl>
          <FormControl size="small">
            <FormLabel sx={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#333' }}>介入種別</FormLabel>
            <RadioGroup row value={form.intervention_type}
              onChange={e => set('intervention_type', e.target.value as any)}>
              {(['提案', '疑義', '問い合わせ'] as const).map(v => (
                <FormControlLabel key={v} value={v}
                  control={<Radio size="small" sx={{ py: 0.1 }} />}
                  label={<Typography sx={{ fontSize: '0.75rem' }}>{v}</Typography>} />
              ))}
            </RadioGroup>
          </FormControl>

          <FormControl size="small">
            <FormLabel sx={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#333' }}>診察前・後</FormLabel>
            <RadioGroup row value={form.consultation_timing}
              onChange={e => set('consultation_timing', e.target.value as any)}>
              {(['前', '後'] as const).map(v => (
                <FormControlLabel key={v} value={v}
                  control={<Radio size="small" sx={{ py: 0.1 }} />}
                  label={<Typography sx={{ fontSize: '0.75rem' }}>{v}</Typography>} />
              ))}
            </RadioGroup>
          </FormControl>

          <Box>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#333', mb: 0.25 }}>算定</Typography>
            <FormGroup row>
              <FormControlLabel
                control={<Checkbox size="small" checked={form.calc_cancer_guidance}
                  onChange={e => set('calc_cancer_guidance', e.target.checked)} />}
                label={<Typography sx={{ fontSize: '0.75rem' }}>がん患者指導料ハ</Typography>} />
              <FormControlLabel
                control={<Checkbox size="small" checked={form.calc_pre_consultation}
                  onChange={e => set('calc_pre_consultation', e.target.checked)} />}
                label={<Typography sx={{ fontSize: '0.75rem' }}>がん薬物療法体制充実加算</Typography>} />
            </FormGroup>
          </Box>
        </Box>

        <Divider sx={{ mb: 0.75 }} />

        {/* メインエリア: 分類(2) 詳細(1.5) 内容(7) 薬剤師+チェック(1.5) = 12 */}
        <Grid container spacing={1}>

          {/* 介入分類 */}
          <Grid item xs={2}>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 'bold', mb: 0.25 }}>介入分類</Typography>
            <List sx={listBoxSx}>
              {INTERVENTION_CATEGORIES.map(cat => (
                <ListItemButton key={cat}
                  selected={form.intervention_category === cat}
                  onClick={() => handleCategorySelect(cat)} sx={itemSx}>
                  <ListItemText primary={cat}
                    primaryTypographyProps={{ fontSize: '0.72rem' }} />
                </ListItemButton>
              ))}
            </List>
          </Grid>

          {/* 介入詳細 */}
          <Grid item xs={2}>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 'bold', mb: 0.25 }}>介入詳細</Typography>
            <List sx={listBoxSx}>
              {currentDetails.length > 0 ? (
                currentDetails.map(det => (
                  <ListItemButton key={det}
                    selected={form.intervention_detail === det}
                    onClick={() => set('intervention_detail', det)} sx={itemSx}>
                    <ListItemText primary={det}
                      primaryTypographyProps={{ fontSize: '0.72rem' }} />
                  </ListItemButton>
                ))
              ) : (
                <Box sx={{ p: 1 }}>
                  <Typography sx={{ fontSize: '0.7rem', color: '#aaa' }}>分類を選択</Typography>
                </Box>
              )}
            </List>
          </Grid>

          {/* 介入内容（広め） */}
          <Grid item xs={7}>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 'bold', mb: 0.25 }}>
              介入内容（状況・提案結果）
            </Typography>
            <TextField multiline rows={9} fullWidth
              value={form.intervention_content}
              onChange={e => set('intervention_content', e.target.value)}
              size="small" sx={{ bgcolor: '#fff' }}
              inputProps={{ style: { fontSize: '0.82rem' } }} />
          </Grid>

          {/* 薬剤師 */}
          <Grid item xs={1} sx={{ minWidth: 72 }}>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 'bold', mb: 0.25 }}>薬剤師</Typography>
            <List sx={{ ...listBoxSx, height: 380 }}>
              {pharmacists.map(ph => (
                <ListItemButton key={ph}
                  selected={form.pharmacist_name === ph}
                  onClick={() => set('pharmacist_name', ph)} sx={itemSx}>
                  <ListItemText primary={ph}
                    primaryTypographyProps={{ fontSize: '0.72rem' }} />
                </ListItemButton>
              ))}
            </List>
          </Grid>
        </Grid>

      </DialogContent>

      <DialogActions sx={{ px: 2, py: 0.75, borderTop: '1px solid #ccc', flexDirection: 'column', alignItems: 'stretch', gap: 0.5 }}>
        {/* チェックボックス行 */}
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
          <FormControlLabel
            control={<Checkbox size="small" checked={form.prescription_changed}
              onChange={e => set('prescription_changed', e.target.checked)} sx={{ py: 0.1 }} />}
            label={<Typography sx={{ fontSize: '0.72rem' }}>処方変更あり</Typography>} />
          <FormControlLabel
            control={<Checkbox size="small" checked={form.proxy_prescription}
              onChange={e => set('proxy_prescription', e.target.checked)} sx={{ py: 0.1 }} />}
            label={<Typography sx={{ fontSize: '0.72rem' }}>代行処方</Typography>} />
          <FormControlLabel
            control={<Checkbox size="small" checked={form.case_candidate}
              onChange={e => set('case_candidate', e.target.checked)} sx={{ py: 0.1 }} />}
            label={<Typography sx={{ fontSize: '0.72rem' }}>症例候補</Typography>} />
        </Box>
        {/* 記録ID＋ボタン行 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontSize: '0.65rem', color: '#555', mr: 'auto', wordBreak: 'break-all' }}>
            記録ID: {recordId}
          </Typography>
          <Button onClick={onClose} variant="outlined" size="small">とじる</Button>
          <Button onClick={handleSave} variant="contained" size="small" disabled={saving}>
            {saving ? '保存中...' : '記録'}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
