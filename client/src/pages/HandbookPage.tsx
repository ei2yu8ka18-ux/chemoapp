import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Add, Delete, Print } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

interface HandbookTemplate {
  id: number;
  department: string;
  regimen_name: string;
  sheet_name: string | null;
  content_html: string;
  source_file: string | null;
  created_at: string;
  updated_at: string;
}

interface SymptomRow {
  id: string;
  symptom: string;
  description: string;
}

interface TemplateDraft {
  treatmentMenu: string;
  warningTop: string;
  warningBottom: string;
  signature: string;
  note: string;
  rows: SymptomRow[];
}

const DEFAULT_WARNING_TOP = '点滴後以下のような症状（副作用）が起こることがあります。';
const DEFAULT_WARNING_BOTTOM = 'つらい症状などは記録し、次回相談するようにしましょう。';
const DEFAULT_SIGNATURE = '京都桂病院外来化学療法室担当薬剤師';
const DEFAULT_NOTE = `★ポンプの薬(5-FU)が順調に減っているか？
　時々、目盛りを確認してください。
　ポンプの薬がなくなったら（約2日間）、　クレンメを閉じてください。`;

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function toFullWidthDisplay(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/ /g, '　')
    .replace(/[!-~]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0xfee0));
}

function normalizeCompare(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function htmlTextWithLineBreaks(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
}

function createRow(symptom = '', description = ''): SymptomRow {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    symptom,
    description,
  };
}

function extractRegimenBlockRows(allRows: HTMLTableRowElement[], regimenName: string): HTMLTableRowElement[] {
  if (!allRows.length) return allRows;

  const target = normalizeCompare(regimenName);
  let regimenRowIndex = -1;

  for (let i = 0; i < allRows.length; i += 1) {
    const text = normalizeText(allRows[i].textContent || '');
    const normalized = text.normalize('NFKC');
    if (!normalized.includes('治療メニュー')) continue;

    const hit = normalized.match(/治療メニュー\s*[:：]\s*(.+)$/);
    const rowRegimen = normalizeCompare(hit?.[1] ?? normalized);
    if (!rowRegimen) continue;

    if (rowRegimen.includes(target) || target.includes(rowRegimen)) {
      regimenRowIndex = i;
      break;
    }
  }

  if (regimenRowIndex < 0) return allRows;

  let startIndex = 0;
  for (let i = regimenRowIndex; i >= 0; i -= 1) {
    const normalized = normalizeText(allRows[i].textContent || '').normalize('NFKC');
    if (normalized.includes('外来化学療法実施中')) {
      startIndex = i;
      break;
    }
  }

  let endIndex = allRows.length;
  for (let i = regimenRowIndex + 1; i < allRows.length; i += 1) {
    const normalized = normalizeText(allRows[i].textContent || '').normalize('NFKC');
    if (normalized.includes('外来化学療法実施中')) {
      endIndex = i;
      break;
    }
  }

  return allRows.slice(startIndex, endIndex);
}

