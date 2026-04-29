import { Injectable } from '@angular/core';

import { ColumnSpec, ConfigStoreService, StructureConfig } from './config-store.service';

export interface InferenceReport {
  totalColumns: number;
  rows: number;
  added: { structure: number; mapping: number; labels: number };
  delimiter: ',' | ';' | '\t';
}

interface InferredColumn {
  code: string;
  rawHeader: string;
  type: string;
  tags: string[];
  label: string;
}

const NUMERIC_RX = /^-?\d+([.,]\d+)?$/;
const ISO_DATE_RX = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}|$)/;
const EUR_DATE_RX = /^\d{2}[/-]\d{2}[/-]\d{4}/;
const BOOL_VALUES = new Set(['true', 'false', 'yes', 'no', 'sì', 'si', 't', 'f']);

const SAMPLE_LIMIT = 200;

const TAG_HEURISTICS: Array<{ rx: RegExp; tags: string[] }> = [
  { rx: /^(lat|latitudine)$/i, tags: ['uatu:dimension', 'uatu:dimension:geo', 'gcx:lat'] },
  { rx: /^(lon|lng|longitudine)$/i, tags: ['uatu:dimension', 'uatu:dimension:geo', 'gcx:lon'] },
  { rx: /(citt[aà]|city|comune)/i, tags: ['uatu:dimension', 'uatu:dimension:geo', 'gcx:city'] },
  { rx: /(region|regione)/i, tags: ['uatu:dimension', 'uatu:dimension:geo', 'gcx:region'] },
  { rx: /(country|paese|nazione|stato)/i, tags: ['uatu:dimension', 'uatu:dimension:geo', 'gcx:country'] },
  { rx: /(street|via|indirizzo|address)/i, tags: ['uatu:dimension', 'uatu:dimension:geo', 'gcx:street'] },
  { rx: /(postal|postcode|^zip$|^cap$)/i, tags: ['uatu:dimension', 'uatu:dimension:geo', 'gcx:postcode'] },
  { rx: /(province|provincia|^prov$)/i, tags: ['uatu:dimension', 'uatu:dimension:geo', 'gcx:province'] },
  { rx: /(date|data|timestamp|created|updated|when)/i, tags: ['uatu:dimension', 'uatu:dimension:time'] },
];

/**
 * Infer a structure / mapping / labels scaffold from a CSV and merge
 * it into the in-memory store. Existing entries are preserved — only
 * missing keys are added — so dropping a CSV is non-destructive.
 *
 * Detects `,`, `;`, or `\t` as the delimiter from the header row.
 * Type inference uses up to SAMPLE_LIMIT rows; tag heuristics match
 * common geo / time column names in IT and EN.
 */
@Injectable({ providedIn: 'root' })
export class CsvInferService {
  ingest(text: string, store: ConfigStoreService): InferenceReport {
    const stripped = stripBom(text);
    const { headers, rows, delimiter } = parseCsv(stripped);
    if (headers.length === 0) {
      throw new Error('CSV has no header row.');
    }
    const sample = rows.slice(0, SAMPLE_LIMIT);
    const inferred = headers.map((h, i) => inferColumn(h, sample.map((r) => r[i] ?? '')));

    // Always replace data.csv with the dropped contents — the rest is merge-only.
    store.dataCsv.set(stripped);

    const addedStructure = mergeStructure(store, inferred);
    const addedMapping = mergeMapping(store, inferred);
    const addedLabels = mergeLabels(store, inferred);

    store.markDirty();

    return {
      totalColumns: inferred.length,
      rows: rows.length,
      added: { structure: addedStructure, mapping: addedMapping, labels: addedLabels },
      delimiter,
    };
  }
}

// ─── merge helpers ─────────────────────────────────────────────────────

function mergeStructure(store: ConfigStoreService, inferred: InferredColumn[]): number {
  const prev = store.structure();
  const existing = new Set((prev?.columns ?? []).map((c) => c.column));
  const additions: ColumnSpec[] = inferred
    .filter((i) => !existing.has(i.code))
    .map((i) => ({ column: i.code, type: i.type, tags: i.tags }));
  const next: StructureConfig = prev
    ? { ...prev, columns: [...prev.columns, ...additions] }
    : {
        type: 'structure',
        version: '1',
        name: 'inferred',
        columns: inferred.map((i) => ({ column: i.code, type: i.type, tags: i.tags })),
      };
  store.structure.set(next);
  return prev ? additions.length : inferred.length;
}

