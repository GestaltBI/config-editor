import { Component, computed } from '@angular/core';
import type { ColDef } from 'ag-grid-community';

import { ConfigStoreService } from '../core/config-store.service';

const PREVIEW_ROWS = 500;

interface ParseResult {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
}

@Component({
  standalone: false,
  selector: 'sbi-data-preview',
  templateUrl: './data-preview.component.html',
  styleUrls: ['./data-preview.component.scss'],
})
export class DataPreviewComponent {
  /** Parse only the first PREVIEW_ROWS rows so loading a 50K-row dataset
   *  doesn't kill the UI thread. */
  readonly parsed = computed<ParseResult | null>(() => {
    const csv = this.store.dataCsv();
    if (!csv) return null;
    return parseCsv(csv, PREVIEW_ROWS);
  });

  readonly columnDefs = computed<ColDef[]>(() => {
    const p = this.parsed();
    if (!p) return [];
    return p.headers.map((h) => ({
      field: h,
      headerName: h,
      sortable: true,
      filter: true,
      resizable: true,
      minWidth: 140,
    }));
  });

  readonly defaultColDef: ColDef = {
    cellStyle: { display: 'flex', alignItems: 'center' },
  };

  constructor(public store: ConfigStoreService) {}
}

/**
 * Minimal CSV parser sufficient for preview: comma-separated, double-quoted
 * fields with embedded commas / newlines / escaped quotes, CRLF or LF.
 * Stops emitting rows once `limit` is reached but still counts total rows.
 */
function parseCsv(text: string, limit: number): ParseResult {
  const rows: string[][] = [];
  const len = text.length;
  let i = 0;
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let total = 0;

  while (i < len) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      row.push(field);
      field = '';
      // skip CR in CRLF
      if (ch === '\r' && text[i + 1] === '\n') i += 2;
      else i++;

      total++;
      if (rows.length < limit) rows.push(row);
      row = [];
      continue;
    }
    field += ch;
    i++;
  }

  // trailing field / row
  if (field.length || row.length) {
    row.push(field);
    total++;
    if (rows.length < limit) rows.push(row);
  }

  if (rows.length === 0) return { headers: [], rows: [], totalRows: 0 };

  const headers = rows[0];
  const dataRows: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) obj[headers[c]] = rows[r][c] ?? '';
    dataRows.push(obj);
  }
  // total includes the header row in raw count; subtract 1 for actual rows
  return { headers, rows: dataRows, totalRows: Math.max(0, total - 1) };
}