function parseTemplate(template: HandbookTemplate): TemplateDraft {
  const fallbackRows = [createRow('', '')];

  if (!template.content_html) {
    return {
      treatmentMenu: toFullWidthDisplay(template.regimen_name),
      warningTop: DEFAULT_WARNING_TOP,
      warningBottom: DEFAULT_WARNING_BOTTOM,
      signature: DEFAULT_SIGNATURE,
      note: DEFAULT_NOTE,
      rows: fallbackRows,
    };
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(template.content_html, 'text/html');
    const allRows = Array.from(doc.querySelectorAll('tr')) as HTMLTableRowElement[];
    const rows = extractRegimenBlockRows(allRows, template.regimen_name);

    let treatmentMenu = toFullWidthDisplay(template.regimen_name);
    let warningTop = DEFAULT_WARNING_TOP;
    let warningBottom = DEFAULT_WARNING_BOTTOM;
    let signature = DEFAULT_SIGNATURE;
    let note = DEFAULT_NOTE;
    const parsedRows: SymptomRow[] = [];
    const noteLines: string[] = [];

    for (const tr of rows) {
      const cells = Array.from(tr.querySelectorAll('td,th'));
      if (!cells.length) continue;

      const rowText = normalizeText(tr.textContent || '');
      const normalized = rowText.normalize('NFKC');

      if (normalized.includes('治療メニュー')) {
        const hit = normalized.match(/治療メニュー\s*[:：]\s*(.+)$/);
        if (hit?.[1]) treatmentMenu = toFullWidthDisplay(hit[1].trim());
        continue;
      }
      if (normalized.includes('点滴後以下のような症状')) {
        warningTop = DEFAULT_WARNING_TOP;
        continue;
      }
      if (normalized.includes('つらい症状') || normalized.includes('次回相談')) {
        warningBottom = DEFAULT_WARNING_BOTTOM;
        continue;
      }
      if (normalized.includes('京都桂病院外来化学療法室担当薬剤師')) {
        signature = DEFAULT_SIGNATURE;
        continue;
      }
      if (normalized.includes('クレンメを閉じてください') || normalized.startsWith('★')) {
        note = htmlTextWithLineBreaks(cells[0].innerHTML || rowText) || DEFAULT_NOTE;
        noteLines.push(...note.split('\n').map((line) => line.trim()).filter(Boolean));
        continue;
      }
      if (
        normalized.includes('外来化学療法実施中') ||
        normalized === '■副作用説明' ||
        normalized === '副作用説明'
      ) {
        continue;
      }

      if (cells.length < 2) continue;

      let symptom = '';
      let description = '';
      if (cells.length >= 3) {
        symptom = htmlTextWithLineBreaks(cells[1].innerHTML);
        description = htmlTextWithLineBreaks(cells[2].innerHTML);
      } else {
        symptom = htmlTextWithLineBreaks(cells[0].innerHTML);
        description = htmlTextWithLineBreaks(cells[1].innerHTML);
      }

      symptom = symptom.replace(/^□\s*/, '').trim();
      description = description.trim();

      if (!symptom && !description) continue;
      if (normalizeCompare(symptom) === normalizeCompare('副作用') && normalizeCompare(description) === normalizeCompare('説明')) {
        continue;
      }

      const merged = normalizeCompare(`${symptom} ${description}`);
      const isNoteLine =
        merged.includes(normalizeCompare('時々、目盛りを確認してください')) ||
        merged.includes(normalizeCompare('ポンプの薬がなくなったら')) ||
        merged.includes(normalizeCompare('約2日間')) ||
        merged.includes(normalizeCompare('クレンメを閉じてください'));
      if (isNoteLine) {
        const line = [symptom, description].filter(Boolean).join(' ').trim();
        if (line) noteLines.push(line);
        continue;
      }

      parsedRows.push(createRow(symptom, description));
    }

    if (noteLines.length) {
      const first = noteLines.some((line) => line.includes('★ポンプの薬')) ? '' : '★ポンプの薬(5-FU)が順調に減っているか？';
      note = [first, ...noteLines]
        .filter(Boolean)
        .join('\n')
        .replace(/\n{3,}/g, '\n\n');
    }

    return {
      treatmentMenu,
      warningTop,
      warningBottom,
      signature,
      note: normalizeNoteText(note),
      rows: parsedRows.length ? parsedRows : fallbackRows,
    };
  } catch {
    return {
      treatmentMenu: toFullWidthDisplay(template.regimen_name),
      warningTop: DEFAULT_WARNING_TOP,
      warningBottom: DEFAULT_WARNING_BOTTOM,
      signature: DEFAULT_SIGNATURE,
      note: normalizeNoteText(DEFAULT_NOTE),
      rows: fallbackRows,
    };
  }
}

