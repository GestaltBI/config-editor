import { Component, computed } from '@angular/core';
import type { ColDef } from 'ag-grid-community';

import { ConfigStoreService } from '../core/config-store.service';

interface LabelEntry {
  column: string;
  label: string;
}

@Component({
  standalone: false,
  selector: 'sbi-labels-editor',
  templateUrl: './labels-editor.component.html',
  styleUrls: ['./labels-editor.component.scss'],
})
export class LabelsEditorComponent {
  /** All canonical column codes from structure.json. */
  readonly canonical = computed<string[]>(() =>
    (this.store.structure()?.columns ?? []).map((c) => c.column),
  );

  /** Labels are stored as a flat { column: label } record. We surface
   *  it as a row array for ag-grid editing. */
  readonly rowData = computed<LabelEntry[]>(() => {
    const labels = this.store.labels() ?? {};
    return Object.entries(labels).map(([column, label]) => ({ column, label }));
  });

  /** Canonical columns missing from the labels dictionary — what
   *  "Scaffold from structure" will fill in. */
  readonly missing = computed<string[]>(() => {
    const have = new Set(Object.keys(this.store.labels() ?? {}));
    return this.canonical().filter((c) => !have.has(c));
  });

  /** Labels keys with no matching column in structure.json (orphans). */
  readonly orphans = computed<string[]>(() => {
    const known = new Set(this.canonical());
    return Object.keys(this.store.labels() ?? {}).filter((k) => !known.has(k));
  });

  readonly columnDefs: ColDef[] = [
    {
      field: 'column',
      headerName: 'Column code',
      editable: true,
      flex: 1,
      minWidth: 220,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: () => ({ values: this.canonical() }),
    },
    {
      field: 'label',
      headerName: 'Display label',
      editable: true,
      flex: 2,
      minWidth: 280,
    },
  ];

  readonly defaultColDef: ColDef = {
    sortable: true,
    resizable: true,
    cellStyle: { display: 'flex', alignItems: 'center' },
  };

  constructor(public store: ConfigStoreService) {}

  onCellValueChanged(): void {
    // Reflect the row edits back into the flat dictionary in the store.
    // ag-grid mutated rowData in place; we re-derive from it.
    const grid: HTMLElement | null = document.querySelector('ag-grid-angular');
    // Fall back: re-read all rows by re-collecting the in-memory rowData.
    // Since the rowData() is computed from labels(), we instead update
    // labels() directly from the current rows we hand to the grid.
    this.commitRows(this.rowData());
  }

  addRow(): void {
    const labels = { ...(this.store.labels() ?? {}) };
    let i = 1;
    let key = `new_column_${i}`;
    while (key in labels) key = `new_column_${++i}`;
    labels[key] = '';
    this.store.labels.set(labels);
    this.store.markDirty();
  }

  removeSelected(api: any): void {
    const labels = { ...(this.store.labels() ?? {}) };
    for (const row of api.getSelectedRows() as LabelEntry[]) {
      delete labels[row.column];
    }
    this.store.labels.set(labels);
    this.store.markDirty();
  }

  scaffoldFromStructure(): void {
    const labels = { ...(this.store.labels() ?? {}) };
    for (const code of this.missing()) {
      labels[code] = labels[code] ?? humanize(code);
    }
    this.store.labels.set(labels);
    this.store.markDirty();
  }

  /**
   * Re-build the labels dict from a row array. Keeps insertion order
   * (Object key order). Skips rows with no key.
   */
  private commitRows(rows: LabelEntry[]): void {
    const labels: Record<string, string> = {};
    for (const r of rows) {
      if (r.column) labels[r.column] = r.label ?? '';
    }
    this.store.labels.set(labels);
    this.store.markDirty();
  }
}

/** Best-effort: turn `smartbi:product_code` into `Product code`. */
function humanize(code: string): string {
  const tail = code.includes(':') ? code.split(':').pop()! : code;
  return tail
    .replace(/[_:-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
