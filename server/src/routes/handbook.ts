import fs from 'fs';
import { Router, Response } from 'express';
import * as XLSX from 'xlsx';
import { pool } from '../db/pool';
import { authenticateToken, AuthRequest } from '../middleware/auth';

interface HandbookTemplateRow {
  id: number;
  department: string;
  regimen_name: string;
  sheet_name: string | null;
  content_html: string;
  source_file: string | null;
  created_at: string;
  updated_at: string;
}

interface ParsedTable {
  tableAttrs: string;
  colgroupHtml: string;
  rows: string[];
}

interface ImportBlock {
  department: string;
  regimenName: string;
  sheetName: string;
  contentHtml: string;
}

const router = Router();
router.use(authenticateToken);

const DEFAULT_SOURCE_FILE = 'F:\\お薬手帳用副作用.xls';
const START_KEYWORD = '外来化学療法実施中';

function requireAdmin(req: AuthRequest, res: Response): boolean {
  if (req.userRole !== 'admin') {
    res.status(403).json({ error: 'admin only' });
    return false;
  }
  return true;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, num: string) => String.fromCharCode(parseInt(num, 10)));
}

function htmlToText(html: string): string {
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return decodeEntities(text);
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function parseSheetHtml(sheetHtml: string): ParsedTable | null {
  const tableMatch = sheetHtml.match(/<table([^>]*)>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return null;

  const tableAttrs = tableMatch[1] ? ` ${tableMatch[1].trim()}` : '';
  const tableInner = tableMatch[2] ?? '';
  const colgroupMatch = tableInner.match(/<colgroup[\s\S]*?<\/colgroup>/i);
  const colgroupHtml = colgroupMatch ? colgroupMatch[0] : '';
  const rows = tableInner.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];

  if (!rows.length) return null;
  return { tableAttrs, colgroupHtml, rows };
}

function extractRegimenName(blockRows: string[]): string | null {
  for (const row of blockRows) {
    const rowText = normalizeText(htmlToText(row));
    const hit = rowText.match(/治療メニュー\s*[:：]\s*(.+)$/);
    if (hit?.[1]) return hit[1].trim();
  }
  return null;
}

function buildBlockTableHtml(parsed: ParsedTable, blockRows: string[]): string {
  const inner = `${parsed.colgroupHtml}${blockRows.join('')}`;
  return `<table${parsed.tableAttrs}>${inner}</table>`;
}

function splitSheetToBlocks(department: string, sheetHtml: string): ImportBlock[] {
  const parsed = parseSheetHtml(sheetHtml);
  if (!parsed) return [];

  const startIndexes: number[] = [];
  parsed.rows.forEach((rowHtml, idx) => {
    const rowText = normalizeText(htmlToText(rowHtml));
    if (rowText.includes(START_KEYWORD)) {
      startIndexes.push(idx);
    }
  });

  if (!startIndexes.length) return [];

  const blocks: ImportBlock[] = [];
  startIndexes.forEach((startIdx, i) => {
    const endExclusive = i + 1 < startIndexes.length ? startIndexes[i + 1] : parsed.rows.length;
    const blockRows = parsed.rows.slice(startIdx, endExclusive);
    const regimenName = extractRegimenName(blockRows);
    if (!regimenName) return;

    blocks.push({
      department,
      regimenName,
      sheetName: `${department}#${i + 1}`,
      contentHtml: buildBlockTableHtml(parsed, blockRows),
    });
  });

  return blocks;
}

router.get('/templates', async (_req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query<HandbookTemplateRow>(
      `SELECT id, department, regimen_name, sheet_name, content_html, source_file, created_at, updated_at
       FROM handbook_templates
       ORDER BY department, regimen_name`
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /handbook/templates error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/templates', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { department, regimen_name, sheet_name, content_html, source_file } = req.body as {
      department?: string;
      regimen_name?: string;
      sheet_name?: string | null;
      content_html?: string;
      source_file?: string | null;
    };

    if (!department?.trim() || !regimen_name?.trim() || !content_html?.trim()) {
      res.status(400).json({ error: 'department, regimen_name, content_html required' });
      return;
    }

    const { rows } = await pool.query<HandbookTemplateRow>(
      `INSERT INTO handbook_templates
         (department, regimen_name, sheet_name, content_html, source_file, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (department, regimen_name) DO UPDATE SET
         sheet_name = EXCLUDED.sheet_name,
         content_html = EXCLUDED.content_html,
         source_file = EXCLUDED.source_file,
         updated_at = NOW()
       RETURNING *`,
      [
        department.trim(),
        regimen_name.trim(),
        sheet_name?.trim() || null,
        content_html,
        source_file?.trim() || null,
      ]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error('POST /handbook/templates error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/templates/:id', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }

    const { department, regimen_name, sheet_name, content_html, source_file } = req.body as {
      department?: string;
      regimen_name?: string;
      sheet_name?: string | null;
      content_html?: string;
      source_file?: string | null;
    };

    if (!department?.trim() || !regimen_name?.trim() || !content_html?.trim()) {
      res.status(400).json({ error: 'department, regimen_name, content_html required' });
      return;
    }

    const { rows } = await pool.query<HandbookTemplateRow>(
      `UPDATE handbook_templates
       SET department = $2,
           regimen_name = $3,
           sheet_name = $4,
           content_html = $5,
           source_file = $6,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, department.trim(), regimen_name.trim(), sheet_name?.trim() || null, content_html, source_file?.trim() || null]
    );

    if (!rows.length) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    res.json(rows[0]);
  } catch (e) {
    console.error('PUT /handbook/templates/:id error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/templates/:id', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }

    await pool.query('DELETE FROM handbook_templates WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /handbook/templates/:id error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/import', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const inputPath = typeof req.body?.filePath === 'string' ? req.body.filePath.trim() : '';
  const filePath = inputPath || DEFAULT_SOURCE_FILE;

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: `file not found: ${filePath}` });
    return;
  }

  try {
    const workbook = XLSX.readFile(filePath, { cellStyles: true });
    const skipped: Array<{ sheet: string; reason: string }> = [];
    const importedBlocks: ImportBlock[] = [];

    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        skipped.push({ sheet: sheetName, reason: 'sheet not found' });
        return;
      }

      const html = XLSX.utils.sheet_to_html(sheet, { id: `sheet-${sheetName}` });
      const blocks = splitSheetToBlocks(sheetName, html);

      if (!blocks.length) {
        skipped.push({ sheet: sheetName, reason: 'regimen block not found' });
        return;
      }

      importedBlocks.push(...blocks);
    });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(`DELETE FROM handbook_templates WHERE source_file = $1`, [filePath]);

      for (const block of importedBlocks) {
        await client.query(
          `INSERT INTO handbook_templates
             (department, regimen_name, sheet_name, content_html, source_file, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (department, regimen_name) DO UPDATE SET
             sheet_name = EXCLUDED.sheet_name,
             content_html = EXCLUDED.content_html,
             source_file = EXCLUDED.source_file,
             updated_at = NOW()`,
          [block.department, block.regimenName, block.sheetName, block.contentHtml, filePath]
        );
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.json({ imported: importedBlocks.length, skipped });
  } catch (e) {
    console.error('POST /handbook/import error:', e);
    res.status(500).json({ error: 'import failed' });
  }
});

export default router;