function mergeMapping(store: ConfigStoreService, inferred: InferredColumn[]): number {
  const prev = (store.mapping() as Record<string, string> | null) ?? {};
  const next = { ...prev };
  let added = 0;
  for (const i of inferred) {
    if (next[i.rawHeader]) continue;
    next[i.rawHeader] = i.code;
    added++;
  }
  store.mapping.set(next);
  return added;
}

function mergeLabels(store: ConfigStoreService, inferred: InferredColumn[]): number {
  const prev = store.labels() ?? {};
  const next: Record<string, string> = { ...prev };
  let added = 0;
  for (const i of inferred) {
    if (next[i.code]) continue;
    next[i.code] = i.label;
    added++;
  }
  store.labels.set(next);
  return added;
}

// ─── parsing ───────────────────────────────────────────────────────────

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function detectDelimiter(firstLine: string): ',' | ';' | '\t' {
  const counts = {
    ',': (firstLine.match(/,/g) ?? []).length,
    ';': (firstLine.match(/;/g) ?? []).length,
    '\t': (firstLine.match(/\t/g) ?? []).length,
  };
  const winner = (Object.entries(counts) as Array<[',' | ';' | '\t', number]>)
    .sort((a, b) => b[1] - a[1])[0];
  return winner && winner[1] > 0 ? winner[0] : ',';
}

function parseCsv(text: string): { headers: string[]; rows: string[][]; delimiter: ',' | ';' | '\t' } {
  const firstLineEnd = text.indexOf('\n');
  const firstLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd);
  const delimiter = detectDelimiter(firstLine);

  const all: string[][] = [];
  const len = text.length;
  let i = 0;
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  while (i < len) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === delimiter) { row.push(field); field = ''; i++; continue; }
    if (ch === '\n' || ch === '\r') {
      row.push(field); field = '';
      if (ch === '\r' && text[i + 1] === '\n') i += 2; else i++;
      all.push(row); row = [];
      continue;
    }
    field += ch; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); all.push(row); }

  if (all.length === 0) return { headers: [], rows: [], delimiter };
  const [headers, ...rest] = all;
  const rows = rest.filter((r) => r.some((c) => c !== ''));
  return { headers, rows, delimiter };
}

// ─── inference ─────────────────────────────────────────────────────────

function inferColumn(rawHeader: string, samples: string[]): InferredColumn {
  const header = rawHeader.trim();
  const code = toSnake(header);
  const label = toLabel(header);
  const type = inferType(samples);
  const tags = inferTags(header, type);
  return { code, rawHeader: header, type, tags, label };
}

function toSnake(s: string): string {
  const ascii = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return ascii
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase() || 'col';
}

function toLabel(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}

function inferType(samples: string[]): string {
  const nonEmpty = samples.map((s) => (s ?? '').trim()).filter((s) => s.length > 0);
  if (nonEmpty.length === 0) return 'string';
  let nNum = 0, nDate = 0, nBool = 0;
  for (const v of nonEmpty) {
    if (NUMERIC_RX.test(v)) nNum++;
    if (ISO_DATE_RX.test(v) || EUR_DATE_RX.test(v)) nDate++;
    if (BOOL_VALUES.has(v.toLowerCase())) nBool++;
  }
  const total = nonEmpty.length;
  if (nDate / total > 0.8) return 'date';
  if (nNum / total > 0.8) return 'number';
  if (nBool / total > 0.95) return 'boolean';
  return 'string';
}

function inferTags(name: string, type: string): string[] {
  for (const h of TAG_HEURISTICS) {
    if (h.rx.test(name)) return h.tags;
  }
  if (type === 'number') return ['uatu:measure'];
  if (type === 'date') return ['uatu:dimension', 'uatu:dimension:time'];
  return ['uatu:dimension'];
}