function buildStandardHtml(draft: TemplateDraft): string {
  const rows = draft.rows.filter((r) => r.symptom.trim() || r.description.trim());
  const bodyRows = rows
    .map((row) => {
      const symptom = escapeHtml(row.symptom);
      const description = escapeHtml(row.description);
      return `
        <tr>
          <td class="mark-cell">□</td>
          <td class="cell-text">${symptom}</td>
          <td class="cell-text">${description}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <table class="handbook-standard">
      <colgroup>
        <col style="width: 6%;" />
        <col style="width: 47%;" />
        <col style="width: 47%;" />
      </colgroup>
      <tr class="title-row"><td colspan="3">外来化学療法実施中</td></tr>
      <tr class="regimen-row"><td colspan="3">治療メニュー：${escapeHtml(draft.treatmentMenu)}</td></tr>
      <tr class="alert-row"><td colspan="3">${escapeHtml(draft.warningTop)}</td></tr>
      <tr class="guide-row"><td colspan="3">${escapeHtml(draft.warningBottom)}</td></tr>
      <tr class="header-row">
        <th class="mark-cell">■</th>
        <th>副作用</th>
        <th>説明</th>
      </tr>
      ${bodyRows}
      <tr class="note-row"><td colspan="3" class="note-text">${escapeHtml(draft.note)}</td></tr>
      <tr class="spacer-row"><td colspan="3"></td></tr>
      <tr class="sign-row"><td colspan="3">${escapeHtml(draft.signature)}</td></tr>
    </table>
  `;
}

function normalizeNoteText(note: string): string {
  const normalized = note.normalize('NFKC');
  if (
    normalized.includes('ポンプの薬(5-FU)') ||
    (normalized.includes('ポンプの薬') && normalized.includes('クレンメを閉じてください'))
  ) {
    return DEFAULT_NOTE;
  }
  return note;
}

export default function HandbookPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [templates, setTemplates] = useState<HandbookTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [department, setDepartment] = useState('');
  const [regimen, setRegimen] = useState('');

  const [editMode, setEditMode] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editDepartment, setEditDepartment] = useState('');
  const [editRegimen, setEditRegimen] = useState('');
  const [editDraft, setEditDraft] = useState<TemplateDraft>({
    treatmentMenu: '',
    warningTop: DEFAULT_WARNING_TOP,
    warningBottom: DEFAULT_WARNING_BOTTOM,
    signature: DEFAULT_SIGNATURE,
    note: DEFAULT_NOTE,
    rows: [createRow('', '')],
  });

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<HandbookTemplate[]>('/handbook/templates');
      setTemplates(res.data);
    } catch (e) {
      console.error('load handbook templates error:', e);
      setError('お薬手帳マスタの取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const departments = useMemo(
    () => Array.from(new Set(templates.map((t) => t.department))).sort((a, b) => a.localeCompare(b)),
    [templates]
  );

  const regimens = useMemo(
    () =>
      templates
        .filter((t) => !department || t.department === department)
        .map((t) => t.regimen_name)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .sort((a, b) => a.localeCompare(b)),
    [templates, department]
  );

  useEffect(() => {
    if (!departments.length) {
      setDepartment('');
      return;
    }
    if (!department || !departments.includes(department)) {
      setDepartment(departments[0]);
    }
  }, [departments, department]);

  useEffect(() => {
    if (!regimens.length) {
      setRegimen('');
      return;
    }
    if (!regimen || !regimens.includes(regimen)) {
      setRegimen(regimens[0]);
    }
  }, [regimens, regimen]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.department === department && t.regimen_name === regimen) ?? null,
    [templates, department, regimen]
  );

  const renderedHtml = useMemo(() => {
    if (!selectedTemplate) return '';
    return buildStandardHtml(parseTemplate(selectedTemplate));
  }, [selectedTemplate]);

  const startNew = () => {
    setEditMode(true);
    setEditId(null);
    setEditDepartment(department || '');
    setEditRegimen('');
    setEditDraft({
      treatmentMenu: '',
      warningTop: DEFAULT_WARNING_TOP,
      warningBottom: DEFAULT_WARNING_BOTTOM,
      signature: DEFAULT_SIGNATURE,
      note: DEFAULT_NOTE,
      rows: [createRow('', '')],
    });
    setError('');
    setMessage('');
  };

  const startEdit = () => {
    if (!selectedTemplate) return;
    const parsed = parseTemplate(selectedTemplate);
    setEditMode(true);
    setEditId(selectedTemplate.id);
    setEditDepartment(selectedTemplate.department);
    setEditRegimen(toFullWidthDisplay(selectedTemplate.regimen_name));
    setEditDraft(parsed);
    setError('');
    setMessage('');
  };

  const cancelEdit = () => {
    setEditMode(false);
    setEditId(null);
  };

  const updateRow = (rowId: string, key: 'symptom' | 'description', value: string) => {
    setEditDraft((prev) => ({
      ...prev,
      rows: prev.rows.map((row) => (row.id === rowId ? { ...row, [key]: value } : row)),
    }));
  };

  const addRow = () => {
    setEditDraft((prev) => ({ ...prev, rows: [...prev.rows, createRow('', '')] }));
  };

  const removeRow = (rowId: string) => {
    setEditDraft((prev) => {
      const next = prev.rows.filter((row) => row.id !== rowId);
      return { ...prev, rows: next.length ? next : [createRow('', '')] };
    });
  };

  const handleSave = async () => {
    if (!isAdmin) return;

    const nextDepartment = editDepartment.trim();
    const nextRegimen = toFullWidthDisplay(editRegimen.trim());
    const nextTreatmentMenu = toFullWidthDisplay(editDraft.treatmentMenu.trim());

    if (!nextDepartment || !nextRegimen || !nextTreatmentMenu) {
      setError('診療科、レジメン名、治療メニューは必須です。');
      return;
    }

    const filledRows = editDraft.rows.filter((r) => r.symptom.trim() || r.description.trim());
    if (!filledRows.length) {
      setError('副作用と説明を1行以上入力してください。');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const contentHtml = buildStandardHtml({
        ...editDraft,
        treatmentMenu: nextTreatmentMenu,
        warningTop: DEFAULT_WARNING_TOP,
        warningBottom: DEFAULT_WARNING_BOTTOM,
        signature: DEFAULT_SIGNATURE,
        note: normalizeNoteText(editDraft.note.trim() || DEFAULT_NOTE),
        rows: filledRows,
      });

      const payload = {
        department: nextDepartment,
        regimen_name: nextRegimen,
        sheet_name: null,
        content_html: contentHtml,
        source_file: null,
      };

      if (editId) {
        await api.put(`/handbook/templates/${editId}`, payload);
      } else {
        await api.post('/handbook/templates', payload);
      }

      await loadTemplates();
      setDepartment(nextDepartment);
      setRegimen(nextRegimen);
      setEditMode(false);
      setEditId(null);
      setMessage('保存しました。');
    } catch (e) {
      console.error('save handbook template error:', e);
      setError('保存に失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isAdmin || !selectedTemplate) return;
    if (!window.confirm('選択中のマスタを削除します。よろしいですか？')) return;

    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api.delete(`/handbook/templates/${selectedTemplate.id}`);
      await loadTemplates();
      setMessage('削除しました。');
    } catch (e) {
      console.error('delete handbook template error:', e);
      setError('削除に失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => window.print();

  return (
    <>
      <style>{`
        .handbook-render {
          font-family: "Yu Gothic", "Meiryo", sans-serif;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        .handbook-render table.handbook-standard {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          border: 1px solid #111;
        }

        .handbook-render td,
        .handbook-render th {
          border: 1px solid #111;
          padding: 3px 4px;
          font-size: 0.9rem;
          line-height: 1.18;
          vertical-align: top;
          word-break: break-word;
        }

        .handbook-render .title-row td {
          background: #e3dd85;
          text-align: center;
          font-size: 1rem;
          font-weight: 700;
        }

        .handbook-render .regimen-row td {
          font-size: 0.98rem;
        }

        .handbook-render .alert-row td {
          color: #c60000;
          font-weight: 700;
          border: none !important;
          padding-top: 3px;
          padding-bottom: 1px;
        }

        .handbook-render .guide-row td {
          border: none !important;
          padding-top: 1px;
          padding-bottom: 3px;
        }

        .handbook-render .header-row th {
          font-weight: 700;
          text-align: center;
          background: #fafafa;
        }

        .handbook-render .mark-cell {
          text-align: center;
          padding: 2px 1px;
        }

        .handbook-render .cell-text,
        .handbook-render .note-text {
          white-space: pre-line;
        }

        .handbook-render .note-row td {
          background: #bfeaf0;
          white-space: pre-line;
        }

        .handbook-render .spacer-row td {
          height: 12px;
          padding: 0;
          border-left: 1px solid #111;
          border-right: 1px solid #111;
          border-top: none;
          border-bottom: none;
          background: #fff;
        }

        .handbook-render .sign-row td {
          text-align: center;
          text-decoration: underline;
          background: #fff;
        }

        @media print {
          @page {
            size: A6 portrait;
            margin: 4mm;
          }

          .no-print {
            display: none !important;
          }

          .handbook-paper {
            width: 97mm !important;
            max-width: 97mm !important;
            margin: 0 auto !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
          }

          .handbook-render td,
          .handbook-render th {
            font-size: 10px !important;
            padding: 2px 3px !important;
            line-height: 1.14 !important;
          }

          .handbook-render .title-row td {
            background: #e3dd85 !important;
            color: #111 !important;
            font-size: 12px !important;
          }

          .handbook-render .alert-row td {
            color: #c60000 !important;
          }

          .handbook-render .regimen-row td {
            font-size: 10.5px !important;
          }
        }
      `}</style>

      <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.2 }}>
        <Box className="no-print" sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography sx={{ fontWeight: 'bold', fontSize: '1rem' }}>お薬手帳発行</Typography>

          <FormControl size="small" sx={{ minWidth: 170 }}>
            <InputLabel>診療科</InputLabel>
            <Select
              value={department}
              label="診療科"
              onChange={(e) => setDepartment(String(e.target.value))}
              disabled={editMode || loading || departments.length === 0}
            >
              {departments.map((dep) => (
                <MenuItem key={dep} value={dep}>
                  {dep}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 260 }}>
            <InputLabel>レジメン名</InputLabel>
            <Select
              value={regimen}
              label="レジメン名"
              onChange={(e) => setRegimen(String(e.target.value))}
              disabled={editMode || loading || regimens.length === 0}
            >
              {regimens.map((item) => (
                <MenuItem key={item} value={item}>
                  {toFullWidthDisplay(item)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button variant="outlined" size="small" startIcon={<Print />} onClick={handlePrint} disabled={!selectedTemplate}>
            印刷
          </Button>

          {isAdmin && (
            <>
              <Button size="small" variant="outlined" onClick={startNew} disabled={editMode}>
                新規
              </Button>
              <Button size="small" variant="outlined" onClick={startEdit} disabled={editMode || !selectedTemplate}>
                編集
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="error"
                onClick={handleDelete}
                disabled={editMode || !selectedTemplate || saving}
              >
                削除
              </Button>
            </>
          )}
        </Box>

        {error && <Alert severity="error" className="no-print">{error}</Alert>}
        {message && <Alert severity="success" className="no-print">{message}</Alert>}

        {editMode ? (
          <Paper className="no-print" variant="outlined" sx={{ p: 1.2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography sx={{ fontWeight: 'bold', fontSize: '0.95rem' }}>
              {editId ? 'お薬手帳マスタ編集' : 'お薬手帳マスタ追加'}
            </Typography>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
              <TextField
                size="small"
                label="診療科"
                value={editDepartment}
                onChange={(e) => setEditDepartment(e.target.value)}
                fullWidth
              />
              <TextField
                size="small"
                label="レジメン名"
                value={editRegimen}
                onChange={(e) => setEditRegimen(toFullWidthDisplay(e.target.value))}
                fullWidth
              />
            </Stack>

            <TextField
              size="small"
              label="治療メニュー"
              value={editDraft.treatmentMenu}
              onChange={(e) =>
                setEditDraft((prev) => ({
                  ...prev,
                  treatmentMenu: toFullWidthDisplay(e.target.value),
                }))
              }
              fullWidth
            />

            <Box sx={{ border: '1px solid #ddd', borderRadius: 1, p: 1 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.8 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>副作用 / 説明</Typography>
                <Button size="small" startIcon={<Add />} onClick={addRow}>
                  行追加
                </Button>
              </Stack>

              <Stack spacing={0.7}>
                {editDraft.rows.map((row) => (
                  <Stack key={row.id} direction={{ xs: 'column', md: 'row' }} spacing={0.8} alignItems={{ md: 'center' }}>
                    <TextField
                      size="small"
                      label="副作用"
                      value={row.symptom}
                      onChange={(e) => updateRow(row.id, 'symptom', e.target.value)}
                      fullWidth
                    />
                    <TextField
                      size="small"
                      label="説明"
                      value={row.description}
                      onChange={(e) => updateRow(row.id, 'description', e.target.value)}
                      fullWidth
                    />
                    <IconButton size="small" color="error" onClick={() => removeRow(row.id)}>
                      <Delete fontSize="small" />
                    </IconButton>
                  </Stack>
                ))}
              </Stack>
            </Box>

            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button size="small" onClick={cancelEdit}>
                キャンセル
              </Button>
              <Button size="small" variant="contained" onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </Button>
            </Stack>
          </Paper>
        ) : (
          <>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress />
              </Box>
            ) : selectedTemplate ? (
              <Paper className="handbook-paper" variant="outlined" sx={{ p: 0.6, bgcolor: '#fff', maxWidth: 520, mx: 'auto' }}>
                <Typography className="no-print" sx={{ fontWeight: 'bold', mb: 0.8, fontSize: '0.95rem' }}>
                  {selectedTemplate.department} / {toFullWidthDisplay(selectedTemplate.regimen_name)}
                </Typography>
                <Box className="handbook-render" dangerouslySetInnerHTML={{ __html: renderedHtml }} />
              </Paper>
            ) : (
              <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', color: '#777' }}>
                表示対象がありません。
              </Paper>
            )}
          </>
        )}
      </Box>
    </>
  );
}
