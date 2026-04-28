import { Component, computed } from '@angular/core';
import type { ColDef } from 'ag-grid-community';

import { ColumnSpec, ConfigStoreService } from '../core/config-store.service';

const TYPES = ['string', 'number', 'date', 'number:currency', 'geo:lat', 'geo:lon'] as const;

@Component({
  standalone: false,
  selector: 'sbi-structure-editor',
  templateUrl: './structure-editor.component.html',
  styleUrls: ['./structure-editor.component.scss'],
})
export class StructureEditorComponent {
  readonly columnDefs: ColDef[] = [
    {
      field: 'column',
      headerName: 'Column',
      editable: true,
      pinned: 'left',
      minWidth: 200,
      flex: 1,
    },
    {
      field: 'type',
      headerName: 'Type',
      editable: true,
      width: 180,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: { values: TYPES },
    },
    {
      field: 'tags',
      headerName: 'Tags',
      editable: true,
      flex: 2,
      minWidth: 280,
      valueFormatter: (p) => (Array.isArray(p.value) ? p.value.join(', ') : ''),
      valueParser: (p) =>
        typeof p.newValue === 'string'
          ? p.newValue
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : p.newValue,
    },
    {
      field: 'multi',
      headerName: 'Multi',
      editable: true,
      width: 100,
      cellEditor: 'agCheckboxCellEditor',
      cellRenderer: 'agCheckboxCellRenderer',
    },
    {
      field: 'required',
      headerName: 'Required',
      editable: true,
      width: 110,
      cellEditor: 'agCheckboxCellEditor',
      cellRenderer: 'agCheckboxCellRenderer',
    },
  ];

  readonly defaultColDef: ColDef = {
    sortable: true,
    resizable: true,
    cellStyle: { display: 'flex', alignItems: 'center' },
  };

  readonly rowData = computed<ColumnSpec[]>(() => this.store.structure()?.columns ?? []);
  readonly meta = computed(() => ({
    name: this.store.structure()?.name ?? '',
    version: this.store.structure()?.version ?? '1.0',
  }));

  constructor(public store: ConfigStoreService) {}

  onCellValueChanged(): void {
    // ag-grid mutates rowData in place; tell the store it's dirty.
    this.store.markDirty();
  }

  addRow(): void {
    const s = this.store.structure();
    if (!s) return;
    s.columns = [
      ...s.columns,
      { column: 'new_column', type: 'string', tags: [], multi: false, required: false },
    ];
    this.store.structure.set({ ...s });
    this.store.markDirty();
  }

  removeSelected(api: any): void {
    const s = this.store.structure();
    if (!s) return;
    const selectedRows: ColumnSpec[] = api.getSelectedRows();
    if (!selectedRows.length) return;
    const selectedKeys = new Set(selectedRows.map((r) => r.column));
    s.columns = s.columns.filter((c) => !selectedKeys.has(c.column));
    this.store.structure.set({ ...s });
    this.store.markDirty();
  }
}
