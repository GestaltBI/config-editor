import { Component, computed, signal } from '@angular/core';

import { ConfigStoreService, ProcessSpec } from '../core/config-store.service';

const BUILTIN_OPS = [
  'clear',
  'format',
  'globalfilter',
  'localfilter',
  'enhance',
  'geocode',
  'geojsonify',
  'diffcalc',
  'heatmap',
  'regionify',
  'aggregate',
  'noop',
] as const;

interface NodeRow {
  name: string;
  spec: ProcessSpec;
}

@Component({
  standalone: false,
  selector: 'sbi-processing-editor',
  templateUrl: './processing-editor.component.html',
  styleUrls: ['./processing-editor.component.scss'],
})
export class ProcessingEditorComponent {
  readonly ops = BUILTIN_OPS;

  readonly nodes = computed<NodeRow[]>(() => {
    const proc = this.store.processing()?.process ?? {};
    return Object.entries(proc).map(([name, spec]) => ({ name, spec }));
  });

  readonly selectedName = signal<string | null>(null);
  readonly selected = computed<NodeRow | null>(() => {
    const name = this.selectedName();
    if (!name) return null;
    return this.nodes().find((n) => n.name === name) ?? null;
  });

  /** JSON view text — bound when the user opens raw mode. */
  readonly jsonText = signal<string>('');
  readonly rawMode = signal(false);

  constructor(public store: ConfigStoreService) {}

  select(name: string): void {
    this.selectedName.set(name);
  }

  addNode(): void {
    const proc = this.store.processing() ?? { process: {} };
    let i = 1;
    let name = `step_${i}`;
    while (proc.process[name]) name = `step_${++i}`;
    proc.process[name] = { op: 'noop', options: {} };
    this.store.processing.set({ ...proc, process: { ...proc.process } });
    this.store.markDirty();
    this.selectedName.set(name);
  }

  removeNode(name: string): void {
    const proc = this.store.processing();
    if (!proc) return;
    const next = { ...proc.process };
    delete next[name];
    this.store.processing.set({ ...proc, process: next });
    this.store.markDirty();
    if (this.selectedName() === name) this.selectedName.set(null);
  }

  updateOp(name: string, op: string): void {
    this.patch(name, { op });
  }

  updateRequire(name: string, requireText: string): void {
    const require = requireText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    this.patch(name, { require });
  }

  updateOptions(name: string, optionsText: string): void {
    let options: any;
    try {
      options = optionsText.trim() ? JSON.parse(optionsText) : {};
    } catch {
      return; // ignore malformed JSON; the textarea stays as the user left it
    }
    this.patch(name, { options });
  }

  enterRaw(): void {
    this.jsonText.set(JSON.stringify(this.store.processing() ?? { process: {} }, null, 2));
    this.rawMode.set(true);
  }

  applyRaw(): void {
    try {
      const parsed = JSON.parse(this.jsonText());
      if (!parsed || typeof parsed !== 'object' || !parsed.process) {
        throw new Error('Expected { process: { ... } }');
      }
      this.store.processing.set(parsed);
      this.store.markDirty();
      this.rawMode.set(false);
    } catch (e: any) {
      alert(`Invalid JSON: ${e.message ?? e}`);
    }
  }

  cancelRaw(): void {
    this.rawMode.set(false);
  }

  private patch(name: string, patch: Partial<ProcessSpec>): void {
    const proc = this.store.processing();
    if (!proc) return;
    const next = { ...proc.process };
    next[name] = { ...next[name], ...patch };
    this.store.processing.set({ ...proc, process: next });
    this.store.markDirty();
  }

  optionsText(node: NodeRow): string {
    return JSON.stringify(node.spec.options ?? {}, null, 2);
  }

  requireText(node: NodeRow): string {
    return (node.spec.require ?? []).join(', ');
  }
}
