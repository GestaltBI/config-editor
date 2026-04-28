import { Injectable, signal } from '@angular/core';

/** A single column in `structure.json`. */
export interface ColumnSpec {
  column: string;
  type: string;
  tags: string[];
  multi?: boolean;
  required?: boolean;
}

export interface StructureConfig {
  type: 'structure';
  version: string;
  name: string;
  columns: ColumnSpec[];
}

export interface ModeEntry {
  type: 'button' | 'divider';
  id?: string;
  labelKey?: string;
  icon?: string;
}

export interface ProcessSpec {
  op?: string;
  require?: string[];
  options?: any;
}

export interface ProcessConfig {
  process: Record<string, ProcessSpec>;
}

/**
 * Holds the current edit state of the six config files. Components subscribe
 * to the relevant signal and write back via the typed setters. Everything
 * here is just in-memory until the user clicks "push".
 */
@Injectable({ providedIn: 'root' })
export class ConfigStoreService {
  readonly structure = signal<StructureConfig | null>(null);
  readonly processing = signal<ProcessConfig | null>(null);
  readonly modes = signal<ModeEntry[]>([]);
  readonly mapping = signal<any>(null);
  readonly labels = signal<Record<string, string> | null>(null); // it.json — column-label dictionary
  readonly dataCsv = signal<string | null>(null);

  /** Source repo, set by the connect dialog. */
  readonly repoOrg = signal<string>('');
  readonly repoName = signal<string>('');
  readonly repoRef = signal<string>('master');

  /** True when all six files have been loaded (or stubbed) at least once. */
  readonly isLoaded = signal(false);
  /** Becomes true on any local edit, cleared after a successful push. */
  readonly isDirty = signal(false);

  reset(): void {
    this.structure.set(null);
    this.processing.set(null);
    this.modes.set([]);
    this.mapping.set(null);
    this.labels.set(null);
    this.dataCsv.set(null);
    this.isLoaded.set(false);
    this.isDirty.set(false);
  }

  markDirty(): void {
    this.isDirty.set(true);
  }
}
