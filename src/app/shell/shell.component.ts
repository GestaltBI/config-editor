import { Component, HostBinding, HostListener, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ConfigStoreService } from '../core/config-store.service';
import { CsvInferService } from '../core/csv-infer.service';

@Component({
  standalone: false,
  selector: 'sbi-shell',
  templateUrl: './shell.component.html',
  styleUrls: ['./shell.component.scss'],
})
export class ShellComponent {
  /** Visible-while-dragging overlay flag. Driven by a counter so we
   *  don't flicker when the cursor moves over child elements. */
  readonly dragging = signal(false);
  private dragDepth = 0;

  constructor(
    public store: ConfigStoreService,
    private infer: CsvInferService,
    private snack: MatSnackBar,
  ) {}

  @HostBinding('class.shell-host--dragging') get isDragging(): boolean {
    return this.dragging();
  }

  @HostListener('dragenter', ['$event'])
  onDragEnter(e: DragEvent): void {
    if (!hasFiles(e)) return;
    e.preventDefault();
    this.dragDepth++;
    this.dragging.set(true);
  }

  @HostListener('dragover', ['$event'])
  onDragOver(e: DragEvent): void {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }

  @HostListener('dragleave', ['$event'])
  onDragLeave(e: DragEvent): void {
    if (!hasFiles(e)) return;
    e.preventDefault();
    this.dragDepth = Math.max(0, this.dragDepth - 1);
    if (this.dragDepth === 0) this.dragging.set(false);
  }

  @HostListener('drop', ['$event'])
  async onDrop(e: DragEvent): Promise<void> {
    if (!hasFiles(e)) return;
    e.preventDefault();
    this.dragDepth = 0;
    this.dragging.set(false);

    const file = pickCsvFile(e.dataTransfer?.files);
    if (!file) {
      this.snack.open('Drop a single .csv file to scaffold structure / mapping / labels.', 'OK', {
        duration: 5000,
      });
      return;
    }

    if (!this.store.isLoaded()) {
      this.snack.open(
        'Open a folder or repo first — the inferred config has to live somewhere before it can be saved.',
        'OK',
        { duration: 6000 },
      );
      return;
    }

    try {
      const text = await file.text();
      const report = this.infer.ingest(text, this.store);
      const parts: string[] = [];
      if (report.added.structure) parts.push(`+${report.added.structure} columns`);
      if (report.added.mapping) parts.push(`+${report.added.mapping} mappings`);
      if (report.added.labels) parts.push(`+${report.added.labels} labels`);
      const summary =
        parts.length > 0
          ? `Imported ${report.rows} rows · ${parts.join(' · ')}`
          : `Imported ${report.rows} rows · nothing new to add`;
      this.snack.open(summary, 'OK', { duration: 6000 });
    } catch (err: any) {
      this.snack.open(`Could not read CSV: ${err.message ?? err}`, 'Dismiss', { duration: 8000 });
    }
  }
}

function hasFiles(e: DragEvent): boolean {
  const types = e.dataTransfer?.types;
  if (!types) return false;
  for (let i = 0; i < types.length; i++) {
    if (types[i] === 'Files') return true;
  }
  return false;
}

function pickCsvFile(files: FileList | null | undefined): File | null {
  if (!files || files.length === 0) return null;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (f.name.toLowerCase().endsWith('.csv') || f.type === 'text/csv') return f;
  }
  return null;
}
