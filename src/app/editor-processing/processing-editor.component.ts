import {
  AfterViewInit,
  Component,
  computed,
  effect,
  ElementRef,
  Injector,
  OnDestroy,
  signal,
  ViewChild,
} from '@angular/core';

import { ConfigStoreService, ProcessSpec } from '../core/config-store.service';
import { GraphHandle, ProcessingGraphService } from './processing-graph.service';

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

type Mode = 'graph' | 'list' | 'raw';

@Component({
  standalone: false,
  selector: 'sbi-processing-editor',
  templateUrl: './processing-editor.component.html',
  styleUrls: ['./processing-editor.component.scss'],
})
export class ProcessingEditorComponent implements AfterViewInit, OnDestroy {
  readonly ops = BUILTIN_OPS;

  readonly mode = signal<Mode>('graph');

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

  readonly jsonText = signal<string>('');

  @ViewChild('graphHost') graphHost?: ElementRef<HTMLElement>;
  private graph?: GraphHandle;
  private graphRebuildPending = false;

  constructor(
    public store: ConfigStoreService,
    private graphService: ProcessingGraphService,
    private injector: Injector,
  ) {
    effect(() => {
      this.store.processing();
      if (this.graph && this.mode() === 'graph') {
        this.graphRebuildPending = true;
        queueMicrotask(() => this.maybeRebuildGraph());
      }
    });
  }

  async ngAfterViewInit(): Promise<void> {
    if (this.mode() === 'graph') {
      await this.mountGraph();
    }
  }

  async ngOnDestroy(): Promise<void> {
    await this.graph?.destroy();
  }

  async setMode(mode: Mode): Promise<void> {
    if (this.mode() === mode) return;
    this.mode.set(mode);
    if (mode === 'graph') {
      queueMicrotask(() => this.mountGraph());
    } else if (mode === 'raw') {
      this.jsonText.set(JSON.stringify(this.store.processing() ?? { process: {} }, null, 2));
    } else {
      await this.graph?.destroy();
      this.graph = undefined;
    }
  }

  private async mountGraph(): Promise<void> {
    if (this.graph || !this.graphHost) return;
    try {
      this.graph = await this.graphService.mount(this.graphHost.nativeElement, this.injector);
    } catch (e) {
      console.error('rete graph mount failed:', e);
      this.mode.set('list');
    }
  }

  private async maybeRebuildGraph(): Promise<void> {
    if (!this.graph || !this.graphRebuildPending) return;
    this.graphRebuildPending = false;
    await this.graph.rebuild();
  }

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
    for (const k of Object.keys(next)) {
      if (next[k].require?.includes(name)) {
        next[k] = { ...next[k], require: next[k].require!.filter((r) => r !== name) };
      }
    }
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
      return;
    }
    this.patch(name, { options });
  }

  applyRaw(): void {
    try {
      const parsed = JSON.parse(this.jsonText());
      if (!parsed || typeof parsed !== 'object' || !parsed.process) {
        throw new Error('Expected { process: { ... } }');
      }
      this.store.processing.set(parsed);
      this.store.markDirty();
      this.setMode('graph');
    } catch (e: any) {
      alert(`Invalid JSON: ${e.message ?? e}`);
    }
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
