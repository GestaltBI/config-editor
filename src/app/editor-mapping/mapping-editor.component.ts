import { Component, computed } from '@angular/core';
import type { ColDef } from 'ag-grid-community';

import { ConfigStoreService } from '../core/config-store.service';

interface MappingEntry {
  column: string;
  target: string;
}

interface MappingFile {
  columns: MappingEntry[];
}

@Component({
  standalone: false,
  selector: 'sbi-mapping-editor',
  templateUrl: './mapping-editor.component.html',
  styleUrls: ['./mapping-editor.component.scss'],
})
export class MappingEditorComponent {
  /** Canonical column codes (sourced from structure.json). The dropdown for
   *  the target column uses these. */
  readonly canonicalCodes = computed<string[]>(() => {
    const cols = this.store.structure()?.columns ?? [];
    return cols.map((c) => c.column);
  });

  /** Raw column names extracted from the data.csv header line, if loaded.
   *  Used as autocomplete suggestions for the source column. */
  readonly rawColumns = computed<string[]>(() => {
    const csv = this.store.dataCsv();
    if (!csv) return [];
    const firstLine = csv.split(/\r?\n/)[0] ?? '';
    return firstLine.split(',').map((s) => s.trim().replace(/^"(.*)"$/, '$1')).filter(Boolean);
  });

  readonly rowData = computed<MappingEntry[]>(() => {
    const m = this.store.mapping() as MappingFile | null;
    return m?.columns ?? [];
  });

  readonly columnDefs: ColDef[] = [
    {
      field: 'column',
      headerName: 'Raw column (CSV header)',
      editable: true,
      flex: 1,
      minWidth: 220,
    },
    {
      field: 'target',
      headerName: 'Canonical target',
      editable: true,
      flex: 1,
      minWidth: 220,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: () => ({ values: this.canonicalCodes() }),
    },
  ];

  readonly defaultColDef: ColDef = {
    sortable: true,
    resizable: true,
    cellStyle: { display: 'flex', alignItems: 'center' },
  };

  readonly unmappedRaw = computed<string[]>(() => {
    const used = new Set(this.rowData().map((e) => e.column));
    return this.rawColumns().filter((r) => !used.has(r));
  });

  readonly unmappedTargets = computed<string[]>(() => {
    const used = new Set(this.rowData().map((e) => e.target));
    return this.canonicalCodes().filter((c) => !used.has(c));
  });

  constructor(public store: ConfigStoreService) {}

  onCellValueChanged(): void {
    this.store.markDirty();
  }

  addRow(): void {
    const m = (this.store.mapping() as MappingFile | null) ?? { columns: [] };
    const next: MappingFile = { columns: [...m.columns, { column: '', target: '' }] };
    this.store.mapping.set(next);
    this.store.markDirty();
  }

  removeSelected(api: any): void {
    const m = (this.store.mapping() as MappingFile | null) ?? { columns: [] };
    const selected: MappingEntry[] = api.getSelectedRows();
    if (!selected.length) return;
    const keys = new Set(selected.map((s) => `${s.column}|${s.target}`));
    const next: MappingFile = {
      columns: m.columns.filter((e) => !keys.has(`${e.column}|${e.target}`)),
    };
    this.store.mapping.set(next);
    this.store.markDirty();
  }

  /** Quick-fill: for each unmapped raw column, add a row with that column
   *  as source and an empty target — user picks the target via the dropdown. */
  scaffoldFromRaw(): void {
    const m = (this.store.mapping() as MappingFile | null) ?? { columns: [] };
    const next: MappingFile = {
      columns: [
        ...m.columns,
        ...this.unmappedRaw().map((column) => ({ column, target: '' })),
      ],
    };
    this.store.mapping.set(next);
    this.store.markDirty();
  }
}
